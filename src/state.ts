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

/** Check if an element ID exists in any loaded page */
export function resolveElementPage(elementId: string): number | null {
  for (const [pageNum, page] of state.pages) {
    if (page.elements.some((el) => el.id === elementId)) return pageNum
  }
  return null
}
