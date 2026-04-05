/**
 * Data loader and index builder.
 * Reads all page JSONs at startup, builds queryable indexes.
 */

import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import type { Page, PageElement, ElementType } from '../src/types.ts'

const DATA_ROOT = resolve(import.meta.dirname, '..', 'public', 'data')

export interface CodeIndex {
  /** All pages keyed by chapter:pageNum */
  pages: Map<string, Page>
  /** Elements grouped by type */
  byType: Map<ElementType, PageElement[]>
  /** Elements grouped by section number */
  bySection: Map<string, PageElement[]>
  /** Table elements keyed by table reference (e.g., "26.10-1") */
  tables: Map<string, PageElement>
  /** Formula elements keyed by equation reference */
  formulas: Map<string, PageElement>
  /** Definition elements keyed by lowercase term */
  definitions: Map<string, PageElement>
  /** Cross-reference graph: element ID → referenced IDs */
  refsFrom: Map<string, string[]>
  /** Reverse cross-reference graph: target → referencing element IDs */
  refsTo: Map<string, string[]>
  /** All elements flat */
  allElements: PageElement[]
  /** All sections sorted */
  allSections: string[]
}

export function loadIndex(): CodeIndex {
  const pages = new Map<string, Page>()
  const byType = new Map<ElementType, PageElement[]>()
  const bySection = new Map<string, PageElement[]>()
  const tables = new Map<string, PageElement>()
  const formulas = new Map<string, PageElement>()
  const definitions = new Map<string, PageElement>()
  const refsFrom = new Map<string, string[]>()
  const refsTo = new Map<string, string[]>()
  const allElements: PageElement[] = []

  // Load all chapter directories
  if (!existsSync(DATA_ROOT)) {
    console.error(`Data root not found: ${DATA_ROOT}`)
    return { pages, byType, bySection, tables, formulas, definitions, refsFrom, refsTo, allElements, allSections: [] }
  }

  const chapterDirs = readdirSync(DATA_ROOT).filter(d => d.startsWith('ch') && !d.includes('-'))

  for (const dir of chapterDirs) {
    const chapterPath = resolve(DATA_ROOT, dir)
    const files = readdirSync(chapterPath).filter(f => f.endsWith('.json'))

    for (const file of files) {
      const page: Page = JSON.parse(readFileSync(resolve(chapterPath, file), 'utf-8'))
      pages.set(`${page.chapter}:${page.page}`, page)

      for (const el of page.elements) {
        allElements.push(el)

        // By type
        const typeList = byType.get(el.type) ?? []
        typeList.push(el)
        byType.set(el.type, typeList)

        // By section
        if (el.section) {
          const secList = bySection.get(el.section) ?? []
          secList.push(el)
          bySection.set(el.section, secList)
        }

        // Tables — extract table number from text
        if (el.type === 'table' && el.text) {
          const tableMatch = el.text.match(/Table\s+([\d.]+-[\d]+[A-Za-z]?)/i)
          if (tableMatch) {
            tables.set(tableMatch[1], el)
          }
        }

        // Formulas — extract equation number
        if (el.type === 'formula' && el.text) {
          const eqMatch = el.text.match(/(?:Equation|Eq\.?)\s*\(?([\d.]+-[\d]+[a-z]?)\)?/i)
          if (eqMatch) {
            formulas.set(eqMatch[1], el)
          }
          // Also index by section
          if (el.section) {
            formulas.set(`section:${el.section}`, el)
          }
        }

        // Definitions — extract the defined term
        if (el.type === 'definition' && el.text) {
          const defMatch = el.text.match(/^\*?\*?([A-Z][A-Z\s,()-]+?)[:.]?\*?\*?\s/)
          if (defMatch) {
            definitions.set(defMatch[1].trim().toLowerCase(), el)
          }
        }

        // Cross-references
        if (el.cross_references.length > 0) {
          refsFrom.set(el.id, el.cross_references)
          for (const ref of el.cross_references) {
            const list = refsTo.get(ref) ?? []
            list.push(el.id)
            refsTo.set(ref, list)
          }
        }
      }
    }
  }

  const allSections = [...bySection.keys()].sort()

  console.error(`Loaded: ${pages.size} pages, ${allElements.length} elements, ${tables.size} tables, ${formulas.size} formulas, ${definitions.size} definitions`)

  return { pages, byType, bySection, tables, formulas, definitions, refsFrom, refsTo, allElements, allSections }
}

/**
 * Find elements matching a section prefix (e.g., "26.10" matches "26.10", "26.10.1", "26.10.2")
 */
export function elementsByPrefix(index: CodeIndex, prefix: string): PageElement[] {
  const results: PageElement[] = []
  for (const [section, elements] of index.bySection) {
    if (section === prefix || section.startsWith(prefix + '.')) {
      results.push(...elements)
    }
  }
  return results
}

/**
 * Simple text search across all elements.
 */
export function searchElements(
  index: CodeIndex,
  query: string,
  filterType?: ElementType,
  maxResults = 20
): PageElement[] {
  const q = query.toLowerCase()
  const scored: { el: PageElement; score: number }[] = []

  for (const el of index.allElements) {
    if (filterType && el.type !== filterType) continue

    const text = el.text.toLowerCase()
    let score = 0

    if (text.includes(q)) score += 10
    if (el.section.toLowerCase().includes(q)) score += 20

    // Token overlap
    const queryTokens = q.split(/\s+/)
    for (const qt of queryTokens) {
      if (text.includes(qt)) score += 2
    }

    if (score > 0) scored.push({ el, score })
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(s => s.el)
}
