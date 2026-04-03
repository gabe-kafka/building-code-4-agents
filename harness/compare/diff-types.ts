export type MismatchType =
  | 'missing_element'
  | 'extra_element'
  | 'wrong_column'
  | 'wrong_type'
  | 'text_mismatch'
  | 'table_error'
  | 'figure_missing'
  | 'ordering_error'
  | 'boundary_error'

export type Severity = 'high' | 'medium' | 'low'

export interface Mismatch {
  type: MismatchType
  description: string
  location: { column: 'left' | 'right' | 'full'; y_approx: number }
  severity: Severity
  element_id: string | null
  suggestion: string
}

export interface PageDiff {
  page: number
  score: number
  mismatches: Mismatch[]
}

export type PageStatus = 'approved' | 'flagged' | 'pending'

export interface PageProgress {
  status: PageStatus
  score: number
  iterations: number
  lastDiff: PageDiff | null
}

export interface ChapterProgress {
  chapter: number
  pages: Record<number, PageProgress>
  averageScore: number
  approved: number
  flagged: number
  pending: number
}
