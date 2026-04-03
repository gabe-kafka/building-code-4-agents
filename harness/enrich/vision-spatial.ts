import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import type { ColumnPlacement, BBox } from '../../src/types.ts'
import { models } from '../config.ts'

const client = new Anthropic()

export interface SpatialResult {
  located: Array<{
    id: string
    column: ColumnPlacement
    bbox: BBox
  }>
  missing: Array<{
    text: string
    type: string
    column: ColumnPlacement
    bbox: BBox
  }>
}

export async function enrichPageSpatial(
  pagePngPath: string,
  elements: Array<{ id: string; type: string; text: string }>
): Promise<SpatialResult> {
  const imageData = readFileSync(pagePngPath).toString('base64')

  const elementList = elements
    .map((e) => `- ID: ${e.id} | TYPE: ${e.type} | TEXT: "${e.text.slice(0, 80)}${e.text.length > 80 ? '...' : ''}"`)
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
            text: `You are analyzing a building code PDF page image. I have already extracted the text content of each element on this page. Your job is to locate each element spatially.

For each element below, determine:
1. Which column it appears in: "left", "right", or "full" (spans both columns)
2. Its bounding box as normalized 0-1 coordinates: x_start, x_end, y_start, y_end
   (0,0 is top-left of the page content area, 1,1 is bottom-right)

The page has a two-column layout. The left column occupies roughly x=0.0 to x=0.48,
the right column x=0.52 to x=1.0. Full-width elements (tables, large figures) span x=0.0 to x=1.0.

Elements to locate:
${elementList}

Also report any content visible on the page that is NOT in the element list above
(missing elements). For each missing item, provide: approximate text (first 80 chars), likely type (provision/definition/formula/table/figure/exception/user_note/body), column, and bbox.

Return ONLY valid JSON with this exact structure:
{
  "located": [{ "id": "...", "column": "left|right|full", "bbox": { "x_start": 0.0, "x_end": 0.48, "y_start": 0.05, "y_end": 0.15 } }],
  "missing": [{ "text": "...", "type": "...", "column": "left|right|full", "bbox": { "x_start": 0.0, "x_end": 0.48, "y_start": 0.0, "y_end": 0.0 } }]
}`,
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  // Extract JSON from response (may be wrapped in markdown code block)
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error('Failed to parse vision spatial response:', text.slice(0, 200))
    return { located: [], missing: [] }
  }

  return JSON.parse(jsonMatch[0]) as SpatialResult
}
