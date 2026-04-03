import { el } from '../lib/dom.ts'
import { state, on, setPage, setChapter, toggleTreeNode } from '../state.ts'
import type { ChapterMeta, SectionEntry } from '../types.ts'

export function createSidebar(): HTMLElement {
  const sidebar = el('div', { className: 'sidebar' })

  function render() {
    sidebar.innerHTML = ''

    sidebar.append(el('div', { className: 'sidebar-header' }, ['Standards']))

    // Render each standard
    for (const [stdName, stdMeta] of state.standards) {
      const stdExpanded = state.treeExpanded.has(stdName)

      // Standard node
      const stdNode = el('div', { className: 'tree-node tree-standard' })
      const stdRow = el('div', { className: 'tree-row', 'data-depth': '0' }, [
        el('span', { className: `tree-arrow${stdExpanded ? ' expanded' : ''}` }, ['\u25B6']),
        el('span', { className: 'tree-label' }, [stdName]),
      ])
      stdRow.addEventListener('click', () => {
        toggleTreeNode(stdName)
      })
      stdNode.append(stdRow)

      // Chapter children
      if (stdExpanded) {
        for (const chMeta of stdMeta.chapters) {
          stdNode.append(renderChapter(stdName, chMeta))
        }
      }

      sidebar.append(stdNode)
    }

    // Jump-to section (dynamic from loaded data)
    const jumpEntries = computeJumpTo()
    if (jumpEntries.length > 0) {
      sidebar.append(el('div', { className: 'sidebar-divider' }))
      sidebar.append(el('div', { className: 'sidebar-header' }, ['Jump To']))
      for (const jt of jumpEntries) {
        const item = el('div', { className: 'sidebar-item' }, [
          el('span', { className: 'sec-num' }, [jt.label]),
          el('span', { className: 'sec-page' }, [`p.${jt.page}`]),
        ])
        item.addEventListener('click', () => setPage(jt.page))
        sidebar.append(item)
      }
    }

    // Scroll active node into view
    requestAnimationFrame(() => {
      const active = sidebar.querySelector('.tree-row.active')
      if (active) active.scrollIntoView({ block: 'nearest' })
    })
  }

  function renderChapter(stdName: string, chMeta: ChapterMeta): HTMLElement {
    const chKey = `${stdName}:${chMeta.chapter}`
    const isActive = state.activeStandard === stdName && state.activeChapter === chMeta.chapter
    const isExpanded = state.treeExpanded.has(chKey)
    const isLoaded = chMeta.extraction_score > 0

    const chNode = el('div', { className: 'tree-node' })

    const chRow = el('div', {
      className: `tree-row${isActive ? ' active' : ''}${!isLoaded ? ' dimmed' : ''}`,
      'data-depth': '1',
    }, [
      el('span', { className: `tree-arrow${isExpanded ? ' expanded' : ''}` }, ['\u25B6']),
      el('span', { className: 'tree-label' }, [`Ch.${chMeta.chapter}`]),
      el('span', { className: 'tree-sublabel' }, [chMeta.title]),
    ])

    chRow.addEventListener('click', () => {
      if (!isLoaded) {
        // Show "not yet available" briefly
        const indicator = el('div', { className: 'tree-unavailable' }, ['Not yet ingested'])
        chNode.append(indicator)
        setTimeout(() => indicator.remove(), 2000)
        return
      }
      toggleTreeNode(chKey)
      if (!isActive) {
        setChapter(stdName, chMeta.chapter)
      }
    })

    chNode.append(chRow)

    // Section children (only if expanded and loaded)
    if (isExpanded && isLoaded) {
      const sections = chMeta.sections
      const topLevel = sections.filter((s) => s.depth === 1)

      for (const sec of topLevel) {
        chNode.append(renderSection(sec, sections, chKey))
      }
    }

    return chNode
  }

  function renderSection(sec: SectionEntry, allSections: SectionEntry[], chKey: string): HTMLElement {
    const secKey = `${chKey}:${sec.number}`
    const children = allSections.filter((s) =>
      s.number.startsWith(sec.number + '.') &&
      s.depth === sec.depth + 1
    )
    const hasChildren = children.length > 0
    const isExpanded = state.treeExpanded.has(secKey)

    const isActive = state.pageData?.section_range &&
      sec.number >= state.pageData.section_range[0] &&
      sec.number <= state.pageData.section_range[1]

    const node = el('div', { className: 'tree-node' })
    const depth = sec.depth + 1 // +1 because chapter is depth 1

    const row = el('div', {
      className: `tree-row${isActive ? ' active' : ''}`,
      'data-depth': String(depth),
    }, [
      hasChildren
        ? el('span', { className: `tree-arrow${isExpanded ? ' expanded' : ''}` }, ['\u25B6'])
        : el('span', { className: 'tree-arrow-spacer' }),
      el('span', { className: 'sec-num' }, [sec.number]),
      el('span', { className: 'tree-sublabel' }, [sec.title]),
      el('span', { className: 'sec-page' }, [`p.${sec.page}`]),
    ])

    row.addEventListener('click', () => {
      if (hasChildren) toggleTreeNode(secKey)
      setPage(sec.page)
    })

    node.append(row)

    if (isExpanded && hasChildren) {
      for (const child of children) {
        node.append(renderSection(child, allSections, chKey))
      }
    }

    return node
  }

  function computeJumpTo(): { label: string; page: number }[] {
    const entries: { label: string; page: number }[] = []
    if (!state.pages || state.pages.size === 0) return entries

    const typeFirstPage = new Map<string, number>()
    for (const [pageNum, page] of state.pages) {
      for (const elem of page.elements) {
        if (!typeFirstPage.has(elem.type) || pageNum < typeFirstPage.get(elem.type)!) {
          typeFirstPage.set(elem.type, pageNum)
        }
      }
    }

    const labels: Record<string, string> = {
      definition: 'Definitions',
      table: 'Tables',
      figure: 'Figures',
      formula: 'Formulas',
    }

    for (const [type, label] of Object.entries(labels)) {
      const page = typeFirstPage.get(type)
      if (page !== undefined) {
        entries.push({ label, page })
      }
    }

    return entries
  }

  on('page', render)
  on('chapter', render)
  on('tree', render)
  on('init', render)
  render()

  return sidebar
}
