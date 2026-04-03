import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync, readdirSync } from 'fs'
import { resolve } from 'path'
import { models, paths } from '../config.ts'
import type { Page, PageElement, BBox, ColumnPlacement } from '../../src/types.ts'

const client = new Anthropic()

interface VisionTable {
  title: string
  columns: string[]
  rows: string[][]
  bbox: BBox
  column: ColumnPlacement
  /** IDs of elements that should be replaced by this table */
  replaces_element_ids: string[]
}

interface PageTableResult {
  page: number
  tables: VisionTable[]
}

/**
 * Ask vision to identify all tables on a page and extract their full content.
 */
async function locateTables(
  pagePngPath: string,
  pageNum: number,
  existingElements: Array<{ id: string; type: string; text: string }>
): Promise<PageTableResult> {
  const imageData = readFileSync(pagePngPath).toString('base64')

  const elementList = existingElements
    .map((e) => `- ID:${e.id} TYPE:${e.type} TEXT:"${e.text.slice(0, 60)}"`)
    .join('\n')

  const response = await client.messages.create({
    model: models.enrichment,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: imageData },
          },
          {
            type: 'text',
            text: `This is a page from ASCE 7-22 (a building code standard). Identify ALL tables on this page.

A table is any structured data with columns and rows — including small inline tables, footnote tables listing values for territories/locations, and formal numbered tables (e.g., "Table 26.6-1").

For each table found, extract:
1. title: The table title/caption (e.g., "Table 26.6-1 Wind Directionality Factor, Kd")
2. columns: Array of column header strings
3. rows: Array of row arrays (each row is an array of cell strings, matching columns order)
4. bbox: Normalized 0-1 bounding box tightly enclosing the table + its title
5. column: "left", "right", or "full"
6. replaces_element_ids: List of element IDs from below that this table should REPLACE (because they are fragments of this table that were incorrectly extracted as separate text blocks)

Current elements on this page:
${elementList}

Return ONLY valid JSON:
{
  "page": ${pageNum},
  "tables": [
    {
      "title": "...",
      "columns": ["Col1", "Col2"],
      "rows": [["val1", "val2"], ...],
      "bbox": { "x_start": 0.0, "x_end": 1.0, "y_start": 0.3, "y_end": 0.7 },
      "column": "full",
      "replaces_element_ids": ["ID1", "ID2"]
    }
  ]
}

If there are NO tables, return: { "page": ${pageNum}, "tables": [] }
Only include tables that are NOT already correctly represented in the element list as type "table" with proper columns and rows.`,
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error(`  Failed to parse table response for page ${pageNum}`)
    return { page: pageNum, tables: [] }
  }

  return JSON.parse(jsonMatch[0]) as PageTableResult
}

/**
 * For each page, identify missing tables via vision, replace fragmented bodys
 * with proper table elements.
 */
export async function extractChapterTables(chapter: number): Promise<void> {
  const pagesDir = resolve(paths.root, 'public', 'data', `ch${chapter}`)
  const pngDir = resolve(paths.v1Root, 'output', 'pages', `asce722-ch${chapter}`)
  const pageOffset = 362

  const pageFiles = readdirSync(pagesDir).filter((f) => f.endsWith('.json')).sort()
  let totalFixed = 0

  for (const pageFile of pageFiles) {
    const page: Page = JSON.parse(readFileSync(resolve(pagesDir, pageFile), 'utf-8'))
    const pngIndex = page.page - pageOffset
    const pngFile = `page-${String(pngIndex).padStart(3, '0')}.png`
    const pngPath = resolve(pngDir, pngFile)

    if (!readFileSync.length) continue
    try { readFileSync(pngPath); } catch { continue }

    // Check if this page might have missed tables:
    // Heuristic: pages with many short bodys in sequence often have fragmented tables
    const textBlocks = page.elements.filter((e) => e.type === 'body')
    const existingTables = page.elements.filter((e) => e.type === 'table' && e.columns && e.columns.length > 0)

    // Skip pages that already have well-formed tables and few text blocks
    if (textBlocks.length < 5 && existingTables.length > 0) continue

    console.log(`  p.${page.page}: scanning for tables (${textBlocks.length} bodys, ${existingTables.length} tables)...`)

    const elements = page.elements.map((e) => ({ id: e.id, type: e.type, text: e.text }))
    const result = await locateTables(pngPath, page.page, elements)

    if (result.tables.length === 0) continue

    for (const vTable of result.tables) {
      console.log(`    Found: "${vTable.title}" (${vTable.columns.length} cols, ${vTable.rows.length} rows, replaces ${vTable.replaces_element_ids.length} elements)`)

      // Remove the fragmented elements this table replaces
      const replaceSet = new Set(vTable.replaces_element_ids)
      page.elements = page.elements.filter((e) => !replaceSet.has(e.id))

      // Create proper table element
      const tableEl: PageElement = {
        id: `ASCE7-22-${chapter}-TBL-${page.page}-${totalFixed}`,
        type: 'table',
        section: page.section_range[0],
        text: vTable.title,
        cross_references: [],
        bbox: vTable.bbox,
        column: vTable.column,
        columns: vTable.columns,
        rows: vTable.rows,
        metadata: { extracted_by: 'vision', qc_status: 'pending' },
      }

      page.elements.push(tableEl)
      totalFixed++
    }

    // Re-sort
    page.elements.sort((a, b) => a.bbox.y_start - b.bbox.y_start)

    // Save
    writeFileSync(resolve(pagesDir, pageFile), JSON.stringify(page, null, 2))
  }

  console.log(`\nFixed ${totalFixed} tables across chapter ${chapter}.`)
}
