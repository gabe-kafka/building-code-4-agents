import { readFileSync } from 'fs'
import type { Page, PageElement, ElementType, ColumnPlacement, BBox } from '../../src/types.ts'
import { normalizeColumns, normalizeRows } from './table-normalizer.ts'

// --- V1 element shape (partial, fields we use) ---
interface V1Element {
  id: string
  type: string
  source: {
    standard: string
    chapter: number
    section: string
    page: number | null
  }
  title: string
  description?: string
  data: Record<string, unknown>
  parent_id?: string | null
  cross_references: string[]
  metadata: {
    extracted_by: string
    qc_status: string
    qc_notes?: string | null
  }
}

// --- Type reclassification ---
function reclassifyType(v1: V1Element): ElementType {
  const notes = v1.metadata.qc_notes?.toLowerCase() ?? ''
  const text = extractText(v1)

  // User notes
  if (text.startsWith('User Note:') || text.startsWith('USER NOTE:')) return 'user_note'

  // Exceptions
  if (text.startsWith('Exception:') || text.startsWith('EXCEPTION:')) return 'exception'

  // Headings / unclassified → body
  if (notes.includes('heading') || notes.includes('unclassified')) return 'body'

  // Map V1 types to V2 types
  const typeMap: Record<string, ElementType> = {
    provision: 'provision',
    definition: 'definition',
    formula: 'formula',
    table: 'table',
    figure: 'figure',
    reference: 'body',  // V2 has no "reference" type
    heading: 'body',
    body: 'body',
    user_note: 'user_note',
    exception: 'exception',
  }

  return typeMap[v1.type] ?? 'body'
}

// --- Extract text from type-specific data fields ---
function extractText(v1: V1Element): string {
  const d = v1.data
  switch (v1.type) {
    case 'provision':
    case 'exception':
    case 'user_note':
    case 'heading':
    case 'body':
      return String(d.rule ?? v1.title ?? '')
    case 'definition':
      return `${d.term ?? ''}: ${d.definition ?? ''}`.trim()
    case 'formula':
      return v1.title || String(d.expression ?? '')
    case 'table':
      return v1.title || ''
    case 'figure':
      return v1.title || String(d.description ?? '')
    case 'reference':
      return v1.title || String(d.target ?? '')
    default:
      return v1.title || ''
  }
}

// --- Placeholder spatial data ---
const PLACEHOLDER_BBOX: BBox = { x_start: 0, x_end: 0.48, y_start: 0, y_end: 0 }
const PLACEHOLDER_COLUMN: ColumnPlacement = 'left'

// --- Convert one V1 element to V2 PageElement ---
function convertElement(v1: V1Element): PageElement {
  const type = reclassifyType(v1)
  const text = extractText(v1)

  const el: PageElement = {
    id: v1.id,
    type,
    section: v1.source.section,
    text,
    cross_references: v1.cross_references ?? [],
    bbox: { ...PLACEHOLDER_BBOX },
    column: PLACEHOLDER_COLUMN,
    metadata: {
      extracted_by: v1.metadata.extracted_by,
      qc_status: v1.metadata.qc_status,
    },
  }

  // Type-specific fields
  if (type === 'formula') {
    el.expression = String(v1.data.expression ?? '')
    const params = v1.data.parameters
    if (params && typeof params === 'object' && !Array.isArray(params)) {
      el.parameters = Object.entries(params as Record<string, { unit?: string; source?: string }>)
        .map(([name, info]) => {
          const unit = info?.unit ? ` (${info.unit})` : ''
          return `${name}${unit}`
        })
    }
  }

  if (type === 'table') {
    const cols = v1.data.columns as Array<{ name: string; unit?: string }> | undefined
    const rows = v1.data.rows as Array<Record<string, unknown>> | undefined
    if (cols) el.columns = normalizeColumns(cols)
    if (cols && rows) el.rows = normalizeRows(rows, cols)
  }

  if (type === 'figure') {
    el.caption = v1.title || String(v1.data.description ?? '')
  }

  return el
}

// --- Main: convert V1 JSON file to V2 Page map ---
export function convertV1ToV2(v1JsonPath: string, pageOffset: number): Map<number, Page> {
  const raw = readFileSync(v1JsonPath, 'utf-8')
  const v1Elements: V1Element[] = JSON.parse(raw)

  // Group by absolute ASCE page number
  const pageGroups = new Map<number, PageElement[]>()

  for (const v1 of v1Elements) {
    if (v1.source.page === null) continue
    const absPage = v1.source.page + pageOffset
    const el = convertElement(v1)

    if (!pageGroups.has(absPage)) pageGroups.set(absPage, [])
    pageGroups.get(absPage)!.push(el)
  }

  // Build Page objects
  const pages = new Map<number, Page>()

  for (const [pageNum, elements] of pageGroups) {
    const sections = [...new Set(elements.map((e) => e.section))].sort()
    const page: Page = {
      standard: 'ASCE 7-22',
      chapter: v1Elements[0]?.source.chapter ?? 26,
      page: pageNum,
      section_range: [sections[0] ?? '', sections[sections.length - 1] ?? ''],
      elements,
    }
    pages.set(pageNum, page)
  }

  return pages
}

// --- Load V1 JSON and return raw elements (for inspection) ---
export function loadV1Elements(v1JsonPath: string): V1Element[] {
  return JSON.parse(readFileSync(v1JsonPath, 'utf-8'))
}
