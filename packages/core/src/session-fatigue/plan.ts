/** Turn a knee into a session length, and cut a review queue into sessions with breaks. */
import { FAT_DEFAULTS, median, round3, type PlacedReview } from './cues'
import type { Knee } from './knee'

export interface SessionAdvice {
  /** Suggested most reviews in one sitting. Null when there is no evidence to change anything. */
  maxReviews: number | null
  /** Rough minutes for that many reviews at the learner's own pace. */
  minutes: number | null
  breakMinutes: number
  why: string
}

/** Median seconds per review, from the learner's own reviews (interruptions excluded). */
export function medianSeconds(rows: PlacedReview[]): number {
  return round3(
    median(rows.filter((r) => r.timeMs <= FAT_DEFAULTS.maxTimeMs).map((r) => r.timeMs)) / 1000,
  )
}

export const MIN_ADVISED = 10
export const MAX_ADVISED = 200
export const DEFAULT_BREAK = 5

export function adviseSession(knee: Knee, rows: PlacedReview[]): SessionAdvice {
  const secs = medianSeconds(rows)
  if (knee.verdict === 'fatigue' && knee.at !== null) {
    const n = Math.max(MIN_ADVISED, Math.min(MAX_ADVISED, knee.at))
    return {
      maxReviews: n,
      minutes: secs > 0 ? Math.max(1, Math.round((n * secs) / 60)) : null,
      breakMinutes: DEFAULT_BREAK,
      why: `Accuracy on held-out reviews is lower after about ${knee.at} reviews in a session. Stop near there, take a break, then start a new session.`,
    }
  }
  if (knee.verdict === 'steady')
    return {
      maxReviews: null,
      minutes: null,
      breakMinutes: DEFAULT_BREAK,
      why: 'No sign that accuracy falls inside your sessions. Keep your current session length.',
    }
  return {
    maxReviews: null,
    minutes: null,
    breakMinutes: DEFAULT_BREAK,
    why:
      knee.verdict === 'insufficient'
        ? 'Not enough sessions yet to say anything about fatigue.'
        : 'The data cannot tell a drop from no drop yet. Keep reviewing and check again.',
  }
}

/**
 * Cut a queue into chunks of at most `perSession` ids. The ids keep their
 * order and each appears once; duplicates in the input are dropped.
 */
export function splitQueue(queue: number[], perSession: number): number[][] {
  const n = Math.max(1, Math.floor(perSession))
  const seen = new Set<number>()
  const ids = queue.filter((id) => (seen.has(id) ? false : (seen.add(id), true)))
  const out: number[][] = []
  for (let i = 0; i < ids.length; i += n) out.push(ids.slice(i, i + n))
  return out
}
