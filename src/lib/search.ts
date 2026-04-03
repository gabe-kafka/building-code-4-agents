import type { Page, ElementType, SearchResult } from '../types.ts'

interface IndexEntry {
  id: string
  type: ElementType
  section: string
  page: number
  chapter: number
  standard: string
  text: string
  tokens: string[]
}

// Type priority for ranking (lower = higher rank)
const TYPE_RANK: Record<ElementType, number> = {
  definition: 0,
  provision: 1,
  formula: 2,
  table: 3,
  exception: 4,
  figure: 5,
  user_note: 6,
  body: 7,
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
}

function snippet(text: string, query: string, maxLen = 120): string {
  const lower = text.toLowerCase()
  const qLower = query.toLowerCase()
  const idx = lower.indexOf(qLower)
  if (idx === -1) return text.slice(0, maxLen) + (text.length > maxLen ? '...' : '')
  const start = Math.max(0, idx - 30)
  const end = Math.min(text.length, idx + query.length + 60)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < text.length ? '...' : ''
  return prefix + text.slice(start, end) + suffix
}

export class SearchEngine {
  private entries: IndexEntry[] = []

  buildIndex(pages: Map<number, Page>): void {
    this.entries = []
    for (const [, page] of pages) {
      for (const el of page.elements) {
        const fullText = [el.text, el.expression, el.caption].filter(Boolean).join(' ')
        this.entries.push({
          id: el.id,
          type: el.type,
          section: el.section,
          page: page.page,
          chapter: page.chapter,
          standard: page.standard,
          text: fullText,
          tokens: tokenize(fullText),
        })
      }
    }
  }

  search(
    query: string,
    filterType?: ElementType | null,
    sectionRange?: [string, string] | null,
    maxResults = 50
  ): SearchResult[] {
    if (!query.trim()) return []

    const queryTokens = tokenize(query)
    if (queryTokens.length === 0) return []

    const scored: { entry: IndexEntry; score: number }[] = []

    for (const entry of this.entries) {
      // Type filter
      if (filterType && entry.type !== filterType) continue

      // Section range filter
      if (sectionRange) {
        if (entry.section < sectionRange[0] || entry.section > sectionRange[1]) continue
      }

      // Score: count matching tokens + bonus for exact substring match
      let score = 0
      const lowerText = entry.text.toLowerCase()
      const lowerQuery = query.toLowerCase().trim()

      // Exact substring bonus
      if (lowerText.includes(lowerQuery)) {
        score += 10
      }

      // Section number match bonus
      if (entry.section.toLowerCase().includes(lowerQuery)) {
        score += 20
      }

      // Token overlap
      for (const qt of queryTokens) {
        for (const et of entry.tokens) {
          if (et === qt) { score += 3; break }
          if (et.startsWith(qt) || qt.startsWith(et)) { score += 1; break }
        }
      }

      if (score === 0) continue

      // Type rank bonus (definitions rank higher)
      score += (8 - TYPE_RANK[entry.type]) * 0.5

      scored.push({ entry, score })
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(({ entry }) => ({
        id: entry.id,
        type: entry.type,
        section: entry.section,
        page: entry.page,
        chapter: entry.chapter,
        standard: entry.standard,
        snippet: snippet(entry.text, query),
      }))
  }
}
