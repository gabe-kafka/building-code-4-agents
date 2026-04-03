import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import { models, paths, chapterOffsets } from '../config.ts'
import type { Page, PageElement, BBox, ColumnPlacement, ElementType } from '../../src/types.ts'

const client = new Anthropic()

interface AuditMissing {
  type: 'missing_table' | 'missing_figure' | 'missing_text' | 'missing_formula' | 'missing_definition'
  description: string
  element_type: ElementType
  column: ColumnPlacement
  bbox: BBox
  /** For tables: full extracted content */
  table_columns?: string[]
  table_rows?: string[][]
  /** For text/provisions: the text content */
  text?: string
  /** For figures: the caption */
  caption?: string
  figure_number?: string
  /** For formulas */
  expression?: string
  parameters?: string[]
  /** IDs of existing elements that are fragments of this missing item */
  fragment_ids?: string[]
}

interface AuditWrongType {
  element_id: string
  current_type: string
  correct_type: ElementType
  reason: string
}

interface AuditWrongColumn {
  element_id: string
  current_column: string
  correct_column: ColumnPlacement
}

interface PageAudit {
  page: number
  missing: AuditMissing[]
  wrong_type: AuditWrongType[]
  wrong_column: AuditWrongColumn[]
  score: number
}

/**
 * Comprehensive page audit: compare PDF page image against our extracted data.
 * Flags missing tables, figures, text, wrong types, wrong columns — everything.
 */
async function auditPage(
  pagePngPath: string,
  page: Page
): Promise<PageAudit> {
  const imageData = readFileSync(pagePngPath).toString('base64')

  const elementSummary = page.elements
    .map((e) => {
      let detail = `ID:${e.id} TYPE:${e.type} COL:${e.column} SEC:${e.section}`
      if (e.type === 'table' && e.columns) detail += ` COLS:[${e.columns.join(',')}] ROWS:${e.rows?.length ?? 0}`
      else detail += ` TEXT:"${e.text.slice(0, 60)}"`
      return `- ${detail}`
    })
    .join('\n')

  const response = await client.messages.create({
    model: models.enrichment,
    max_tokens: 8192,
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
            text: `You are auditing a digital twin of ASCE 7-22 page ${page.page}. Compare the PDF page image above against the extracted data below. Find EVERYTHING that is wrong or missing.

EXTRACTED DATA for page ${page.page}:
${elementSummary}

CHECK FOR:

1. **MISSING TABLES**: Any table visible in the PDF that is NOT in the data as type "table" with columns and rows. Common issue: tables extracted as multiple separate bodys instead of one table element. If you find fragmented bodys that should be a table, list their IDs in fragment_ids.

2. **MISSING FIGURES**: Any figure/diagram/chart/map visible in the PDF that is NOT in the data as type "figure".

3. **MISSING TEXT**: Any significant text block, provision, definition, or formula visible in the PDF but not in the extracted data at all.

4. **WRONG TYPE**: Elements that exist but have the wrong type (e.g., a provision classified as body, a definition classified as provision, a user_note classified as body).

5. **WRONG COLUMN**: Elements in the wrong column (left/right/full).

For each MISSING item, provide:
- Full content (for tables: columns + rows with ALL data; for text: the full text)
- Precise bbox (normalized 0-1)
- Column placement
- fragment_ids if applicable

Return ONLY valid JSON:
{
  "page": ${page.page},
  "missing": [
    {
      "type": "missing_table",
      "description": "Table with wind speeds for territories",
      "element_type": "table",
      "column": "full",
      "bbox": { "x_start": 0.0, "x_end": 1.0, "y_start": 0.4, "y_end": 0.7 },
      "table_columns": ["Location", "V (mi/h)", "V (m/s)"],
      "table_rows": [["American Samoa", "160", "72"], ...],
      "fragment_ids": ["ID1", "ID2", "ID3"]
    }
  ],
  "wrong_type": [
    { "element_id": "...", "current_type": "body", "correct_type": "provision", "reason": "Contains 'shall' requirement" }
  ],
  "wrong_column": [
    { "element_id": "...", "current_column": "left", "correct_column": "right" }
  ],
  "score": 0.85
}`,
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error(`  Failed to parse audit response for page ${page.page}`)
    return { page: page.page, missing: [], wrong_type: [], wrong_column: [], score: 0 }
  }

  return JSON.parse(jsonMatch[0]) as PageAudit
}

/**
 * Apply audit fixes to a page: add missing elements, fix types, fix columns.
 */
function applyAudit(page: Page, audit: PageAudit): Page {
  const elements = [...page.elements]

  // Fix wrong types
  for (const wt of audit.wrong_type) {
    const el = elements.find((e) => e.id === wt.element_id)
    if (el) {
      el.type = wt.correct_type
    }
  }

  // Fix wrong columns
  for (const wc of audit.wrong_column) {
    const el = elements.find((e) => e.id === wc.element_id)
    if (el) {
      el.column = wc.correct_column
    }
  }

  // Add missing elements
  for (const miss of audit.missing) {
    // Remove fragments that this element replaces
    const fragSet = new Set(miss.fragment_ids ?? [])
    const filtered = fragSet.size > 0
      ? elements.filter((e) => !fragSet.has(e.id))
      : elements

    // Rebuild array if fragments were removed
    if (fragSet.size > 0) {
      elements.length = 0
      elements.push(...filtered)
    }

    const newEl: PageElement = {
      id: `ASCE7-22-26-AUDIT-${page.page}-${audit.missing.indexOf(miss)}`,
      type: miss.element_type,
      section: page.section_range[0],
      text: miss.description,
      cross_references: [],
      bbox: miss.bbox,
      column: miss.column,
      metadata: { extracted_by: 'vision', qc_status: 'pending' },
    }

    if (miss.element_type === 'table' && miss.table_columns && miss.table_rows) {
      newEl.columns = miss.table_columns
      newEl.rows = miss.table_rows
      newEl.text = miss.description
    }

    if (miss.element_type === 'figure') {
      newEl.caption = miss.caption ?? miss.description
    }

    if (miss.text) {
      newEl.text = miss.text
    }

    if (miss.expression) {
      newEl.expression = miss.expression
      newEl.parameters = miss.parameters
    }

    elements.push(newEl)
  }

  // Re-sort
  elements.sort((a, b) => a.bbox.y_start - b.bbox.y_start)

  return { ...page, elements }
}

/**
 * Audit all pages in a chapter. For each page, compare PDF against data and fix.
 */
export async function auditChapter(chapter: number, pageFilter?: number[]): Promise<void> {
  const pagesDir = resolve(paths.root, 'public', 'data', `ch${chapter}`)
  const pngDir = resolve(paths.v1Root, 'output', 'pages', `asce722-ch${chapter}`)
  const pageOffset = chapterOffsets[chapter] ?? 260

  const pageFiles = readdirSync(pagesDir).filter((f) => f.endsWith('.json')).sort()
  let totalMissing = 0
  let totalTypeFixed = 0
  let totalColFixed = 0

  for (const pageFile of pageFiles) {
    const page: Page = JSON.parse(readFileSync(resolve(pagesDir, pageFile), 'utf-8'))

    if (pageFilter && !pageFilter.includes(page.page)) continue

    const pngIndex = page.page - pageOffset
    const pngFile = `page-${String(pngIndex).padStart(3, '0')}.png`
    const pngPath = resolve(pngDir, pngFile)

    if (!existsSync(pngPath)) continue

    console.log(`  p.${page.page}: auditing (${page.elements.length} elements)...`)
    const audit = await auditPage(pngPath, page)

    const issues = audit.missing.length + audit.wrong_type.length + audit.wrong_column.length
    if (issues === 0) {
      console.log(`    Score: ${(audit.score * 100).toFixed(0)}% — no issues`)
      continue
    }

    console.log(`    Score: ${(audit.score * 100).toFixed(0)}% — ${audit.missing.length} missing, ${audit.wrong_type.length} wrong type, ${audit.wrong_column.length} wrong column`)

    for (const m of audit.missing) {
      const detail = m.element_type === 'table'
        ? `${m.table_columns?.length ?? 0} cols, ${m.table_rows?.length ?? 0} rows`
        : m.text?.slice(0, 50) ?? m.description.slice(0, 50)
      console.log(`    + MISSING ${m.type}: ${detail} (replaces ${m.fragment_ids?.length ?? 0} fragments)`)
    }
    for (const wt of audit.wrong_type) {
      console.log(`    ~ TYPE ${wt.element_id}: ${wt.current_type} → ${wt.correct_type} (${wt.reason})`)
    }
    for (const wc of audit.wrong_column) {
      console.log(`    ~ COL ${wc.element_id}: ${wc.current_column} → ${wc.correct_column}`)
    }

    const fixed = applyAudit(page, audit)
    writeFileSync(resolve(pagesDir, pageFile), JSON.stringify(fixed, null, 2))

    totalMissing += audit.missing.length
    totalTypeFixed += audit.wrong_type.length
    totalColFixed += audit.wrong_column.length
  }

  console.log(`\nAudit complete: +${totalMissing} missing elements, ~${totalTypeFixed} type fixes, ~${totalColFixed} column fixes`)
}
