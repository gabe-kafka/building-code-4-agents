/**
 * Normalize V1 table data to V2 flat arrays.
 *
 * V1: columns = [{name: "Height", unit: "ft"}, ...], rows = [{Height: "15", ...}, ...]
 * V2: columns = ["Height (ft)", ...], rows = [["15", ...], ...]
 */
export function normalizeColumns(v1Columns: Array<{ name: string; unit?: string | null }>): string[] {
  return v1Columns.map((c) => {
    if (c.unit) return `${c.name} (${c.unit})`
    return c.name
  })
}

export function normalizeRows(
  v1Rows: Array<Record<string, unknown>>,
  v1Columns: Array<{ name: string }>
): string[][] {
  const colNames = v1Columns.map((c) => c.name)
  return v1Rows.map((row) =>
    colNames.map((name) => String(row[name] ?? ''))
  )
}
