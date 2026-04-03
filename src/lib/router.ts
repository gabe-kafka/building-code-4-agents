import { state, setPage, setChapter, highlightEl, on } from '../state.ts'

export function initRouter(): void {
  applyHash()
  window.addEventListener('hashchange', applyHash)

  on('page', () => {
    const hash = `#p${state.currentPage}`
    if (window.location.hash !== hash) {
      history.replaceState(null, '', hash)
    }
  })
}

function applyHash(): void {
  const hash = window.location.hash.slice(1)
  if (!hash) return

  // #ch27-p415 — cross-chapter page
  const chapterPageMatch = hash.match(/^ch(\d+)-p(\d+)$/)
  if (chapterPageMatch) {
    const ch = parseInt(chapterPageMatch[1], 10)
    const page = parseInt(chapterPageMatch[2], 10)
    if (ch !== state.activeChapter) {
      setChapter(state.activeStandard, ch)
    }
    setPage(page)
    return
  }

  // #p363 — page number
  const pageMatch = hash.match(/^p(\d+)$/)
  if (pageMatch) {
    setPage(parseInt(pageMatch[1], 10))
    return
  }

  // #ASCE7-22-26.1.1-P1 — element ID
  for (const [, data] of state.pages) {
    const found = data.elements.find((el) => el.id === hash)
    if (found) {
      setPage(data.page)
      highlightEl(hash)
      return
    }
  }
}
