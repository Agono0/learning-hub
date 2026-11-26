/**
 * Context variability guard: shared types and context helpers.
 *
 * Basis: memory is partly tied to the context it was learned in (encoding
 * specificity, Tulving & Thomson 1973; Godden & Baddeley 1975). A later
 * meta-analysis found the context effect is real but modest and depends on
 * how rich the context is (Smith & Vela 2001), and that varying study
 * contexts, or mentally reinstating the original one, reduces the cost of a
 * change (Smith 1979, Smith, Glenberg & Bjork 1978). The numbers here come from
 * the learner's own review history. They are observational, and
 * easier items may simply be reviewed in easier places, so every report says so.
 *
 * Leaf module: it imports nothing else from core.
 */

export interface CtxReview {
  cardId: number
  /** 1 Again, 2 Hard, 3 Good, 4 Easy. */
  rating: number
  /** ISO time. */
  reviewedAt: string
}

export type Noise = 'quiet' | 'moderate' | 'loud'

/** A stretch of time the learner said they were studying somewhere. */
export interface CtxSession {
  id: number
  startedAt: string
  /** null while the session is open. */
  endedAt: string | null
  place: string
  noise: Noise | null
  tags: string[]
}

/** A place and time of day the learner wants to perform in (an exam room, a work desk). */
export interface CtxGoal {
  id: number
  label: string
  place: string
  /** Local hour the performance window starts, 0 to 23. */
  startHour: number
  /** Local hour it ends (exclusive), 1 to 24. */
  endHour: number
  noise: Noise | null
}

export type TimeBucket = 'night' | 'morning' | 'afternoon' | 'evening' | 'late'
export type DayType = 'weekday' | 'weekend'

export interface ReviewContext {
  cardId: number
  success: boolean
  at: string
  /** 'unlogged' when no session covers the review. */
  place: string
  noise: Noise | null
  bucket: TimeBucket
  dayType: DayType
  hour: number
}

export const CTX_DEFAULTS = {
  windowDays: 60,
  /** A session without an end time is treated as this long when attributing reviews. */
  openSessionHours: 3,
  /** Reviews needed on a card before its context spread means anything. */
  minCardReviews: 4,
  /** One context holding at least this share of a card's reviews makes it context-bound. */
  boundShare: 0.8,
  /** Reviews needed in a group before its rate is shown as a number. */
  minGroup: 8,
  maxReviews: 20000,
  maxSessions: 5000,
  maxGoals: 20,
} as const

export const NOISE_LEVELS: readonly Noise[] = ['quiet', 'moderate', 'loud']
export const UNLOGGED = 'unlogged'

/** Lower-case slug for a place name: letters, digits, spaces and dashes, at most 40 chars. */
export function normalizePlace(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

/** Local hour (0-23) of an ISO time, given the learner's offset east of UTC in minutes. */
export function localHour(iso: string, tzOffsetMinutes: number): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  return new Date(t + tzOffsetMinutes * 60_000).getUTCHours()
}

/** Local weekday (0 Sunday) of an ISO time. */
export function localWeekday(iso: string, tzOffsetMinutes: number): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 0
  return new Date(t + tzOffsetMinutes * 60_000).getUTCDay()
}

export function bucketOfHour(hour: number): TimeBucket {
  if (hour < 5) return 'night'
  if (hour < 12) return 'morning'
  if (hour < 17) return 'afternoon'
  if (hour < 22) return 'evening'
  return 'late'
}

export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
export const round3 = (n: number) => Math.round(n * 1000) / 1000
