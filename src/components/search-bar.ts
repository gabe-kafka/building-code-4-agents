import { el } from '../lib/dom.ts'
import type { ElementType } from '../types.ts'
import { state, setFilterType, setPage, highlightEl, setSearchResults, on } from '../state.ts'
import type { SearchEngine } from '../lib/search.ts'

const TYPES: (ElementType | 'ALL')[] = [
  'ALL', 'provision', 'definition', 'formula', 'table', 'figure', 'exception', 'user_note', 'body',
]

let searchEngine: SearchEngine | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function setSearchEngine(engine: SearchEngine): void {
  searchEngine = engine
}

export function createSearchBar(): HTMLElement {
  const wrapper = el('div', { className: 'search-bar-wrapper' })
  const bar = el('div', { className: 'search-bar' })
  const resultsList = el('div', { className: 'search-results hidden' })

  const input = el('input', {
    type: 'text',
    placeholder: 'Search elements... (Ctrl-F)',
    id: 'search-input',
  })

  input.addEventListener('input', () => {
    state.searchQuery = input.value
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(runSearch, 200)
  })

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = ''
      state.searchQuery = ''
      setSearchResults([])
      input.blur()
    }
  })

  const typeSelect = el('select', { id: 'type-filter' })
  for (const t of TYPES) {
    const opt = el('option', { value: t }, [t === 'ALL' ? 'TYPE: ALL' : t.toUpperCase()])
    typeSelect.append(opt)
  }
  typeSelect.addEventListener('change', () => {
    const val = typeSelect.value
    setFilterType(val === 'ALL' ? null : val as ElementType)
    if (state.searchQuery) runSearch()
  })

  bar.append(input, typeSelect)
  wrapper.append(bar, resultsList)

  // Render search results
  function renderResults() {
    resultsList.innerHTML = ''
    const results = state.searchResults

    if (results.length === 0) {
      resultsList.classList.add('hidden')
      return
    }

    resultsList.classList.remove('hidden')

    for (const r of results) {
      const row = el('div', { className: 'search-result-row' }, [
        el('span', { className: `tag tag-${r.type}` }, [r.type.replace('_', ' ')]),
        el('span', { className: 'search-result-section' }, [r.section]),
        el('span', { className: 'search-result-snippet' }, [r.snippet]),
        el('span', { className: 'search-result-page' }, [`p.${r.page}`]),
      ])
      row.addEventListener('click', () => {
        setPage(r.page)
        highlightEl(r.id)
        resultsList.classList.add('hidden')
      })
      resultsList.append(row)
    }
  }

  on('search', renderResults)

  return wrapper
}

function runSearch(): void {
  if (!searchEngine) return
  const results = searchEngine.search(state.searchQuery, state.filterType)
  setSearchResults(results)
}

export function focusSearch(): void {
  const input = document.getElementById('search-input') as HTMLInputElement | null
  input?.focus()
}

export function clearSearch(): void {
  const input = document.getElementById('search-input') as HTMLInputElement | null
  if (input) {
    input.value = ''
    state.searchQuery = ''
    setSearchResults([])
  }
}
