import { processChapter } from './chapter.ts'
import { getPatternSummary } from '../correct/fix-registry.ts'

/**
 * Expand processing to multiple chapters sequentially.
 * Each chapter benefits from patterns learned in previous chapters.
 */
export async function expandToChapters(chapters: number[]): Promise<void> {
  for (const chapter of chapters) {
    const patterns = getPatternSummary()
    if (patterns) {
      console.log(`\nApplying ${patterns.split('\n').length} learned patterns from previous chapters:`)
      console.log(patterns)
    }

    console.log(`\n${'='.repeat(60)}`)
    console.log(`Processing Chapter ${chapter}`)
    console.log('='.repeat(60))

    try {
      const result = await processChapter(chapter)
      console.log(`\nChapter ${chapter} — Average Score: ${(result.averageScore * 100).toFixed(1)}%`)
      console.log(`  Approved: ${result.results.filter((r) => r.status === 'approved').length}`)
      console.log(`  Flagged: ${result.results.filter((r) => r.status === 'flagged').length}`)
    } catch (err) {
      console.error(`\nChapter ${chapter} failed: ${err}`)
      console.log('Continuing to next chapter...\n')
    }
  }
}
