import type { PageElement, PositionedElement, LayoutEngine } from '../types.ts'

/**
 * DOM flow layout engine — two-column aware.
 *
 * Sorts elements by column (left first, then right), then by y_start
 * within each column. Full-width elements are interleaved at their
 * y_start position across both columns.
 *
 * When @chenglou/pretext is integrated, this engine is replaced with
 * a Canvas-based engine that computes exact line breaks and glyph
 * positions matching the PDF typography.
 */
export function createDOMLayoutEngine(): LayoutEngine {
  return {
    positionElements(
      elements: PageElement[],
      containerWidth: number,
      _containerHeight: number
    ): PositionedElement[] {
      const COL_GAP = 16
      const colWidth = (containerWidth - COL_GAP) / 2
      const LINE_HEIGHT = 18

      function estimateHeight(element: PageElement, width: number): number {
        const charsPerLine = Math.floor(width / 7.2)
        const lines = Math.max(1, Math.ceil(element.text.length / charsPerLine))
        return lines * LINE_HEIGHT + 12
      }

      // Separate into left, right, and full-width
      const leftEls = elements.filter((e) => e.column === 'left').sort((a, b) => a.bbox.y_start - b.bbox.y_start)
      const rightEls = elements.filter((e) => e.column === 'right').sort((a, b) => a.bbox.y_start - b.bbox.y_start)
      const fullEls = elements.filter((e) => e.column === 'full').sort((a, b) => a.bbox.y_start - b.bbox.y_start)

      const results: PositionedElement[] = []

      // Interleave: process in y_start order across all three groups
      let li = 0, ri = 0, fi = 0

      while (li < leftEls.length || ri < rightEls.length || fi < fullEls.length) {
        const ly = li < leftEls.length ? leftEls[li].bbox.y_start : Infinity
        const ry = ri < rightEls.length ? rightEls[ri].bbox.y_start : Infinity
        const fy = fi < fullEls.length ? fullEls[fi].bbox.y_start : Infinity

        if (fy <= ly && fy <= ry) {
          // Full-width element comes first
          const element = fullEls[fi++]
          results.push({
            element,
            x: 0,
            y: element.bbox.y_start,
            width: containerWidth,
            height: estimateHeight(element, containerWidth),
          })
        } else if (ly <= ry) {
          const element = leftEls[li++]
          results.push({
            element,
            x: 0,
            y: element.bbox.y_start,
            width: colWidth,
            height: estimateHeight(element, colWidth),
          })
        } else {
          const element = rightEls[ri++]
          results.push({
            element,
            x: colWidth + COL_GAP,
            y: element.bbox.y_start,
            width: colWidth,
            height: estimateHeight(element, colWidth),
          })
        }
      }

      return results
    },
  }
}
