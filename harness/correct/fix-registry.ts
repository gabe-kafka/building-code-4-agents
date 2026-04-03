import { loadFixPatterns, saveFixPatterns } from '../store/artifacts.ts'
import type { Mismatch } from '../compare/diff-types.ts'

interface FixPattern {
  type: string
  description: string
  chapter: number
  count: number
  lastSeen: string
}

/**
 * Learn from mismatches: accumulate common fix patterns that
 * transfer to subsequent chapters.
 */
export function learnFromMismatches(chapter: number, mismatches: Mismatch[]): void {
  const patterns = loadFixPatterns() as { patterns?: FixPattern[] }
  if (!patterns.patterns) patterns.patterns = []

  for (const m of mismatches) {
    // Look for an existing pattern of same type + similar description
    const existing = patterns.patterns.find(
      (p) => p.type === m.type && p.description === m.description
    )

    if (existing) {
      existing.count++
      existing.lastSeen = new Date().toISOString()
    } else {
      patterns.patterns.push({
        type: m.type,
        description: m.description,
        chapter,
        count: 1,
        lastSeen: new Date().toISOString(),
      })
    }
  }

  // Keep only patterns seen more than once (noise filter)
  patterns.patterns = patterns.patterns.filter((p) => p.count >= 2)

  saveFixPatterns(patterns)
}

/**
 * Get accumulated patterns for informing the next chapter's processing.
 */
export function getPatternSummary(): string {
  const patterns = loadFixPatterns() as { patterns?: FixPattern[] }
  if (!patterns.patterns || patterns.patterns.length === 0) return ''

  const sorted = patterns.patterns.sort((a, b) => b.count - a.count)
  return sorted
    .slice(0, 20)
    .map((p) => `- ${p.type} (${p.count}x): ${p.description}`)
    .join('\n')
}
