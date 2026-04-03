import { el } from '../lib/dom.ts'
import { state, on, setPage } from '../state.ts'

export function createPageNav(): HTMLElement {
  const nav = el('div', { className: 'page-nav' })

  const prevBtn = el('button', {}, ['\u25C4 PREV'])
  const pageLabel = el('span', {})
  const nextBtn = el('button', {}, ['NEXT \u25BA'])

  prevBtn.addEventListener('click', () => setPage(state.currentPage - 1))
  nextBtn.addEventListener('click', () => setPage(state.currentPage + 1))

  nav.append(prevBtn, pageLabel, nextBtn)

  function render() {
    const meta = state.chapterMeta
    if (!meta) return
    prevBtn.disabled = state.currentPage <= meta.page_range.start
    nextBtn.disabled = state.currentPage >= meta.page_range.end
    pageLabel.textContent = `PAGE ${state.currentPage}`
  }

  on('page', render)
  on('init', render)
  render()

  return nav
}
