import type { PageDiff, ChapterProgress } from './diff-types.ts'
import { thresholds } from '../config.ts'

export function isApproved(diff: PageDiff): boolean {
  return diff.score >= thresholds.pageApproved
}

export function isFlagged(diff: PageDiff): boolean {
  return diff.score < thresholds.pageFlagged
}

export function chapterScore(progress: ChapterProgress): number {
  const pages = Object.values(progress.pages)
  if (pages.length === 0) return 0
  return pages.reduce((sum, p) => sum + p.score, 0) / pages.length
}

export function summarizeDiffs(diffs: PageDiff[]): void {
  const total = diffs.length
  const approved = diffs.filter(isApproved).length
  const flagged = diffs.filter(isFlagged).length
  const pending = total - approved - flagged
  const avgScore = diffs.reduce((s, d) => s + d.score, 0) / total

  console.log(`\n  Pages: ${total}  Approved: ${approved}  Flagged: ${flagged}  Pending: ${pending}`)
  console.log(`  Average Score: ${(avgScore * 100).toFixed(1)}%`)

  // Mismatch type breakdown
  const typeCounts: Record<string, number> = {}
  for (const diff of diffs) {
    for (const m of diff.mismatches) {
      typeCounts[m.type] = (typeCounts[m.type] ?? 0) + 1
    }
  }

  if (Object.keys(typeCounts).length > 0) {
    console.log('  Mismatch breakdown:')
    for (const [type, count] of Object.entries(typeCounts).sort(([, a], [, b]) => b - a)) {
      console.log(`    ${type}: ${count}`)
    }
  }
}
