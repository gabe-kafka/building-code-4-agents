import type { Page, PageElement } from '../../src/types.ts'
import type { SpatialResult } from './vision-spatial.ts'

/**
 * Merge vision spatial data onto converted V2 page elements.
 * - Updates column + bbox for located elements
 * - Adds new elements for items vision found but V1 missed
 */
export function mergeSpatial(page: Page, spatial: SpatialResult): Page {
  const elements = [...page.elements]

  // Update located elements
  for (const loc of spatial.located) {
    const el = elements.find((e) => e.id === loc.id)
    if (el) {
      el.column = loc.column
      el.bbox = loc.bbox
    }
  }

  // Add missing elements (vision found, V1 didn't)
  for (const miss of spatial.missing) {
    const newEl: PageElement = {
      id: `${page.standard.replace(/\s+/g, '')}-${page.chapter}-VISION-${elements.length + 1}`,
      type: miss.type as PageElement['type'],
      section: page.section_range[0], // best guess
      text: miss.text,
      cross_references: [],
      bbox: miss.bbox,
      column: miss.column,
      metadata: { extracted_by: 'vision', qc_status: 'pending' },
    }
    elements.push(newEl)
  }

  // Sort by column order then y_start
  elements.sort((a, b) => {
    const colOrder = { full: 0, left: 1, right: 2 } as const
    const ca = colOrder[a.column] ?? 1
    const cb = colOrder[b.column] ?? 1
    if (a.bbox.y_start !== b.bbox.y_start) return a.bbox.y_start - b.bbox.y_start
    return ca - cb
  })

  return { ...page, elements }
}
