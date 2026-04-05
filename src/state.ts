import type { Page, ChapterMeta, ElementType, SearchResult, StandardMeta } from './types.ts'

export interface AppState {
  // Multi-chapter
  activeStandard: string
  activeChapter: number
  standards: Map<string, StandardMeta>
  chapterPages: Map<string, Map<number, Page>> // key: "ASCE 7-22:26"

  // Current chapter
  chapterMeta: ChapterMeta | null
  pages: Map<number, Page>

  // Current page
  currentPage: number
  pageData: Page | null

  // UI
  sidebarOpen: boolean
  searchQuery: string
  searchResults: SearchResult[]
  filterType: ElementType | null
  overlayFigure: string | null
  highlightElement: string | null
  treeExpanded: Set<string>
}

type Listener = () => void

const listeners = new Map<string, Set<Listener>>()

export const state: AppState = {
  activeStandard: 'ASCE 7-22',
  activeChapter: 26,
  standards: new Map(),
  chapterPages: new Map(),

  chapterMeta: null,
  pages: new Map(),

  currentPage: 363,
  pageData: null,

  sidebarOpen: true,
  searchQuery: '',
  searchResults: [],
  filterType: null,
  overlayFigure: null,
  highlightElement: null,
  treeExpanded: new Set(),
}

export function on(event: string, fn: Listener): void {
  if (!listeners.has(event)) listeners.set(event, new Set())
  listeners.get(event)!.add(fn)
}

export function off(event: string, fn: Listener): void {
  listeners.get(event)?.delete(fn)
}

export function dispatch(event: string): void {
  listeners.get(event)?.forEach((fn) => fn())
  listeners.get('*')?.forEach((fn) => fn())
}

// --- Chapter key helper ---
function chapterKey(standard: string, chapter: number): string {
  return `${standard}:${chapter}`
}

// --- Register data ---
export function registerStandard(meta: StandardMeta): void {
  state.standards.set(meta.name, meta)
}

export function registerChapterPages(standard: string, chapter: number, pages: Map<number, Page>): void {
  state.chapterPages.set(chapterKey(standard, chapter), pages)
}

// --- Navigation ---
export function setChapter(standard: string, chapter: number): void {
  const stdMeta = state.standards.get(standard)
  if (!stdMeta) return

  const meta = stdMeta.chapters.find((c) => c.chapter === chapter)
  if (!meta) return

  state.activeStandard = standard
  state.activeChapter = chapter
  state.chapterMeta = meta

  const key = chapterKey(standard, chapter)
  state.pages = state.chapterPages.get(key) ?? new Map()
  state.currentPage = meta.page_range.start
  state.pageData = state.pages.get(state.currentPage) ?? null
  state.highlightElement = null

  // Auto-expand tree to this chapter
  state.treeExpanded.add(standard)
  state.treeExpanded.add(key)

  buildReferenceIndex()

  dispatch('chapter')
  dispatch('page')
}

export function setPage(page: number): void {
  if (!state.chapterMeta) return
  const { start, end } = state.chapterMeta.page_range
  if (page < start || page > end) return
  state.currentPage = page
  state.pageData = state.pages.get(page) ?? null
  state.highlightElement = null
  dispatch('page')
}

export function toggleSidebar(): void {
  state.sidebarOpen = !state.sidebarOpen
  dispatch('sidebar')
}

export function setFilterType(type: ElementType | null): void {
  state.filterType = type
  dispatch('filter')
}

export function setSearchResults(results: SearchResult[]): void {
  state.searchResults = results
  dispatch('search')
}

export function setOverlay(url: string | null): void {
  state.overlayFigure = url
  dispatch('overlay')
}

export function highlightEl(id: string | null): void {
  state.highlightElement = id
  dispatch('highlight')
}

export function toggleTreeNode(nodeId: string): void {
  if (state.treeExpanded.has(nodeId)) {
    state.treeExpanded.delete(nodeId)
  } else {
    state.treeExpanded.add(nodeId)
  }
  dispatch('tree')
}

// --- Ch26 reference resolution ---

interface RefTarget {
  page: number
  elementId: string | null
}

const refIndex = new Map<string, RefTarget>()
const negativeCache = new Set<string>()

/** Build reference index from current chapter's metadata and elements. Call after pages load. */
export function buildReferenceIndex(): void {
  refIndex.clear()
  negativeCache.clear()
  if (!state.chapterMeta) return

  const chapter = state.chapterMeta.chapter
  const prefix = `${chapter}.`

  refIndex.set(`${chapter}`, { page: state.chapterMeta.page_range.start, elementId: null })
  for (const sec of state.chapterMeta.sections) {
    const target = { page: sec.page, elementId: null }
    refIndex.set(sec.number, target)
    refIndex.set(`Section ${sec.number}`, target)
    refIndex.set(`Sections ${sec.number}`, target)
    refIndex.set(`C${sec.number}`, target)
  }

  // Scan elements: index figures, tables, formulas, and subsections not in metadata
  for (const [pageNum, page] of state.pages) {
    for (const el of page.elements) {
      if (!el.section.startsWith(prefix) && el.section !== `${chapter}`) continue

      if (el.type === 'figure') {
        const caption = el.caption || el.text
        const figMatch = caption.match(/Figure\s+(\d+\.\d[\w\-]*)/)
        if (figMatch) {
          const num = figMatch[1]
          const target = { page: pageNum, elementId: el.id }
          if (!refIndex.has(`Figure ${num}`)) refIndex.set(`Figure ${num}`, target)
          if (!refIndex.has(`Figures ${num}`)) refIndex.set(`Figures ${num}`, target)
          if (!refIndex.has(num)) refIndex.set(num, target)
          const baseMatch = num.match(/^(.+\d)[A-Z]$/)
          if (baseMatch) {
            const base = baseMatch[1]
            if (!refIndex.has(`Figure ${base}`)) refIndex.set(`Figure ${base}`, target)
            if (!refIndex.has(base)) refIndex.set(base, target)
          }
        }
      }

      if (el.type === 'table') {
        const title = el.text.replace(/\*\*/g, '')
        const tableMatch = title.match(/Table\s+(\d+\.\d[\w\-]*)/)
        if (tableMatch) {
          const num = tableMatch[1]
          const target = { page: pageNum, elementId: el.id }
          if (!refIndex.has(`Table ${num}`)) refIndex.set(`Table ${num}`, target)
          if (num.includes('-') && !refIndex.has(num)) refIndex.set(num, target)
        }
      }

      if (el.type === 'formula') {
        const eqMatch = (el.text || '').match(/\((\d+\.\d[\w.\-]*)\)/)
        if (eqMatch) {
          const num = eqMatch[1]
          const target = { page: pageNum, elementId: el.id }
          if (!refIndex.has(`Equation (${num})`)) refIndex.set(`Equation (${num})`, target)
          if (!refIndex.has(`Equations (${num})`)) refIndex.set(`Equations (${num})`, target)
          if (!refIndex.has(`(${num})`)) refIndex.set(`(${num})`, target)
          if (!refIndex.has(num)) refIndex.set(num, target)
        }
      }

      // Subsections not in chapter metadata
      if (!refIndex.has(el.section)) {
        const target = { page: pageNum, elementId: null }
        refIndex.set(el.section, target)
        refIndex.set(`Section ${el.section}`, target)
      }
    }
  }
}

/** Resolve a cross-reference string to a page (and optionally element). Ch26-only. */
export function resolveReference(ref: string): RefTarget | null {
  const direct = refIndex.get(ref)
  if (direct) return direct
  if (negativeCache.has(ref)) return null

  if (!state.chapterMeta) return null
  const ch = `${state.chapterMeta.chapter}`

  // Fallback: extract parent section from equation-style refs
  // e.g. "Equation (26.11-16)" → 26.11, "26.11-15a" → 26.11, "(26.11-15b)" → 26.11
  let secNum: string | null = null

  const eqMatch = ref.match(/^Equations?\s+\((\d+\.\d+)/)
  if (eqMatch && eqMatch[1].startsWith(`${ch}.`)) secNum = eqMatch[1]

  if (!secNum) {
    const parenMatch = ref.match(/^\((\d+\.\d+)/)
    if (parenMatch && parenMatch[1].startsWith(`${ch}.`)) secNum = parenMatch[1]
  }

  if (!secNum) {
    const bareMatch = ref.match(/^(\d+\.\d+)-/)
    if (bareMatch && bareMatch[1].startsWith(`${ch}.`)) secNum = bareMatch[1]
  }

  const result = secNum ? refIndex.get(secNum) ?? null : null
  if (!result) negativeCache.add(ref)
  return result
}
