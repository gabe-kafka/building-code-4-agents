import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import { artifactsDir } from '../config.ts'
import type { Page } from '../../src/types.ts'
import type { PageDiff } from '../compare/diff-types.ts'

function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true })
}

// --- Page JSON ---
export function savePage(chapter: number, page: Page): void {
  const dir = resolve(artifactsDir(chapter), 'pages')
  ensureDir(dir)
  writeFileSync(resolve(dir, `page-${page.page}.json`), JSON.stringify(page, null, 2))
}

export function loadPage(chapter: number, pageNum: number): Page | null {
  const path = resolve(artifactsDir(chapter), 'pages', `page-${pageNum}.json`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

export function saveAllPages(chapter: number, pages: Map<number, Page>): void {
  for (const [, page] of pages) {
    savePage(chapter, page)
  }
}

// --- Twin screenshots ---
export function screenshotPath(chapter: number, pageNum: number, iteration: number): string {
  const dir = resolve(artifactsDir(chapter), 'twin-screenshots', `iter-${iteration}`)
  ensureDir(dir)
  return resolve(dir, `page-${pageNum}.png`)
}

// --- Diffs ---
export function saveDiff(chapter: number, iteration: number, diff: PageDiff): void {
  const dir = resolve(artifactsDir(chapter), 'diffs', `iter-${iteration}`)
  ensureDir(dir)
  writeFileSync(resolve(dir, `page-${diff.page}-diff.json`), JSON.stringify(diff, null, 2))
}

export function loadDiff(chapter: number, iteration: number, pageNum: number): PageDiff | null {
  const path = resolve(artifactsDir(chapter), 'diffs', `iter-${iteration}`, `page-${pageNum}-diff.json`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

// --- Fix patterns (cross-chapter) ---
export function saveFixPatterns(patterns: Record<string, unknown>): void {
  const path = resolve(artifactsDir(0).replace('/ch0', ''), 'fix-patterns.json')
  ensureDir(resolve(path, '..'))
  writeFileSync(path, JSON.stringify(patterns, null, 2))
}

export function loadFixPatterns(): Record<string, unknown> {
  const path = resolve(artifactsDir(0).replace('/ch0', ''), 'fix-patterns.json')
  if (!existsSync(path)) return {}
  return JSON.parse(readFileSync(path, 'utf-8'))
}

// --- Final approved pages ---
export function saveFinalPage(chapter: number, page: Page): void {
  const dir = resolve(artifactsDir(chapter), 'final-pages')
  ensureDir(dir)
  writeFileSync(resolve(dir, `page-${page.page}.json`), JSON.stringify(page, null, 2))
}
