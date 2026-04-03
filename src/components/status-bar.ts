import { el } from '../lib/dom.ts'
import { state, on, setChapter } from '../state.ts'

export function createStatusBar(): HTMLElement {
  const bar = el('div', { className: 'status-bar' })

  function render() {
    const meta = state.chapterMeta
    const std = meta?.standard ?? '---'
    const title = meta?.title?.toUpperCase() ?? ''
    const pageLabel = `P.${state.currentPage}/${meta?.page_range.end ?? '?'}`

    bar.innerHTML = ''
    bar.append(
      el('span', { className: 'value' }, [std]),
      createChapterSelector(),
      el('span', { className: 'label' }, [title]),
      el('span', { className: 'value', style: 'margin-left:auto' }, [pageLabel]),
      createApiDot(),
    )
  }

  function createChapterSelector(): HTMLElement {
    const stdMeta = state.standards.get(state.activeStandard)
    if (!stdMeta || stdMeta.chapters.length <= 1) {
      return el('span', { className: 'label' }, [`CH.${state.activeChapter}`])
    }

    const select = el('select', { className: 'chapter-select' })
    for (const ch of stdMeta.chapters) {
      const isLoaded = ch.extraction_score > 0
      const opt = el('option', {
        value: String(ch.chapter),
        ...(ch.chapter === state.activeChapter ? { selected: 'selected' } : {}),
      }, [
        `CH.${ch.chapter}${!isLoaded ? ' (pending)' : ''}`,
      ])
      if (!isLoaded) opt.disabled = true
      select.append(opt)
    }
    select.addEventListener('change', () => {
      const ch = parseInt(select.value, 10)
      if (!isNaN(ch)) setChapter(state.activeStandard, ch)
    })
    return select
  }

  function createApiDot(): HTMLElement {
    const container = el('span', { className: 'api-state' })
    container.append(
      el('span', { className: 'dot' }),
      el('span', { className: 'label' }, ['MOCK']),
    )
    return container
  }

  on('page', render)
  on('chapter', render)
  on('init', render)
  render()

  return bar
}
