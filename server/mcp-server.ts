/**
 * MCP server for ASCE 7-22 building code queries.
 * Exposes subject-oriented tools over stdio.
 *
 * Usage: npx tsx server/mcp-server.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { loadIndex, elementsByPrefix, searchElements, type CodeIndex } from './index.ts'
import { resolveSubject } from './subjects.ts'
import { lookupCoefficient } from './coefficients.ts'
import type { PageElement } from '../src/types.ts'

function elementSummary(el: PageElement): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: el.id,
    type: el.type,
    section: el.section,
    text: el.text.slice(0, 500),
  }
  if (el.columns) out.columns = el.columns
  if (el.rows) out.rows = el.rows
  if (el.expression) out.expression = el.expression
  if (el.parameters) out.parameters = el.parameters
  if (el.caption) out.caption = el.caption
  if (el.cross_references.length > 0) out.cross_references = el.cross_references
  if (el.heading) out.heading = true
  return out
}

async function main() {
  const index = loadIndex()

  const server = new McpServer({
    name: 'asce7-22',
    version: '0.1.0',
  })

  // --- lookup_table ---
  server.tool(
    'lookup_table',
    'Look up a specific ASCE 7-22 table by number (e.g., "26.10-1") or subject keyword (e.g., "velocity pressure")',
    { query: z.string().describe('Table number like "26.10-1" or subject keyword') },
    async ({ query }) => {
      // Try direct table lookup
      let el = index.tables.get(query)

      // Try with "Table " prefix stripped
      if (!el) el = index.tables.get(query.replace(/^Table\s+/i, ''))

      // Try subject resolution
      if (!el) {
        const subject = resolveSubject(query)
        if (subject) {
          for (const sec of subject.sections) {
            const elements = elementsByPrefix(index, sec)
            const table = elements.find(e => e.type === 'table')
            if (table) { el = table; break }
          }
        }
      }

      // Search fallback
      if (!el) {
        const results = searchElements(index, query, 'table', 1)
        if (results.length > 0) el = results[0]
      }

      if (!el) return { content: [{ type: 'text' as const, text: `No table found for: ${query}` }] }

      return { content: [{ type: 'text' as const, text: JSON.stringify(elementSummary(el), null, 2) }] }
    }
  )

  // --- lookup_formula ---
  server.tool(
    'lookup_formula',
    'Look up an ASCE 7-22 formula by equation number (e.g., "26.10-1") or concept (e.g., "velocity pressure")',
    { query: z.string().describe('Equation number or concept keyword') },
    async ({ query }) => {
      let el = index.formulas.get(query)
      if (!el) el = index.formulas.get(query.replace(/[()]/g, ''))

      if (!el) {
        const subject = resolveSubject(query)
        if (subject) {
          for (const sec of subject.sections) {
            el = index.formulas.get(`section:${sec}`)
            if (el) break
            const elements = elementsByPrefix(index, sec)
            const formula = elements.find(e => e.type === 'formula')
            if (formula) { el = formula; break }
          }
        }
      }

      if (!el) {
        const results = searchElements(index, query, 'formula', 1)
        if (results.length > 0) el = results[0]
      }

      if (!el) return { content: [{ type: 'text' as const, text: `No formula found for: ${query}` }] }

      return { content: [{ type: 'text' as const, text: JSON.stringify(elementSummary(el), null, 2) }] }
    }
  )

  // --- lookup_provision ---
  server.tool(
    'lookup_provision',
    'Look up provision text by section number (e.g., "26.5.1") or subject keyword',
    { query: z.string().describe('Section number or subject keyword') },
    async ({ query }) => {
      // Direct section lookup
      let elements = index.bySection.get(query) ?? []

      // Try prefix match
      if (elements.length === 0) elements = elementsByPrefix(index, query)

      // Subject resolution
      if (elements.length === 0) {
        const subject = resolveSubject(query)
        if (subject) {
          for (const sec of subject.sections) {
            elements = elementsByPrefix(index, sec)
            if (elements.length > 0) break
          }
        }
      }

      if (elements.length === 0) {
        const results = searchElements(index, query, undefined, 5)
        elements = results
      }

      if (elements.length === 0) return { content: [{ type: 'text' as const, text: `No provisions found for: ${query}` }] }

      const summaries = elements.slice(0, 10).map(elementSummary)
      return { content: [{ type: 'text' as const, text: JSON.stringify(summaries, null, 2) }] }
    }
  )

  // --- lookup_definition ---
  server.tool(
    'lookup_definition',
    'Look up a defined term from ASCE 7-22 (e.g., "basic wind speed", "MWFRS", "enclosed building")',
    { term: z.string().describe('The term to look up') },
    async ({ term }) => {
      const el = index.definitions.get(term.toLowerCase().trim())

      if (!el) {
        // Search definitions
        const results = searchElements(index, term, 'definition', 3)
        if (results.length > 0) {
          return { content: [{ type: 'text' as const, text: JSON.stringify(results.map(elementSummary), null, 2) }] }
        }
        return { content: [{ type: 'text' as const, text: `No definition found for: ${term}` }] }
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(elementSummary(el), null, 2) }] }
    }
  )

  // --- search ---
  server.tool(
    'search',
    'Full-text search across all ASCE 7-22 elements. Optionally filter by type.',
    {
      query: z.string().describe('Search query'),
      type: z.enum(['definition', 'formula', 'table', 'procedure', 'figure', 'exception', 'user_note', 'body']).optional().describe('Filter by element type'),
      max_results: z.number().optional().describe('Max results (default 10)'),
    },
    async ({ query, type, max_results }) => {
      const results = searchElements(index, query, type, max_results ?? 10)

      if (results.length === 0) return { content: [{ type: 'text' as const, text: `No results for: ${query}` }] }

      const summaries = results.map(el => ({
        ...elementSummary(el),
        text: el.text.slice(0, 200) + (el.text.length > 200 ? '...' : ''),
      }))

      return { content: [{ type: 'text' as const, text: JSON.stringify(summaries, null, 2) }] }
    }
  )

  // --- get_coefficient ---
  server.tool(
    'get_coefficient',
    'Look up a specific coefficient value from a table with interpolation. E.g., Kz at height 60ft for Exposure B from Table 26.10-1.',
    {
      table: z.string().describe('Table reference, e.g., "26.10-1" or "26.6-1"'),
      inputs: z.record(z.union([z.string(), z.number()])).describe('Lookup inputs, e.g., { height: 60, exposure: "B" }'),
    },
    async ({ table, inputs }) => {
      const tableEl = index.tables.get(table) ?? index.tables.get(table.replace(/^Table\s+/i, ''))

      if (!tableEl) return { content: [{ type: 'text' as const, text: `Table not found: ${table}` }] }

      const result = lookupCoefficient(tableEl, inputs, table)

      if (!result) return { content: [{ type: 'text' as const, text: `Could not look up value from Table ${table} with inputs: ${JSON.stringify(inputs)}` }] }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    }
  )

  // --- list_sections ---
  server.tool(
    'list_sections',
    'List sections within a chapter or subject area',
    {
      query: z.string().describe('Chapter number (e.g., "26"), section prefix (e.g., "26.10"), or subject keyword'),
    },
    async ({ query }) => {
      let prefix = query

      // Try subject resolution
      const subject = resolveSubject(query)
      if (subject) prefix = subject.sections[0]

      const sections = index.allSections.filter(s => s === prefix || s.startsWith(prefix + '.'))

      if (sections.length === 0) return { content: [{ type: 'text' as const, text: `No sections found for: ${query}` }] }

      const result = sections.map(s => {
        const elements = index.bySection.get(s) ?? []
        const heading = elements.find(e => e.heading)
        return {
          section: s,
          title: heading?.text.replace(/^\d+[\d.]*\s*/, '').slice(0, 80) ?? '',
          elements: elements.length,
          types: [...new Set(elements.map(e => e.type))],
        }
      })

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    }
  )

  // --- get_figure ---
  server.tool(
    'get_figure',
    'Get figure metadata and structured description by figure number or subject',
    { query: z.string().describe('Figure number (e.g., "26.5-1A") or subject keyword') },
    async ({ query }) => {
      // Search figures
      const figures = index.byType.get('figure') ?? []
      const q = query.toLowerCase()

      let match = figures.find(f =>
        f.caption?.toLowerCase().includes(q) || f.text.toLowerCase().includes(q)
      )

      if (!match) {
        const subject = resolveSubject(query)
        if (subject) {
          for (const sec of subject.sections) {
            const elements = elementsByPrefix(index, sec)
            match = elements.find(e => e.type === 'figure')
            if (match) break
          }
        }
      }

      if (!match) return { content: [{ type: 'text' as const, text: `No figure found for: ${query}` }] }

      return { content: [{ type: 'text' as const, text: JSON.stringify(elementSummary(match), null, 2) }] }
    }
  )

  // --- get_cross_references ---
  server.tool(
    'get_cross_references',
    'Get what references a given section/table/figure, or what a section references',
    {
      target: z.string().describe('Section, table, or figure reference (e.g., "Table 26.10-1", "26.5")'),
      direction: z.enum(['from', 'to', 'both']).optional().describe('Direction: "from" = what this references, "to" = what references this, "both" (default)'),
    },
    async ({ target, direction = 'both' }) => {
      const result: Record<string, unknown> = { target }

      if (direction === 'from' || direction === 'both') {
        // Find elements with this target as ID or section, get their refs
        const fromRefs: string[] = []
        for (const [id, refs] of index.refsFrom) {
          if (id.includes(target) || refs.includes(target)) {
            fromRefs.push(...refs)
          }
        }
        result.references = [...new Set(fromRefs)]
      }

      if (direction === 'to' || direction === 'both') {
        // Find elements that reference this target
        const toRefs = index.refsTo.get(target) ?? []
        // Also check partial matches
        const partialRefs: string[] = [...toRefs]
        for (const [ref, ids] of index.refsTo) {
          if (ref.includes(target) || target.includes(ref)) {
            partialRefs.push(...ids)
          }
        }
        result.referenced_by = [...new Set(partialRefs)]
      }

      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] }
    }
  )

  // Start server
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
