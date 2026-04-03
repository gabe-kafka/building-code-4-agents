import { resolve } from 'path'

// --- Paths ---
const ROOT = resolve(import.meta.dirname, '..')
const V1_ROOT = resolve(ROOT, '..', 'bldg-code-2-json')

export const paths = {
  root: ROOT,
  v1Root: V1_ROOT,
  v1Runs: resolve(V1_ROOT, 'output', 'runs'),
  v1Pages: resolve(V1_ROOT, 'output', 'pages'),
  artifacts: resolve(ROOT, 'harness', 'artifacts'),
  dist: resolve(ROOT, 'dist'),
}

// --- Chapter offsets: ASCE page number of first page minus 1 ---
// V1 source.page is 1-indexed relative to chapter start
// ASCE absolute page = source.page + offset
export const chapterOffsets: Record<number, number> = {
  26: 260,  // page 1 in V1 = ASCE page 261
  27: 310,  // TODO: verify with actual PDF
  28: 346,
  29: 368,
  30: 388,
  31: 408,
  32: 428,
}

// --- V1 JSON file naming ---
export function v1JsonPath(chapter: number): string {
  return resolve(paths.v1Runs, `asce722-ch${chapter}-hybrid.json`)
}

export function v1PagesDir(chapter: number): string {
  return resolve(paths.v1Pages, `asce722-ch${chapter}`)
}

export function artifactsDir(chapter: number): string {
  return resolve(paths.artifacts, `ch${chapter}`)
}

// --- Thresholds ---
export const thresholds = {
  pageApproved: 0.95,
  pageFlagged: 0.90,
  maxIterations: 5,
  concurrency: 10,
}

// --- Model config ---
export const models = {
  enrichment: 'claude-sonnet-4-20250514',
  comparison: 'claude-sonnet-4-20250514',
}
