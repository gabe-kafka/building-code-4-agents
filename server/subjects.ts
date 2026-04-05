/**
 * Subject → section alias map.
 * Translates engineering concepts to ASCE 7-22 section numbers.
 */

export interface SubjectEntry {
  sections: string[]
  description: string
  symbols?: string[]
}

export const SUBJECTS: Record<string, SubjectEntry> = {
  // Ch. 26 — Wind Load Parameters
  'wind speed':         { sections: ['26.5'], description: 'Basic wind speed V', symbols: ['V'] },
  'basic wind speed':   { sections: ['26.5'], description: 'Basic wind speed V', symbols: ['V'] },
  'special wind region':{ sections: ['26.5.2'], description: 'Special wind regions' },
  'exposure':           { sections: ['26.7'], description: 'Exposure categories' },
  'surface roughness':  { sections: ['26.7.2'], description: 'Surface roughness categories' },
  'exposure category':  { sections: ['26.7.3'], description: 'Exposure categories B, C, D' },
  'topographic':        { sections: ['26.8'], description: 'Topographic factor Kzt', symbols: ['Kzt'] },
  'topographic factor': { sections: ['26.8'], description: 'Topographic factor Kzt', symbols: ['Kzt'] },
  'velocity pressure':  { sections: ['26.10'], description: 'Velocity pressure qz', symbols: ['qz', 'qh'] },
  'gust':               { sections: ['26.11'], description: 'Gust-effect factor', symbols: ['G', 'Gf'] },
  'gust effect':        { sections: ['26.11'], description: 'Gust-effect factor G or Gf', symbols: ['G', 'Gf'] },
  'rigid':              { sections: ['26.11.1'], description: 'Gust-effect factor for rigid structures' },
  'flexible':           { sections: ['26.11.2'], description: 'Gust-effect factor for flexible structures' },
  'natural frequency':  { sections: ['26.11.2'], description: 'Approximate natural frequency', symbols: ['n1'] },
  'enclosure':          { sections: ['26.12'], description: 'Enclosure classification' },
  'internal pressure':  { sections: ['26.13'], description: 'Internal pressure coefficient GCpi', symbols: ['GCpi'] },
  'directionality':     { sections: ['26.6'], description: 'Wind directionality factor Kd', symbols: ['Kd'] },
  'ground elevation':   { sections: ['26.9'], description: 'Ground elevation factor Ke', symbols: ['Ke'] },
  'kz':                 { sections: ['26.10.1'], description: 'Velocity pressure exposure coefficient Kz', symbols: ['Kz'] },
  'definitions':        { sections: ['26.2'], description: 'Wind load definitions' },
  'symbols':            { sections: ['26.3'], description: 'Symbols and notation' },
  'procedures':         { sections: ['26.1'], description: 'Wind load procedures' },

  // Ch. 27 — Wind Loads on Buildings MWFRS
  'mwfrs':              { sections: ['27.3'], description: 'Wind loads on MWFRS (directional procedure)' },
  'main wind force':    { sections: ['27.3'], description: 'Main wind force resisting system' },
  'parapets':           { sections: ['27.4'], description: 'Wind loads on parapets' },
  'roof overhangs':     { sections: ['27.5'], description: 'Wind loads on roof overhangs' },
  'elevated buildings': { sections: ['27.3.1.1'], description: 'MWFRS loads for elevated buildings' },
  'design procedure':   { sections: ['27.2'], description: 'Steps to determine MWFRS wind loads' },
}

/**
 * Resolve a query to matching section numbers.
 * Tries exact subject match first, then prefix/substring matching.
 */
export function resolveSubject(query: string): SubjectEntry | null {
  const q = query.toLowerCase().trim()

  // Exact match
  if (SUBJECTS[q]) return SUBJECTS[q]

  // Substring match — find best
  let bestMatch: SubjectEntry | null = null
  let bestLen = 0
  for (const [key, entry] of Object.entries(SUBJECTS)) {
    if (q.includes(key) || key.includes(q)) {
      if (key.length > bestLen) {
        bestMatch = entry
        bestLen = key.length
      }
    }
  }

  return bestMatch
}
