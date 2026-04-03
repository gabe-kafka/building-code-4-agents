import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { models } from '../config.ts'
import type { PageDiff } from './diff-types.ts'

const client = new Anthropic()

export async function comparePages(
  pdfPngPath: string,
  twinPngPath: string,
  pageNum: number
): Promise<PageDiff> {
  const pdfImage = readFileSync(pdfPngPath).toString('base64')
  const twinImage = readFileSync(twinPngPath).toString('base64')

  const response = await client.messages.create({
    model: models.comparison,
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `You are comparing a source PDF page (Image 1) against a digital twin rendering (Image 2) of the same building code page.

The twin should be a faithful structural reproduction: same two-column layout, same elements in the same positions, same text content, same tables with the same data. The twin uses color-coded type tags (green=provision, purple=definition, blue=formula, cyan=table, amber=figure, red=exception, gray=user_note).

Compare the two images and report mismatches. Mismatch types:
- missing_element: content visible in PDF but absent in twin
- extra_element: content in twin not present in PDF
- wrong_column: element in wrong column (left vs right vs full-width)
- wrong_type: element classified incorrectly
- text_mismatch: text content differs (truncated, garbled, merged)
- table_error: table has wrong rows, columns, or values
- figure_missing: figure visible in PDF but placeholder in twin
- ordering_error: elements in wrong vertical order within their column
- boundary_error: two elements merged into one, or one split into two

For each mismatch, report severity: high (content missing/wrong), medium (structural), low (cosmetic).

Score the page 0.0 to 1.0 based on overall fidelity. 1.0 = perfect match.

Return ONLY valid JSON:
{
  "page": ${pageNum},
  "score": 0.XX,
  "mismatches": [
    {
      "type": "<mismatch_type>",
      "description": "<what is wrong>",
      "location": { "column": "left|right|full", "y_approx": 0.XX },
      "severity": "high|medium|low",
      "element_id": "<if identifiable, null otherwise>",
      "suggestion": "<how to fix>"
    }
  ]
}`,
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: pdfImage },
          },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: twinImage },
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error(`Failed to parse comparison response for page ${pageNum}:`, text.slice(0, 200))
    return { page: pageNum, score: 0, mismatches: [] }
  }

  return JSON.parse(jsonMatch[0]) as PageDiff
}
