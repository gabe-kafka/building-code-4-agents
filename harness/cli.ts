import { program } from 'commander'
import { existsSync } from 'fs'
import { v1JsonPath, v1PagesDir, chapterOffsets } from './config.ts'
import { convertV1ToV2 } from './convert/v1-to-v2.ts'
import { saveAllPages } from './store/artifacts.ts'
import { printStatus } from './store/progress.ts'
import { processChapter } from './orchestrate/chapter.ts'
import { expandToChapters } from './orchestrate/expand.ts'
import { extractChapterFigures } from './enrich/extract-figures.ts'
import { auditChapter } from './enrich/audit-page.ts'
import { clonePageFull, getV1TextHints } from './enrich/clone-page.ts'
import { clonePageRecursive } from './orchestrate/clone-loop.ts'

program
  .name('harness')
  .description('Twin-verified extraction harness for building codes')
  .version('0.1.0')

program
  .command('convert')
  .description('Convert V1 extraction JSON to V2 Page format')
  .requiredOption('--chapter <number>', 'Chapter number', parseInt)
  .option('--offset <number>', 'Page offset (ASCE page of first page minus 1)', parseInt)
  .action(async (opts: { chapter: number; offset?: number }) => {
    const offset = opts.offset ?? chapterOffsets[opts.chapter]
    if (offset === undefined) {
      console.error(`No offset for chapter ${opts.chapter}. Provide --offset or add to config.ts`)
      process.exit(1)
    }

    const v1Path = v1JsonPath(opts.chapter)
    if (!existsSync(v1Path)) {
      console.error(`V1 JSON not found: ${v1Path}`)
      process.exit(1)
    }

    console.log(`Converting chapter ${opts.chapter} (offset: ${offset})...`)
    const pages = convertV1ToV2(v1Path, offset)
    saveAllPages(opts.chapter, pages)
    console.log(`Done. ${pages.size} pages saved.`)

    for (const [pageNum, page] of [...pages].sort(([a], [b]) => a - b)) {
      console.log(`  p.${pageNum}: ${page.elements.length} elements [${page.section_range.join('–')}]`)
    }
  })

program
  .command('improve')
  .description('Run full recursive improvement loop on a chapter')
  .requiredOption('--chapter <number>', 'Chapter number', parseInt)
  .option('--max-iterations <number>', 'Max iterations per page', parseInt, 5)
  .action(async (opts: { chapter: number; maxIterations: number }) => {
    // Check prerequisites
    if (!existsSync(v1PagesDir(opts.chapter))) {
      console.error(`Page PNGs not found at ${v1PagesDir(opts.chapter)}`)
      console.error('Run: python cli.py render --chapter', opts.chapter)
      process.exit(1)
    }

    console.log(`Building twin (vite build)...`)
    const { execSync } = await import('child_process')
    execSync('npx vite build', { stdio: 'inherit', cwd: process.cwd() })

    await processChapter(opts.chapter)
  })

program
  .command('status')
  .description('Show chapter progress')
  .requiredOption('--chapter <number>', 'Chapter number', parseInt)
  .action((opts: { chapter: number }) => {
    printStatus(opts.chapter)
  })

program
  .command('expand')
  .description('Process multiple chapters sequentially')
  .requiredOption('--chapters <numbers>', 'Comma-separated chapter numbers')
  .action(async (opts: { chapters: string }) => {
    const chapters = opts.chapters.split(',').map((s) => parseInt(s.trim()))

    console.log(`Building twin (vite build)...`)
    const { execSync } = await import('child_process')
    execSync('npx vite build', { stdio: 'inherit', cwd: process.cwd() })

    await expandToChapters(chapters)
  })

program
  .command('extract-figures')
  .description('Locate and crop figures from page PNGs using vision')
  .requiredOption('--chapter <number>', 'Chapter number', parseInt)
  .action(async (opts: { chapter: number }) => {
    const pngDir = v1PagesDir(opts.chapter)
    if (!existsSync(pngDir)) {
      console.error(`Page PNGs not found at ${pngDir}`)
      process.exit(1)
    }

    console.log(`Extracting figures for chapter ${opts.chapter}...`)
    await extractChapterFigures(opts.chapter)
  })

program
  .command('clone')
  .description('Clone a single page from PDF to digital twin via vision (one page at a time)')
  .requiredOption('--chapter <number>', 'Chapter number', parseInt)
  .requiredOption('--page <number>', 'ASCE page number', parseInt)
  .option('--no-hints', 'Skip V1 text hints')
  .action(async (opts: { chapter: number; page: number; hints: boolean }) => {
    const hints = opts.hints ? getV1TextHints(opts.chapter, opts.page) : []
    if (hints.length > 0) {
      console.log(`Using ${hints.length} V1 text hints for character accuracy`)
    }
    await clonePageFull(opts.chapter, opts.page, hints)
  })

program
  .command('clone-recursive')
  .description('Clone a page with self-audit: clone → audit → re-clone with feedback → repeat until score >= 0.95')
  .requiredOption('--chapter <number>', 'Chapter number', parseInt)
  .requiredOption('--page <number>', 'ASCE page number', parseInt)
  .option('--iterations <n>', 'Max audit iterations (default: 3)')
  .action(async (opts: { chapter: number; page: number; iterations?: string }) => {
    const maxIter = opts.iterations ? parseInt(opts.iterations, 10) : 3
    const result = await clonePageRecursive(opts.chapter, opts.page, maxIter)
    console.log(`\nResult: score ${(result.score * 100).toFixed(0)}%, ${result.iterations} iteration(s)`)
  })

program
  .command('clone-chapter')
  .description('Clone every page in a chapter with recursive self-audit')
  .requiredOption('--chapter <number>', 'Chapter number', parseInt)
  .option('--start <number>', 'Start page (default: first page)', parseInt)
  .option('--end <number>', 'End page (default: last page)', parseInt)
  .option('--iterations <n>', 'Max audit iterations per page (default: 3)')
  .option('--no-audit', 'Skip self-audit (single-pass clone only)')
  .action(async (opts: { chapter: number; start?: number; end?: number; iterations?: string; audit: boolean }) => {
    const offset = chapterOffsets[opts.chapter]
    if (offset === undefined) {
      console.error(`No offset for chapter ${opts.chapter}`)
      process.exit(1)
    }

    const { readdirSync } = await import('fs')
    const pngDir = v1PagesDir(opts.chapter)
    if (!existsSync(pngDir)) {
      console.error(`Page PNGs not found at ${pngDir}`)
      process.exit(1)
    }
    const pngCount = readdirSync(pngDir).filter((f: string) => f.endsWith('.png')).length
    const firstPage = opts.start ?? (offset + 1)
    const lastPage = opts.end ?? (offset + pngCount)
    const useAudit = opts.audit
    const maxIter = opts.iterations ? parseInt(opts.iterations, 10) : 3

    console.log(`Cloning chapter ${opts.chapter}: pages ${firstPage}–${lastPage} (${lastPage - firstPage + 1} pages)`)
    console.log(`Mode: ${useAudit ? `recursive self-audit (max ${maxIter} iterations)` : 'single-pass'}\n`)

    const results: Array<{ page: number; score: number; iterations: number }> = []

    for (let p = firstPage; p <= lastPage; p++) {
      try {
        if (useAudit) {
          const result = await clonePageRecursive(opts.chapter, p, maxIter)
          results.push({ page: p, score: result.score, iterations: result.iterations })
        } else {
          const hints = getV1TextHints(opts.chapter, p)
          await clonePageFull(opts.chapter, p, hints)
          results.push({ page: p, score: 0, iterations: 1 })
        }
        console.log('')
      } catch (err) {
        console.error(`  Page ${p} failed: ${err}\n`)
        results.push({ page: p, score: 0, iterations: 0 })
      }
    }

    // Summary
    if (useAudit && results.length > 0) {
      const scored = results.filter((r) => r.score > 0)
      const avg = scored.length > 0 ? scored.reduce((s, r) => s + r.score, 0) / scored.length : 0
      const approved = scored.filter((r) => r.score >= 0.95).length
      console.log(`\nChapter ${opts.chapter} complete.`)
      console.log(`  Average score: ${(avg * 100).toFixed(0)}%  Approved: ${approved}/${results.length}`)
      for (const r of results) {
        const icon = r.score >= 0.95 ? 'OK' : r.score >= 0.9 ? '..' : '!!'
        console.log(`  p.${r.page}  ${icon}  ${(r.score * 100).toFixed(0)}%  ${r.iterations} iter`)
      }
    }
  })

program
  .command('audit')
  .description('Audit pages: compare PDF against extracted data, fix missing tables/figures/types/columns')
  .requiredOption('--chapter <number>', 'Chapter number', parseInt)
  .option('--pages <numbers>', 'Comma-separated page numbers (default: all)')
  .action(async (opts: { chapter: number; pages?: string }) => {
    const pngDir = v1PagesDir(opts.chapter)
    if (!existsSync(pngDir)) {
      console.error(`Page PNGs not found at ${pngDir}`)
      process.exit(1)
    }

    const pageFilter = opts.pages
      ? opts.pages.split(',').map((s) => parseInt(s.trim()))
      : undefined

    console.log(`Auditing chapter ${opts.chapter}${pageFilter ? ` (pages: ${pageFilter.join(',')})` : ' (all pages)'}...`)
    await auditChapter(opts.chapter, pageFilter)
  })

program.parse()
