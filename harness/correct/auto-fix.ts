import type { Page, PageElement, ElementType, ColumnPlacement } from '../../src/types.ts'
import type { Mismatch, MismatchType } from '../compare/diff-types.ts'

interface FixResult {
  applied: number
  skipped: number
  details: string[]
}

const AUTO_FIXABLE: Set<MismatchType> = new Set([
  'wrong_column',
  'extra_element',
  'ordering_error',
  'wrong_type',
])

export function isAutoFixable(mismatch: Mismatch): boolean {
  return AUTO_FIXABLE.has(mismatch.type)
}

export function applyFixes(page: Page, mismatches: Mismatch[]): { page: Page; result: FixResult } {
  let elements = [...page.elements]
  const result: FixResult = { applied: 0, skipped: 0, details: [] }

  for (const m of mismatches) {
    switch (m.type) {
      case 'wrong_column': {
        if (!m.element_id) { result.skipped++; break }
        const el = elements.find((e) => e.id === m.element_id)
        if (!el) { result.skipped++; break }
        const colMatch = m.suggestion.match(/\b(left|right|full)\b/i)
        if (colMatch) {
          el.column = colMatch[1].toLowerCase() as ColumnPlacement
          result.applied++
          result.details.push(`${m.element_id}: column → ${el.column}`)
        } else {
          result.skipped++
        }
        break
      }

      case 'extra_element': {
        if (!m.element_id) { result.skipped++; break }
        const before = elements.length
        elements = elements.filter((e) => e.id !== m.element_id)
        if (elements.length < before) {
          result.applied++
          result.details.push(`Removed ${m.element_id}`)
        } else {
          result.skipped++
        }
        break
      }

      case 'ordering_error': {
        // Re-sort by column then y_start
        elements.sort((a, b) => {
          if (a.bbox.y_start !== b.bbox.y_start) return a.bbox.y_start - b.bbox.y_start
          const colOrder = { full: 0, left: 1, right: 2 } as const
          return (colOrder[a.column] ?? 1) - (colOrder[b.column] ?? 1)
        })
        result.applied++
        result.details.push('Re-sorted elements by position')
        break
      }

      case 'wrong_type': {
        if (!m.element_id) { result.skipped++; break }
        const el = elements.find((e) => e.id === m.element_id)
        if (!el) { result.skipped++; break }
        const validTypes: Set<string> = new Set([
          'provision', 'definition', 'formula', 'table', 'figure', 'exception', 'user_note', 'body',
        ])
        const typeMatch = m.suggestion.match(/\b(provision|definition|formula|table|figure|exception|user_note|body)\b/)
        if (typeMatch && validTypes.has(typeMatch[1])) {
          el.type = typeMatch[1] as ElementType
          result.applied++
          result.details.push(`${m.element_id}: type → ${el.type}`)
        } else {
          result.skipped++
        }
        break
      }

      default:
        result.skipped++
    }
  }

  return { page: { ...page, elements }, result }
}

/** Add missing elements that were detected by vision enrichment */
export function addMissingElements(page: Page, missingElements: PageElement[]): Page {
  const elements = [...page.elements, ...missingElements]
  elements.sort((a, b) => a.bbox.y_start - b.bbox.y_start)
  return { ...page, elements }
}
