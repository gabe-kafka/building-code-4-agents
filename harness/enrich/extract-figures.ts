import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'
import { models, paths, chapterOffsets } from '../config.ts'
import type { Page, BBox } from '../../src/types.ts'

const client = new Anthropic()

interface FigureLocation {
  /** Original element ID if matched, or null for newly discovered figures */
  element_id: string | null
  /** Real figure number from the PDF (e.g., "26.5-1A") */
  figure_number: string
  /** Full caption text */
  caption: string
  /** Normalized bbox on the page */
  bbox: BBox
  /** Which column: left, right, or full */
  column: 'left' | 'right' | 'full'
}

interface PageFigureResult {
  page: number
  figures: FigureLocation[]
}

/**
 * Send a page PNG to vision and ask it to locate all figures with precise bboxes.
 */
async function locateFigures(
  pagePngPath: string,
  pageNum: number,
  existingFigureIds: string[]
): Promise<PageFigureResult> {
  const imageData = readFileSync(pagePngPath).toString('base64')

  const response = await client.messages.create({
    model: models.enrichment,
    max_tokens: 2048,
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
            text: `This is a page from ASCE 7-22 (a building code standard). Identify ALL figures, diagrams, charts, maps, and illustrations on this page.

For each figure found, report:
1. figure_number: The figure number as printed (e.g., "Figure 26.5-1A", "Figure 26.9-1"). Include the "Figure" prefix.
2. caption: The full caption text below/above the figure.
3. bbox: Normalized bounding box (0-1) covering the ENTIRE figure including its caption.
   - x_start, x_end: horizontal extent (0=left edge, 1=right edge of content area)
   - y_start, y_end: vertical extent (0=top of content area, 1=bottom)
   Be precise — the bbox should tightly enclose the figure and its caption, not include surrounding text.
4. column: "left", "right", or "full" (most figures/maps span full width)

Known figure element IDs on this page: ${existingFigureIds.length > 0 ? existingFigureIds.join(', ') : 'none'}
If you can match a figure to one of these IDs, include it as element_id. Otherwise set element_id to null.

Return ONLY valid JSON:
{
  "page": ${pageNum},
  "figures": [
    {
      "element_id": "..." or null,
      "figure_number": "Figure 26.X-Y",
      "caption": "Full caption text...",
      "bbox": { "x_start": 0.0, "x_end": 1.0, "y_start": 0.1, "y_end": 0.6 },
      "column": "full"
    }
  ]
}

If there are NO figures on this page, return: { "page": ${pageNum}, "figures": [] }`,
          },
        ],
      },
    ],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    console.error(`  Failed to parse figure response for page ${pageNum}`)
    return { page: pageNum, figures: [] }
  }

  return JSON.parse(jsonMatch[0]) as PageFigureResult
}

/**
 * Crop a figure region from a page PNG using the bbox.
 * Uses canvas-less approach: reads raw PNG dimensions and crops with sharp-compatible math.
 * For now, we'll use Puppeteer's page.screenshot clip since we already have it as a dep,
 * or we can just store the bbox and let the frontend render the full page PNG with CSS clip.
 *
 * Simplest approach: store the full page PNG and use bbox in the frontend to clip it.
 * This avoids needing an image processing library.
 */
function figureImageUrl(chapter: number, pageNum: number, figIndex: number): string {
  return `/figures/ch26/page-${pageNum}-fig-${figIndex}.png`
}

/**
 * Crop a figure region from a page PNG using Python PIL (available via V1's venv).
 * Falls back to copying the full page if cropping fails.
 */
async function cropFigure(
  pagePngPath: string,
  bbox: BBox,
  outputPath: string
): Promise<void> {
  const { execSync } = await import('child_process')
  const script = `
from PIL import Image
img = Image.open("${pagePngPath}")
w, h = img.size
box = (int(${bbox.x_start}*w), int(${bbox.y_start}*h), int(${bbox.x_end}*w), int(${bbox.y_end}*h))
cropped = img.crop(box)
cropped.save("${outputPath}")
`
  execSync(`python3 -c '${script}'`)
}

/**
 * Main: extract figures for an entire chapter.
 * 1. For each page with figures, ask vision for precise locations
 * 2. Crop figure regions from page PNGs
 * 3. Update page JSONs with image_url + corrected bbox/caption
 */
export async function extractChapterFigures(chapter: number): Promise<void> {
  const pagesDir = resolve(paths.root, 'public', 'data', `ch${chapter}`)
  const pngDir = resolve(paths.v1Root, 'output', 'pages', `asce722-ch${chapter}`)
  const figuresDir = resolve(paths.root, 'public', 'figures', `ch${chapter}`)
  mkdirSync(figuresDir, { recursive: true })

  // Load all page JSONs
  const { readdirSync } = await import('fs')
  const pageFiles = readdirSync(pagesDir).filter((f: string) => f.endsWith('.json')).sort()
  const pageOffset = chapterOffsets[chapter] ?? 260

  for (const pageFile of pageFiles) {
    const page: Page = JSON.parse(readFileSync(resolve(pagesDir, pageFile), 'utf-8'))
    const figureEls = page.elements.filter((e) => e.type === 'figure')

    // Also check pages that MIGHT have figures vision missed
    const pngIndex = page.page - pageOffset
    const pngFile = `page-${String(pngIndex).padStart(3, '0')}.png`
    const pngPath = resolve(pngDir, pngFile)

    if (!existsSync(pngPath)) {
      console.log(`  p.${page.page}: no PNG (${pngFile}), skipping`)
      continue
    }

    console.log(`  p.${page.page}: scanning for figures...`)
    const figIds = figureEls.map((e) => e.id)
    const result = await locateFigures(pngPath, page.page, figIds)

    if (result.figures.length === 0) {
      // Remove any false-positive figure elements from the page
      if (figureEls.length > 0) {
        console.log(`    Vision found 0 figures (had ${figureEls.length} in data) — removing false positives`)
        page.elements = page.elements.filter((e) => e.type !== 'figure')
      }
      continue
    }

    console.log(`    Found ${result.figures.length} figure(s)`)

    // Process each located figure
    for (let i = 0; i < result.figures.length; i++) {
      const fig = result.figures[i]
      const outPath = resolve(figuresDir, `page-${page.page}-fig-${i}.png`)

      // Crop figure from page PNG
      try {
        await cropFigure(pngPath, fig.bbox, outPath)
        console.log(`    Cropped: ${fig.figure_number} → ${outPath}`)
      } catch (err) {
        console.error(`    Failed to crop ${fig.figure_number}: ${err}`)
        continue
      }

      const imageUrl = figureImageUrl(chapter, page.page, i)

      // Update existing element or create new one
      if (fig.element_id) {
        const el = page.elements.find((e) => e.id === fig.element_id)
        if (el) {
          el.bbox = fig.bbox
          el.column = fig.column
          el.text = fig.caption || el.text
          el.caption = fig.caption
          el.image_url = imageUrl
        }
      } else {
        // New figure not in V1 extraction
        page.elements.push({
          id: `ASCE7-22-${chapter}-FIG-${page.page}-${i}`,
          type: 'figure',
          section: page.section_range[0],
          text: fig.caption || fig.figure_number,
          cross_references: [],
          bbox: fig.bbox,
          column: fig.column,
          caption: fig.caption,
          image_url: imageUrl,
          metadata: { extracted_by: 'vision', qc_status: 'pending' },
        })
      }
    }

    // Remove figure elements that vision didn't find (false positives from V1)
    const locatedIds = new Set(result.figures.map((f) => f.element_id).filter(Boolean))
    page.elements = page.elements.filter((e) => {
      if (e.type !== 'figure') return true
      if (e.image_url) return true // has a real image now
      if (locatedIds.has(e.id)) return true
      console.log(`    Removing unlocated figure: ${e.id}`)
      return false
    })

    // Re-sort elements by position
    page.elements.sort((a, b) => a.bbox.y_start - b.bbox.y_start)

    // Save updated page JSON
    writeFileSync(resolve(pagesDir, pageFile), JSON.stringify(page, null, 2))
  }

  console.log(`\nFigures saved to public/figures/ch${chapter}/`)
  console.log('Page JSONs updated with image_url + corrected bbox/caption.')
}
