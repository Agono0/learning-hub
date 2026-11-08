/**
 * Ambient Exposure Ledger & Lexical Coverage Model.
 *
 * Grounded in learning science:
 * 1. Krashen (1982, 1985): Comprehensible input hypothesis (i+1).
 * 2. Nation (2001) & Laufer (1989): Incidental vocabulary acquisition requires 95%–98%
 *    lexical coverage of running text. Below 95%, reading comprehension breaks down;
 *    above 98%, text is effortless.
 * 3. Waring & Nation (2004), Webb (2007): 5 to 16 spaced encounters are needed to acquire
 *    a word naturally through reading without explicit flashcard drilling.
 */
import { z } from 'zod'

export interface CoverageAnalysis {
  totalTokens: number
  uniqueTokens: number
  knownCount: number
  unknownTokens: Array<{ token: string; count: number }>
  coveragePercent: number
  zone: 'optimal' | 'frustration' | 'effortless'
}

export interface ExposureRecord {
  createdAt: string // ISO timestamp
  sourceType?: string
}

export const exposureEventSchema = z.object({
  token: z.string().trim().min(1).max(100),
  sourceType: z.enum(['reading', 'note', 'lesson']).default('reading'),
  sourceId: z.number().int().positive().optional(),
  contextSnippet: z.string().max(500).optional(),
})

export const exposureBatchSchema = z.object({
  tokens: z.array(z.string().trim().min(1).max(100)).min(1).max(500),
  sourceType: z.enum(['reading', 'note', 'lesson']).default('reading'),
  sourceId: z.number().int().positive().optional(),
  contextSnippet: z.string().max(500).optional(),
})

const DEFAULT_STOP_WORDS = new Set([
  'the',
  'be',
  'to',
  'of',
  'and',
  'a',
  'in',
  'that',
  'have',
  'i',
  'it',
  'for',
  'not',
  'on',
  'with',
  'he',
  'as',
  'you',
  'do',
  'at',
  'this',
  'but',
  'his',
  'by',
  'from',
  'they',
  'we',
  'say',
  'her',
  'she',
  'or',
  'an',
  'will',
  'my',
  'one',
  'all',
  'would',
  'there',
  'their',
  'what',
  'so',
  'up',
  'out',
  'if',
  'about',
  'who',
  'get',
  'which',
  'go',
  'me',
])

/**
 * Normalizes and extracts meaningful lexical tokens from raw text.
 * Strips punctuation, transforms to lowercase, and filters out short tokens (< 3 chars)
 * and high-frequency stop words.
 */
export function tokenizeText(text: string, stopWords = DEFAULT_STOP_WORDS): string[] {
  if (!text || typeof text !== 'string') return []

  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, '').trim())
    .filter((w) => w.length >= 3 && !stopWords.has(w) && !/^\d+$/.test(w))

  return words
}

/**
 * Computes lexical coverage percentage against a set of known tokens
 * and identifies the Krashen i+1 difficulty zone (95% - 98% optimal).
 */
export function computeLexicalCoverage(
  runningTokens: string[],
  knownTokens: Set<string>,
): CoverageAnalysis {
  if (runningTokens.length === 0) {
    return {
      totalTokens: 0,
      uniqueTokens: 0,
      knownCount: 0,
      unknownTokens: [],
      coveragePercent: 100,
      zone: 'effortless',
    }
  }

  let knownRunningCount = 0
  const unknownFreqMap = new Map<string, number>()

  for (const token of runningTokens) {
    if (knownTokens.has(token)) {
      knownRunningCount++
    } else {
      unknownFreqMap.set(token, (unknownFreqMap.get(token) ?? 0) + 1)
    }
  }

  const coveragePercent = Math.round((knownRunningCount / runningTokens.length) * 1000) / 10

  let zone: 'optimal' | 'frustration' | 'effortless'
  if (coveragePercent < 95) {
    zone = 'frustration'
  } else if (coveragePercent <= 98) {
    zone = 'optimal'
  } else {
    zone = 'effortless'
  }

  const unknownTokens = Array.from(unknownFreqMap.entries())
    .map(([token, count]) => ({ token, count }))
    .sort((a, b) => b.count - a.count)

  const uniqueTokens = new Set(runningTokens).size

  return {
    totalTokens: runningTokens.length,
    uniqueTokens,
    knownCount: knownRunningCount,
    unknownTokens,
    coveragePercent,
    zone,
  }
}

/** Minimum incidental encounters before a word is offered for SRS promotion (Webb 2007). */
export const PROMOTION_MIN_ENCOUNTERS = 5
/** Minimum distinct calendar days those encounters must span (spacing, Waring & Nation 2004). */
export const PROMOTION_MIN_DAYS = 3

/**
 * Aggregate-form of {@link isEligibleForSrsPromotion} for callers (e.g. SQL
 * GROUP BY rollups) that already hold the counts rather than raw events.
 */
export function meetsPromotionThreshold(
  encounterCount: number,
  distinctDays: number,
  minEncounters = PROMOTION_MIN_ENCOUNTERS,
  minDays = PROMOTION_MIN_DAYS,
): boolean {
  return encounterCount >= minEncounters && distinctDays >= minDays
}

/**
 * Canonical key for an ambient token: lowercase, trimmed, surrounding
 * punctuation removed. Used both when recording and when matching card fronts.
 */
export function normalizeExposureToken(token: string): string {
  return token
    .toLowerCase()
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
}

/**
 * Determines whether an ambient word meets the spaced exposure threshold
 * for 1-click promotion to active SRS flashcards.
 *
 * Default threshold: at least 5 encounters across at least 3 distinct calendar days
 * (Waring & Nation 2004; Webb 2007).
 */
export function isEligibleForSrsPromotion(
  encounters: ExposureRecord[],
  minEncounters = PROMOTION_MIN_ENCOUNTERS,
  minDays = PROMOTION_MIN_DAYS,
): boolean {
  if (encounters.length < minEncounters) return false

  const distinctDays = new Set(
    encounters.map((e) => {
      const d = new Date(e.createdAt)
      // Invalid dates make toISOString() throw — fall back to the raw string.
      return Number.isNaN(d.getTime()) ? e.createdAt : d.toISOString().slice(0, 10)
    }),
  )

  return meetsPromotionThreshold(encounters.length, distinctDays.size, minEncounters, minDays)
}
