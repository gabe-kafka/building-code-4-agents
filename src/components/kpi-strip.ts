import { el } from '../lib/dom.ts'
import { state, on, setFilterType } from '../state.ts'
import type { ElementType } from '../types.ts'

const KPI_TYPES: { type: ElementType; label: string }[] = [
  { type: 'provision', label: 'Provisions' },
  { type: 'definition', label: 'Definitions' },
  { type: 'formula', label: 'Formulas' },
  { type: 'table', label: 'Tables' },
  { type: 'figure', label: 'Figures' },
]

export function createKpiStrip(): HTMLElement {
  const strip = el('div', { className: 'kpi-strip' })

  function render() {
    strip.innerHTML = ''
    const meta = state.chapterMeta
    const counts = meta?.element_counts

    for (const { type, label } of KPI_TYPES) {
      const count = counts?.[type] ?? 0
      const item = el('div', { className: 'kpi-item' }, [
        el('span', { className: 'kpi-label' }, [label]),
        el('span', { className: 'kpi-value', style: `color:var(--el-${type})` }, [String(count)]),
        el('span', { className: 'kpi-sub' }, [meta ? `ch.${meta.chapter}` : '']),
      ])
      item.addEventListener('click', () => {
        setFilterType(state.filterType === type ? null : type)
      })
      strip.append(item)
    }

    // Page summary item
    const page = state.pageData
    const elCount = page?.elements.length ?? 0
    const sections = page?.section_range ? `${page.section_range[0]}\u2013${page.section_range[1]}` : ''
    const score = meta?.extraction_score ?? 0

    const summary = el('div', { className: 'kpi-item', style: 'flex:2' }, [
      el('span', { className: 'kpi-label' }, [
        `ELEMENTS ON PAGE: ${elCount}   SECTIONS: ${sections}   EXTRACTION: ${score}%`,
      ]),
    ])
    strip.append(summary)
  }

  on('page', render)
  on('filter', render)
  on('init', render)
  render()

  return strip
}
