/**
 * Coefficient interpolator.
 * Parses table data and looks up values with linear interpolation.
 */

import type { PageElement } from '../src/types.ts'

export interface CoefficientResult {
  value: number
  interpolated: boolean
  sourceTable: string
  inputs: Record<string, string | number>
  note?: string
}

interface TableData {
  headers: string[]
  rows: { label: string; values: number[] }[]
}

/**
 * Parse a PageElement table into a structured lookup.
 * Assumes first column is the row label (e.g., height) and remaining columns are categories.
 */
function parseTable(el: PageElement): TableData | null {
  if (!el.columns || !el.rows) return null

  const headers = el.columns.slice(1) // skip first column (row labels)
  const rows: TableData['rows'] = []

  for (const row of el.rows) {
    if (row.length < 2) continue
    const label = row[0]
    const values = row.slice(1).map(v => {
      // Handle ranges like "0-15" — take midpoint, or parse single values
      const cleaned = v.replace(/[^\d.\-]/g, '')
      if (cleaned.includes('-') && !cleaned.startsWith('-')) {
        const [lo, hi] = cleaned.split('-').map(Number)
        if (!isNaN(lo) && !isNaN(hi)) return (lo + hi) / 2
      }
      const n = parseFloat(cleaned)
      return isNaN(n) ? 0 : n
    })
    rows.push({ label, values })
  }

  return { headers, rows }
}

/**
 * Look up a coefficient from a table with interpolation.
 *
 * For Table 26.10-1 (Kz):
 *   inputs: { height: 60, exposure: "B" }
 *   → finds the row for height=60 (or interpolates between nearest rows)
 *   → finds the column for exposure B
 *   → returns the value
 */
export function lookupCoefficient(
  tableEl: PageElement,
  inputs: Record<string, string | number>,
  tableRef: string
): CoefficientResult | null {
  const table = parseTable(tableEl)
  if (!table) return null

  // Determine which column to use
  let colIdx = 0
  const colInput = inputs.exposure ?? inputs.category ?? inputs.column ?? inputs.col
  if (colInput) {
    const colStr = String(colInput).toLowerCase()
    const idx = table.headers.findIndex(h => h.toLowerCase().includes(colStr))
    if (idx >= 0) colIdx = idx
  }

  // Determine which row to use — try numeric lookup with interpolation
  const rowInput = inputs.height ?? inputs.z ?? inputs.row ?? inputs.value
  if (rowInput !== undefined) {
    const target = typeof rowInput === 'number' ? rowInput : parseFloat(String(rowInput))
    if (!isNaN(target)) {
      return interpolateRow(table, colIdx, target, tableRef, inputs)
    }
  }

  // Exact label match
  const labelInput = inputs.label ?? inputs.row ?? inputs.height
  if (labelInput !== undefined) {
    const labelStr = String(labelInput).toLowerCase()
    const row = table.rows.find(r => r.label.toLowerCase().includes(labelStr))
    if (row && row.values[colIdx] !== undefined) {
      return {
        value: row.values[colIdx],
        interpolated: false,
        sourceTable: tableRef,
        inputs,
      }
    }
  }

  return null
}

function interpolateRow(
  table: TableData,
  colIdx: number,
  target: number,
  tableRef: string,
  inputs: Record<string, string | number>
): CoefficientResult | null {
  // Parse row labels as numbers
  const numericRows = table.rows
    .map(r => {
      const n = parseFloat(r.label.replace(/[^\d.\-]/g, ''))
      return { n, values: r.values }
    })
    .filter(r => !isNaN(r.n))
    .sort((a, b) => a.n - b.n)

  if (numericRows.length === 0) return null

  // Exact match
  const exact = numericRows.find(r => r.n === target)
  if (exact && exact.values[colIdx] !== undefined) {
    return {
      value: exact.values[colIdx],
      interpolated: false,
      sourceTable: tableRef,
      inputs,
    }
  }

  // Find bounding rows for interpolation
  let below = numericRows[0]
  let above = numericRows[numericRows.length - 1]

  for (const row of numericRows) {
    if (row.n <= target) below = row
    if (row.n >= target && row.n < above.n) above = row
  }

  if (below.n === above.n) {
    return {
      value: below.values[colIdx] ?? 0,
      interpolated: false,
      sourceTable: tableRef,
      inputs,
    }
  }

  // Linear interpolation
  const loVal = below.values[colIdx] ?? 0
  const hiVal = above.values[colIdx] ?? 0
  const fraction = (target - below.n) / (above.n - below.n)
  const value = loVal + fraction * (hiVal - loVal)

  return {
    value: Math.round(value * 1000) / 1000,
    interpolated: true,
    sourceTable: tableRef,
    inputs,
    note: `Interpolated between ${below.n} (${loVal}) and ${above.n} (${hiVal})`,
  }
}
