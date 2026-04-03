import type { Page } from '../../src/types.ts'
import type { PageDiff } from '../compare/diff-types.ts'
import { thresholds } from '../config.ts'
import { screenshotTwinPage } from '../screenshot/twin-renderer.ts'
import { comparePages } from '../compare/vision-compare.ts'
import { applyFixes, isAutoFixable } from '../correct/auto-fix.ts'
import { savePage, saveDiff } from '../store/artifacts.ts'
import { updatePageProgress } from '../store/progress.ts'

export interface PageResult {
  page: Page
  status: 'approved' | 'flagged'
  score: number
  iterations: number
  lastDiff: PageDiff
}

/**
 * Recursive improvement loop for a single page.
 *
 * screenshot → compare → score → fix → repeat
 * Stops when: score >= threshold, no auto-fixable mismatches remain, or max iterations reached.
 */
export async function improvePage(
  page: Page,
  pdfPngPath: string,
  chapter: number,
  maxIterations: number = thresholds.maxIterations
): Promise<PageResult> {
  let currentPage = page
  let lastDiff: PageDiff = { page: page.page, score: 0, mismatches: [] }

  for (let iter = 0; iter < maxIterations; iter++) {
    console.log(`    Page ${page.page} — iteration ${iter}`)

    // Screenshot
    const twinPng = await screenshotTwinPage(currentPage, chapter, iter)

    // Compare
    lastDiff = await comparePages(pdfPngPath, twinPng, page.page)
    saveDiff(chapter, iter, lastDiff)

    console.log(`    Score: ${(lastDiff.score * 100).toFixed(0)}%  Mismatches: ${lastDiff.mismatches.length}`)

    // Check if approved
    if (lastDiff.score >= thresholds.pageApproved) {
      savePage(chapter, currentPage)
      updatePageProgress(chapter, page.page, lastDiff.score, iter + 1, lastDiff)
      return {
        page: currentPage,
        status: 'approved',
        score: lastDiff.score,
        iterations: iter + 1,
        lastDiff,
      }
    }

    // Check if any auto-fixable mismatches remain
    const fixable = lastDiff.mismatches.filter(isAutoFixable)
    if (fixable.length === 0) {
      console.log(`    No auto-fixable mismatches — flagging for review`)
      break
    }

    // Apply fixes
    const { page: fixedPage, result } = applyFixes(currentPage, lastDiff.mismatches)
    console.log(`    Applied ${result.applied} fixes, skipped ${result.skipped}`)
    for (const detail of result.details) {
      console.log(`      ${detail}`)
    }
    currentPage = fixedPage
  }

  // Didn't converge — flag
  savePage(chapter, currentPage)
  updatePageProgress(chapter, page.page, lastDiff.score, maxIterations, lastDiff)
  return {
    page: currentPage,
    status: 'flagged',
    score: lastDiff.score,
    iterations: maxIterations,
    lastDiff,
  }
}
