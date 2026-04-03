import { resolve } from 'path'
import { existsSync, readdirSync } from 'fs'
import pLimit from 'p-limit'
import type { Page } from '../../src/types.ts'
import { v1JsonPath, v1PagesDir, chapterOffsets, thresholds } from '../config.ts'
import { convertV1ToV2 } from '../convert/v1-to-v2.ts'
import { enrichPageSpatial } from '../enrich/vision-spatial.ts'
import { mergeSpatial } from '../enrich/merge-spatial.ts'
import { improvePage, type PageResult } from './loop.ts'
import { saveAllPages, saveFinalPage } from '../store/artifacts.ts'
import { learnFromMismatches } from '../correct/fix-registry.ts'
import { summarizeDiffs } from '../compare/scoring.ts'
import { shutdownRenderer } from '../screenshot/twin-renderer.ts'

export interface ChapterResult {
  chapter: number
  results: PageResult[]
  averageScore: number
}

/**
 * Process an entire chapter through the full pipeline:
 * convert → enrich → improve (per page) → learn patterns
 */
export async function processChapter(chapter: number): Promise<ChapterResult> {
  const offset = chapterOffsets[chapter]
  if (offset === undefined) {
    throw new Error(`No page offset configured for chapter ${chapter}. Add it to config.ts.`)
  }

  const v1Path = v1JsonPath(chapter)
  if (!existsSync(v1Path)) {
    throw new Error(`V1 JSON not found: ${v1Path}`)
  }

  const pagesDir = v1PagesDir(chapter)
  if (!existsSync(pagesDir)) {
    throw new Error(`Page PNGs not found: ${pagesDir}. Run: python cli.py render --chapter ${chapter}`)
  }

  // Step 1: Convert V1 → V2
  console.log(`\n[1/4] Converting V1 JSON → V2 Pages...`)
  const pages = convertV1ToV2(v1Path, offset)
  console.log(`  ${pages.size} pages converted`)

  // Step 2: Enrich with vision spatial data
  console.log(`\n[2/4] Enriching with vision spatial data...`)
  const limit = pLimit(thresholds.concurrency)
  const pngFiles = readdirSync(pagesDir).filter((f) => f.endsWith('.png')).sort()
  const pageNums = [...pages.keys()].sort((a, b) => a - b)

  const enrichedPages = new Map<number, Page>()

  await Promise.all(
    pageNums.map((pageNum, idx) =>
      limit(async () => {
        const page = pages.get(pageNum)!
        const pngIndex = idx // page PNGs are 1-indexed: page-001.png = first page
        const pngFile = pngFiles[pngIndex]
        if (!pngFile) {
          console.log(`  Page ${pageNum}: no PNG found (index ${pngIndex}), skipping enrichment`)
          enrichedPages.set(pageNum, page)
          return
        }

        const pngPath = resolve(pagesDir, pngFile)
        const elements = page.elements.map((e) => ({ id: e.id, type: e.type, text: e.text }))

        try {
          const spatial = await enrichPageSpatial(pngPath, elements)
          const enriched = mergeSpatial(page, spatial)
          enrichedPages.set(pageNum, enriched)
          console.log(`  Page ${pageNum}: ${spatial.located.length} located, ${spatial.missing.length} missing`)
        } catch (err) {
          console.error(`  Page ${pageNum}: enrichment failed — ${err}`)
          enrichedPages.set(pageNum, page)
        }
      })
    )
  )

  saveAllPages(chapter, enrichedPages)

  // Step 3: Build twin + run improvement loop
  console.log(`\n[3/4] Running improvement loop...`)
  const results: PageResult[] = []

  // Sequential to avoid Puppeteer conflicts (one browser at a time)
  for (const pageNum of pageNums) {
    const page = enrichedPages.get(pageNum)!
    const pngIndex = pageNums.indexOf(pageNum)
    const pngFile = pngFiles[pngIndex]
    if (!pngFile) continue

    const pdfPngPath = resolve(pagesDir, pngFile)
    const result = await improvePage(page, pdfPngPath, chapter)
    results.push(result)

    if (result.status === 'approved') {
      saveFinalPage(chapter, result.page)
    }
  }

  shutdownRenderer()

  // Step 4: Learn patterns
  console.log(`\n[4/4] Learning fix patterns...`)
  const allMismatches = results.flatMap((r) => r.lastDiff.mismatches)
  learnFromMismatches(chapter, allMismatches)

  const avgScore = results.reduce((s, r) => s + r.score, 0) / results.length
  console.log(`\nChapter ${chapter} complete.`)
  summarizeDiffs(results.map((r) => r.lastDiff))

  return { chapter, results, averageScore: avgScore }
}
