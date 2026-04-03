import { el } from '../lib/dom.ts'
import { state, on } from '../state.ts'
import { createElement } from './element.ts'
import { createPageNav } from './page-nav.ts'
import type { LayoutEngine, PageElement } from '../types.ts'

export function createPageReader(layoutEngine: LayoutEngine): HTMLElement {
  const reader = el('div', { className: 'page-reader' })
  const container = el('div', { className: 'page-container' })
  const nav = createPageNav()

  reader.append(container, nav)

  function render() {
    container.innerHTML = ''
    const page = state.pageData
    if (!page) {
      container.append(el('div', { style: 'padding:var(--sp-3);color:var(--muted)' }, [
        `No data for page ${state.currentPage}`,
      ]))
      return
    }

    // Page sheet — US Letter aspect ratio container
    const sheet = el('div', { className: 'page-sheet' })

    // Page header (outside columns — spans full width like the PDF header)
    const header = el('div', { className: 'page-header' }, [
      el('span', { className: 'page-num' }, [`PAGE ${page.page}`]),
      el('span', { className: 'page-section' }, [page.section_range.join(' \u2013 ')]),
    ])
    sheet.append(header)

    // Two-column body
    const body = el('div', { className: 'page-body' })
    const leftCol = el('div', { className: 'page-col page-col-left' })
    const rightCol = el('div', { className: 'page-col page-col-right' })
    body.append(leftCol, rightCol)

    // Continuation marker
    const prevPage = state.pages.get(state.currentPage - 1)
    const continuedSection = getContinuedSection(page.elements, prevPage ?? null)

    // Position elements via layout engine
    const width = container.clientWidth || 800
    const positioned = layoutEngine.positionElements(page.elements, width, 1056)

    // Track section headings per column
    let lastSectionLeft = ''
    let lastSectionRight = ''

    // Show continuation in whichever column has the first element
    if (continuedSection) {
      const sec = state.chapterMeta?.sections.find((s) => s.number === continuedSection)
      const title = sec ? `${sec.number} ${sec.title}` : continuedSection
      const marker = el('div', { className: 'section-heading continued' }, [`${title} (continued)`])
      const firstEl = page.elements[0]
      if (firstEl?.column === 'right') {
        rightCol.append(marker)
        lastSectionRight = continuedSection
      } else {
        leftCol.append(marker)
        lastSectionLeft = continuedSection
      }
    }

    for (const pos of positioned) {
      const data = pos.element
      const target = data.column === 'right' ? rightCol
        : data.column === 'full' ? body  // full-width: appended to body directly
        : leftCol

      // Section heading — only auto-generate if the element itself isn't a heading
      // (clone data includes headings as elements with heading: true)
      const lastSection = data.column === 'right' ? lastSectionRight : lastSectionLeft
      if (data.section !== lastSection && !data.heading) {
        const skipContinuation = lastSection === '' && data.section === continuedSection
        // Skip auto-heading if next element in this section is a heading
        const hasHeadingElement = page.elements.some(
          (e) => e.section === data.section && e.heading
        )
        if (!skipContinuation && !hasHeadingElement) {
          const sec = state.chapterMeta?.sections.find((s) => s.number === data.section)
          const title = sec ? `${sec.number} ${sec.title}` : data.section
          target.append(el('div', { className: 'section-heading' }, [title]))
        }
      }
      if (data.column === 'right') lastSectionRight = data.section
      else lastSectionLeft = data.section

      // For full-width elements, we need to pull them out of column flow
      // Append left+right cols to body first, then the full-width element, then new cols
      if (data.column === 'full') {
        // Insert a full-width row
        const fullRow = el('div', { className: 'page-full-row' })
        const elNode = createElement(data)
        maybeHighlight(elNode, data.id)
        fullRow.append(elNode)
        // We append this directly after the two-column body
        sheet.append(fullRow)
      } else {
        const elNode = createElement(data)
        maybeHighlight(elNode, data.id)
        target.append(elNode)
      }
    }

    sheet.append(body)

    // Page footer
    const footer = el('div', { className: 'page-footer' }, [
      el('span', { className: 'page-footer-num' }, [String(page.page)]),
    ])
    sheet.append(footer)

    container.append(sheet)
  }

  function maybeHighlight(node: HTMLElement, id: string): void {
    if (state.highlightElement === id) {
      node.classList.add('highlight')
      requestAnimationFrame(() => node.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    }
  }

  function getContinuedSection(elements: PageElement[], prevPage: typeof state.pageData): string | null {
    if (!prevPage || elements.length === 0) return null
    const firstSection = elements[0].section
    const prevLastSection = prevPage.elements[prevPage.elements.length - 1]?.section
    return firstSection === prevLastSection ? firstSection : null
  }

  on('page', render)
  on('highlight', render)
  on('init', render)
  render()

  return reader
}
