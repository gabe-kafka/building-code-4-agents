export type ElementType =
  | 'provision'
  | 'definition'
  | 'formula'
  | 'table'
  | 'figure'
  | 'exception'
  | 'user_note'
  | 'body'

export type ColumnPlacement = 'left' | 'right' | 'full'

export interface BBox {
  x_start: number  // 0–1 normalized horizontal position
  x_end: number    // 0–1 normalized horizontal position
  y_start: number  // 0–1 normalized vertical position
  y_end: number    // 0–1 normalized vertical position
}

export interface PageElement {
  id: string
  type: ElementType
  section: string
  text: string
  cross_references: string[]
  bbox: BBox
  column: ColumnPlacement
  metadata?: { extracted_by: string; qc_status: string }
  heading?: boolean  // true if this element is a bold section heading/subtitle
  // formula
  expression?: string
  parameters?: string[]
  // table
  columns?: string[]
  rows?: string[][]
  // figure
  image_url?: string
  caption?: string
}

export interface Page {
  standard: string
  chapter: number
  page: number
  section_range: [string, string]
  elements: PageElement[]
}

export interface SectionEntry {
  number: string
  title: string
  page: number
  depth: number
}

export interface ChapterMeta {
  standard: string
  title: string
  chapter: number
  page_range: { start: number; end: number }
  sections: SectionEntry[]
  element_counts: Record<ElementType, number>
  extraction_score: number
}

// --- Search ---

export interface SearchResult {
  id: string
  type: ElementType
  section: string
  page: number
  chapter: number
  standard: string
  snippet: string
}

export interface StandardMeta {
  name: string
  chapters: ChapterMeta[]
}

// --- Layout engine interface (pretext seam) ---

export interface PositionedElement {
  element: PageElement
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutEngine {
  positionElements(
    elements: PageElement[],
    containerWidth: number,
    containerHeight: number
  ): PositionedElement[]
}
