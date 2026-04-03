import './style/reset.css'
import './style/tokens.css'
import './style/layout.css'
import './style/components.css'

import { state, dispatch, on, registerStandard, registerChapterPages, setChapter, setPage } from './state.ts'
import { mockStandard } from './mock/ch26-page363.ts'
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
async function loadChapter26(): Promise<void> {
  const meta = mockStandard
  registerStandard(meta)

  const ch26Pages = new Map<number, Page>()
  const start = meta.chapters[0].page_range.start
  const end = meta.chapters[0].page_range.end

  // Fetch all pages in parallel
  const fetches = []
  for (let p = start; p <= end; p++) {
    fetches.push(
      fetch(`/data/ch${meta.chapters[0].chapter}/page-${p}.json`)
        .then((r) => r.ok ? r.json() as Promise<Page> : null)
        .then((page) => { if (page) ch26Pages.set(p, page) })
        .catch(() => { /* page doesn't exist, skip */ })
    )
  }
  await Promise.all(fetches)

  registerChapterPages('ASCE 7-22', 26, ch26Pages)
  setChapter('ASCE 7-22', 26)

  // Build search index across all loaded pages
  const searchEngine = new SearchEngine()
  searchEngine.buildIndex(state.pages)
  setSearchEngine(searchEngine)

  dispatch('init')
}

loadChapter26()

// Harness hook — allows Puppeteer to inject page data and trigger renders
;(window as unknown as Record<string, unknown>).__harness = {
  loadPage: (pageJson: Page) => {
    state.pages.set(pageJson.page, pageJson)
    setPage(pageJson.page)
  },
  getState: () => state,
}
