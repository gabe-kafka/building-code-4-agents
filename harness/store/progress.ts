import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { artifactsDir, thresholds } from '../config.ts'
import type { ChapterProgress, PageProgress, PageDiff } from '../compare/diff-types.ts'

function progressPath(chapter: number): string {
  return resolve(artifactsDir(chapter), 'progress.json')
}

export function loadProgress(chapter: number): ChapterProgress {
  const path = progressPath(chapter)
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, 'utf-8'))
  }
  return {
    chapter,
    pages: {},
    averageScore: 0,
    approved: 0,
    flagged: 0,
    pending: 0,
  }
}

export function saveProgress(progress: ChapterProgress): void {
  const path = progressPath(progress.chapter)
  // Recompute aggregates
  const pageEntries = Object.values(progress.pages)
  progress.approved = pageEntries.filter((p) => p.status === 'approved').length
  progress.flagged = pageEntries.filter((p) => p.status === 'flagged').length
  progress.pending = pageEntries.filter((p) => p.status === 'pending').length
  progress.averageScore = pageEntries.length > 0
    ? pageEntries.reduce((sum, p) => sum + p.score, 0) / pageEntries.length
    : 0

  writeFileSync(path, JSON.stringify(progress, null, 2))
}

export function updatePageProgress(
  chapter: number,
  pageNum: number,
  score: number,
  iterations: number,
  diff: PageDiff | null
): void {
  const progress = loadProgress(chapter)

  const status = score >= thresholds.pageApproved ? 'approved' as const
    : score < thresholds.pageFlagged ? 'flagged' as const
    : 'pending' as const

  const pageProgress: PageProgress = {
    status,
    score,
    iterations,
    lastDiff: diff,
  }

  progress.pages[pageNum] = pageProgress
  saveProgress(progress)
}

export function printStatus(chapter: number): void {
  const progress = loadProgress(chapter)
  console.log(`\nChapter ${chapter} — Average Score: ${(progress.averageScore * 100).toFixed(1)}%`)
  console.log(`  Approved: ${progress.approved}  Flagged: ${progress.flagged}  Pending: ${progress.pending}`)
  console.log('')

  const pages = Object.entries(progress.pages)
    .sort(([a], [b]) => Number(a) - Number(b))

  for (const [pageNum, p] of pages) {
    const icon = p.status === 'approved' ? 'OK' : p.status === 'flagged' ? '!!' : '..'
    const mismatches = p.lastDiff?.mismatches.length ?? 0
    console.log(`  p.${pageNum}  ${icon}  ${(p.score * 100).toFixed(0)}%  ${p.iterations} iter  ${mismatches} mismatches`)
  }
}
