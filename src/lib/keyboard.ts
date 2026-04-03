import { state, setPage, toggleSidebar, setOverlay } from '../state.ts'
import { focusSearch, clearSearch } from '../components/search-bar.ts'

let gotoMode = false
let gotoBuffer = ''
let gotoTimeout: ReturnType<typeof setTimeout> | null = null

export function initKeyboard(): void {
  document.addEventListener('keydown', (e) => {
    // Intercept Ctrl-F / Cmd-F globally — redirect to our search
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault()
      focusSearch()
      return
    }

    // Don't capture when typing in input/select
    const tag = (e.target as HTMLElement).tagName
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (e.key === 'Escape') {
        clearSearch()
        ;(e.target as HTMLElement).blur()
        e.preventDefault()
      }
      return
    }

    // Goto mode: g then digits then Enter
    if (gotoMode) {
      if (/^\d$/.test(e.key)) {
        gotoBuffer += e.key
        resetGotoTimeout()
        e.preventDefault()
        return
      }
      if (e.key === 'Enter' || e.key === 'g') {
        commitGoto()
        e.preventDefault()
        return
      }
      // Any other key cancels goto
      cancelGoto()
    }

    switch (e.key) {
      case 'ArrowLeft':
        setPage(state.currentPage - 1)
        e.preventDefault()
        break
      case 'ArrowRight':
        setPage(state.currentPage + 1)
        e.preventDefault()
        break
      case 'g':
        gotoMode = true
        gotoBuffer = ''
        resetGotoTimeout()
        e.preventDefault()
        break
      case '/':
        focusSearch()
        e.preventDefault()
        break
      case 's':
        toggleSidebar()
        e.preventDefault()
        break
      case 'Escape':
        setOverlay(null)
        break
    }
  })
}

function resetGotoTimeout(): void {
  if (gotoTimeout) clearTimeout(gotoTimeout)
  gotoTimeout = setTimeout(commitGoto, 1500)
}

function commitGoto(): void {
  if (gotoBuffer) {
    const page = parseInt(gotoBuffer, 10)
    if (!isNaN(page)) setPage(page)
  }
  cancelGoto()
}

function cancelGoto(): void {
  gotoMode = false
  gotoBuffer = ''
  if (gotoTimeout) {
    clearTimeout(gotoTimeout)
    gotoTimeout = null
  }
}
