import './style/reset.css'
import './style/tokens.css'
import './style/layout.css'
import './style/components.css'

import { state, dispatch, on, registerStandard, registerChapterPages, setChapter, setPage, buildReferenceIndex } from './state.ts'
import { asce722Meta } from './mock/ch26-meta.ts'
import type { Page } from './types.ts'
import { createDOMLayoutEngine } from './layout/engine.ts'
import { SearchEngine } from './lib/search.ts'
import { createStatusBar } from './components/status-bar.ts'
import { createKpiStrip } from './components/kpi-strip.ts'
import { createSearchBar, setSearchEngine } from './components/search-bar.ts'
import { createSidebar } from './components/sidebar.ts'
import { createPageReader } from './components/page-reader.ts'
import { createFigureOverlay } from './components/figure-overlay.ts'
import { initKeyboard } from './lib/keyboard.ts'
import { initRouter } from './lib/router.ts'

// Layout engine (pretext seam)
const layoutEngine = createDOMLayoutEngine()

// Mount UI immediately (shows loading state)
const app = document.getElementById('app')!

on('sidebar', () => {
  app.classList.toggle('sidebar-collapsed', !state.sidebarOpen)
})

app.append(
  createStatusBar(),
  createKpiStrip(),
  createSearchBar(),
  createSidebar(),
  createPageReader(layoutEngine),
)

document.body.append(createFigureOverlay())
initKeyboard()
initRouter()

// Load chapter data from static JSON files
async function loadChapterPages(chapter: number): Promise<Map<number, Page>> {
  const meta = asce722Meta.chapters.find((c) => c.chapter === chapter)
  if (!meta) return new Map()

  const pages = new Map<number, Page>()
  const fetches = []
  for (let p = meta.page_range.start; p <= meta.page_range.end; p++) {
    fetches.push(
      fetch(`/data/ch${chapter}/page-${p}.json`)
        .then((r) => r.ok ? r.json() as Promise<Page> : null)
        .then((page) => { if (page) pages.set(p, page) })
        .catch(() => { /* page doesn't exist, skip */ })
    )
  }
  await Promise.all(fetches)
  return pages
}

async function init(): Promise<void> {
  registerStandard(asce722Meta)

  // Load all chapters in parallel
  const loads = asce722Meta.chapters.map(async (ch) => {
    const pages = await loadChapterPages(ch.chapter)
    if (pages.size > 0) registerChapterPages('ASCE 7-22', ch.chapter, pages)
  })
  await Promise.all(loads)

  // Default to first chapter with data
  const firstLoaded = asce722Meta.chapters.find(
    (ch) => (state.chapterPages.get(`ASCE 7-22:${ch.chapter}`)?.size ?? 0) > 0
  )
  if (firstLoaded) {
    setChapter('ASCE 7-22', firstLoaded.chapter)
    buildReferenceIndex()
  }

  const searchEngine = new SearchEngine()
  searchEngine.buildIndex(state.pages)
  setSearchEngine(searchEngine)

  dispatch('init')
}

init()

// Harness hook — allows Puppeteer to inject page data and trigger renders
;(window as unknown as Record<string, unknown>).__harness = {
  loadPage: (pageJson: Page) => {
    state.pages.set(pageJson.page, pageJson)
    setPage(pageJson.page)
  },
  getState: () => state,
}
