/**
 * Session fatigue: shared types, defaults and small helpers.
 *
 * Basis: sustained attention declines with time on task (the vigilance
 * decrement: Mackworth 1948; reviewed by Davies & Parasuraman 1982), and
 * performance recovers after a break or a change of activity (Ariga & Lleras
 * 2011). Whether a given learner's recall accuracy falls inside a review
 * session is an empirical question, so this module measures it from their own
 * reviews instead of assuming it. It reports a pattern, never a verdict.
 *
 * This file is a leaf: it imports nothing else from core.
 */

export interface FatReview {
  cardId: number
  /** 1 Again, 2 Hard, 3 Good, 4 Easy. */
  rating: number
  /** Time spent on the review, in milliseconds. */
  timeMs: number
  /** ISO time. */
  reviewedAt: string
}

/** One review placed inside its session. */
export interface PlacedReview extends FatReview {
  sessionId: number
  /** 1-based position in the session. */
  position: number
  /** Minutes since the session's first review. */
  minute: number
  success: boolean
  /** The card's own success rate over the window, leaving this review out. */
  baseline: number
  /** success (0 or 1) minus baseline: positive means better than this card usually does. */
  residual: number
  /** timeMs divided by the card's own median time (or the global median), capped. */
  speed: number
}

export interface Session {
  id: number
  startedAt: string
  endedAt: string
  reviews: number
  minutes: number
}

export const FAT_DEFAULTS = {
  windowDays: 60,
  /** A gap longer than this starts a new session. */
  gapMinutes: 30,
  /** Sessions shorter than this carry no fatigue signal. */
  minSessionReviews: 15,
  /** Hard bound on reviews read (newest kept). */
  maxReviews: 50_000,
  /** Reviews per position bin in the curve. */
  binSize: 10,
  /** Most position bins shown. */
  maxBins: 12,
  /** Reviews needed in a bin before its rate is shown. */
  minBin: 30,
  /** A drop must exceed this many points of accuracy to count. */
  dropThreshold: 0.03,
  /** Sessions needed before a verdict. */
  minSessions: 6,
  /** Most sessions kept. */
  maxSessions: 2000,
  /** Cards need this many reviews before their own rate is used as a baseline. */
  minCardReviews: 4,
  /** Speed ratios are capped here so one forgotten tab cannot dominate. */
  speedCap: 5,
  /** Review times above this are treated as an interruption, not effort. */
  maxTimeMs: 300_000,
} as const

export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
export const round3 = (n: number) => Math.round(n * 1000) / 1000
export const median = (xs: number[]): number => {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2
}

/** Small deterministic PRNG so the same data always gives the same interval. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Wilson score interval (95%). */
export function wilson(successes: number, n: number): { low: number; high: number } {
  if (n <= 0) return { low: 0, high: 1 }
  const z = 1.96
  const p = successes / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return { low: clamp01((c - m) / d), high: clamp01((c + m) / d) }
}
