/**
 * Step-by-step page cloner. One page at a time.
 *
 * Usage:
 *   npx tsx harness/step.ts 261
 *   npx tsx harness/step.ts 262
 *   npx tsx harness/step.ts next     # picks up where you left off
 *   npx tsx harness/step.ts status   # shows progress
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import { paths, chapterOffsets } from './config.ts'
import { clonePageFull, getV1TextHints } from './enrich/clone-page.ts'
import { sendMessage } from './lib/api.ts'
import { models } from './config.ts'
import type { Page } from '../src/types.ts'

const CHAPTER = 26
const OFFSET = chapterOffsets[CHAPTER] ?? 260
const PNG_DIR = resolve(paths.v1Root, 'output', 'pages', `asce722-ch${CHAPTER}`)
const DATA_DIR = resolve(paths.root, 'public', 'data', `ch${CHAPTER}`)
const PROGRESS_FILE = resolve(paths.artifacts, `ch${CHAPTER}`, 'step-progress.json')

interface Progress {
  completed: Record<number, { score: number; elements: number; iterations: number }>
  lastPage: number
}

function loadProgress(): Progress {
  if (existsSync(PROGRESS_FILE)) return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'))
  return { completed: {}, lastPage: OFFSET }
}

function saveProgress(p: Progress): void {
  mkdirSync(resolve(PROGRESS_FILE, '..'), { recursive: true })
  writeFileSync(PROGRESS_FILE, JSON.stringify(p, null, 2))
}

function getPageRange(): [number, number] {
  const pngs = readdirSync(PNG_DIR).filter(f => f.endsWith('.png')).length
  return [OFFSET + 1, OFFSET + pngs]
}

// --- Audit a page against its PDF ---
async function audit(pngPath: string, page: Page): Promise<{ score: number; issues: string[] }> {
  const imageData = readFileSync(pngPath).toString('base64')

  const summary = page.elements.map(e => {
    const h = e.heading ? '[H] ' : ''
    const b = e.text.includes('**') ? '[B] ' : ''
    let detail = `${h}${b}${e.type} [${e.column}] §${e.section}: "${e.text.slice(0, 80)}"`
    if (e.type === 'table' && e.columns) detail += ` | ${e.columns.length} cols, ${e.rows?.length ?? 0} rows`
    if (e.type === 'figure') detail += ` | ${e.image_url ? 'HAS IMG' : 'NO IMG'}`
    return detail
  }).join('\n')

  const text = await sendMessage({
    model: models.comparison,
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: imageData } },
        { type: 'text', text: `Audit this extraction of ASCE 7-22 page ${page.page}.

EXTRACTED (${page.elements.length} elements):
${summary}

CHECK:
1. Is all body text present and COMPLETE (not truncated)?
2. Are bold terms wrapped in **markers**?
3. Are section headings marked [H]?
4. Are figures atomic (one element, not duplicated as body text)?
5. Are tables complete with all rows?
6. Correct columns (left/right/full)?
7. Correct types (provision vs body vs definition)?

DO NOT flag: text inside figures as missing, page headers/footers, minor formatting.

Return JSON: { "score": 0.XX, "issues": ["issue 1", "issue 2"] }
If perfect: { "score": 1.0, "issues": [] }` },
      ],
    }],
  })

  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return { score: 0.5, issues: ['Could not parse audit'] }
  try {
    return JSON.parse(match[0])
  } catch {
    return { score: 0.5, issues: ['Audit JSON parse error'] }
  }
}

// --- Print page summary ---
function printSummary(page: Page): void {
  const types: Record<string, number> = {}
  let boldCount = 0
  let headingCount = 0
  for (const e of page.elements) {
    types[e.type] = (types[e.type] ?? 0) + 1
    if (e.text.includes('**')) boldCount++
    if (e.heading) headingCount++
  }

  console.log(`\n  ${page.elements.length} elements  |  ${boldCount} bold  |  ${headingCount} headings`)
  console.log(`  Types: ${Object.entries(types).map(([t, n]) => `${t}:${n}`).join('  ')}`)
  console.log(`  Sections: ${page.section_range.join(' – ')}`)
  console.log(`  Columns: ${page.elements.filter(e => e.column === 'left').length}L  ${page.elements.filter(e => e.column === 'right').length}R  ${page.elements.filter(e => e.column === 'full').length}F`)

  const figs = page.elements.filter(e => e.type === 'figure')
  if (figs.length > 0) {
    console.log(`  Figures: ${figs.map(f => f.caption?.slice(0, 40) ?? 'untitled').join(', ')}`)
  }
}

// --- Main ---
async function main() {
  const arg = process.argv[2]
  const [firstPage, lastPage] = getPageRange()
  const progress = loadProgress()

  // Status command
  if (arg === 'status') {
    console.log(`\nChapter ${CHAPTER}: pages ${firstPage}–${lastPage}\n`)
    for (let p = firstPage; p <= lastPage; p++) {
      const done = progress.completed[p]
      if (done) {
        const icon = done.score >= 0.95 ? 'OK' : done.score >= 0.8 ? '..' : '!!'
        console.log(`  p.${p}  ${icon}  ${(done.score * 100).toFixed(0)}%  ${done.elements} el  ${done.iterations} iter`)
      } else {
        console.log(`  p.${p}  --  not yet cloned`)
      }
    }
    const doneCount = Object.keys(progress.completed).length
    console.log(`\n  ${doneCount}/${lastPage - firstPage + 1} pages done`)
    return
  }

  // Determine which page to clone
  let pageNum: number
  if (arg === 'next') {
    pageNum = progress.lastPage + 1
    if (pageNum > lastPage) {
      console.log('All pages done!')
      return
    }
  } else {
    pageNum = parseInt(arg, 10)
    if (isNaN(pageNum)) {
      console.log('Usage: npx tsx harness/step.ts <page_number|next|status>')
      return
    }
  }

  const pngIndex = pageNum - OFFSET
  const pngPath = resolve(PNG_DIR, `page-${String(pngIndex).padStart(3, '0')}.png`)
  if (!existsSync(pngPath)) {
    console.error(`No PNG for page ${pageNum} (expected ${pngPath})`)
    return
  }

  console.log(`\n${'='.repeat(50)}`)
  console.log(`  PAGE ${pageNum}  (${pngIndex} of ${lastPage - firstPage + 1})`)
  console.log('='.repeat(50))

  // Step 1: Clone
  console.log('\n[1] Cloning (left + right columns)...')
  const hints = getV1TextHints(CHAPTER, pageNum)
  if (hints.length > 0) console.log(`  ${hints.length} V1 text hints loaded`)
  let page = await clonePageFull(CHAPTER, pageNum, hints)
  printSummary(page)

  // Step 2: Audit
  console.log('\n[2] Auditing against PDF...')
  let auditResult = await audit(pngPath, page)
  console.log(`  Score: ${(auditResult.score * 100).toFixed(0)}%`)
  if (auditResult.issues.length > 0) {
    for (const issue of auditResult.issues) {
      console.log(`  - ${issue}`)
    }
  }

  // Step 3: Re-clone if needed (max 2 retries)
  let iterations = 1
  for (let retry = 0; retry < 2 && auditResult.score < 0.95 && auditResult.issues.length > 0; retry++) {
    console.log(`\n[${3 + retry}] Re-cloning with ${auditResult.issues.length} fixes...`)
    page = await clonePageFull(CHAPTER, pageNum, hints)
    printSummary(page)

    console.log('  Re-auditing...')
    auditResult = await audit(pngPath, page)
    console.log(`  Score: ${(auditResult.score * 100).toFixed(0)}%`)
    if (auditResult.issues.length > 0) {
      for (const issue of auditResult.issues) {
        console.log(`  - ${issue}`)
      }
    }
    iterations++
  }

  // Step 4: Save
  console.log(`\n[DONE] Page ${pageNum}: ${(auditResult.score * 100).toFixed(0)}%  (${iterations} iteration${iterations > 1 ? 's' : ''})`)
  console.log(`  Saved to public/data/ch${CHAPTER}/page-${pageNum}.json`)
  console.log(`  Check: http://localhost:5176/#p${pageNum}`)

  // Update progress
  progress.completed[pageNum] = {
    score: auditResult.score,
    elements: page.elements.length,
    iterations,
  }
  progress.lastPage = Math.max(progress.lastPage, pageNum)
  saveProgress(progress)

  // Suggest next
  const nextUndone = Array.from({ length: lastPage - firstPage + 1 }, (_, i) => firstPage + i)
    .find(p => !progress.completed[p])
  if (nextUndone) {
    console.log(`\n  Next: npx tsx harness/step.ts ${nextUndone}`)
  } else {
    console.log('\n  All pages done!')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
