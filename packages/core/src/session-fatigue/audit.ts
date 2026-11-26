/** The full session-fatigue audit. */
import { FAT_DEFAULTS, round3, type FatReview, type Session } from './cues'
import { positionCurve, type Bin } from './curve'
import { findKnee, type Knee } from './knee'
import { adviseSession, medianSeconds, type SessionAdvice } from './plan'
import { placeReviews } from './sessions'

export interface FatAudit {
  asOf: string
  windowDays: number
  reviews: number
  sessions: number
  /** Sessions long enough to carry a signal. */
  usableSessions: number
  truncated: boolean
  skipped: number
  medianSessionReviews: number
  medianSecondsPerReview: number
  curve: Bin[]
  knee: Knee
  /** Mean excess in the first 5 reviews minus reviews 6 to 20: a negative value means a slow start. */
  warmup: { first: number | null; next: number | null; slowStart: boolean }
  advice: SessionAdvice
  /** Most recent sessions, newest first (at most 10). */
  recent: Session[]
}

export interface FatAuditOptions {
  now?: Date
  windowDays?: number
}

export function runFatigueAudit(reviews: FatReview[], opts: FatAuditOptions = {}): FatAudit {
  const now = opts.now ?? new Date()
  const windowDays = opts.windowDays ?? FAT_DEFAULTS.windowDays
  const since = now.getTime() - windowDays * 86_400_000
  const inWin = reviews.filter((r) => {
    const t = Date.parse(r.reviewedAt)
    return Number.isFinite(t) && t >= since && t <= now.getTime()
  })
  const placed = placeReviews(inWin)
  const usableIds = new Set(
    placed.sessions.filter((s) => s.reviews >= FAT_DEFAULTS.minSessionReviews).map((s) => s.id),
  )
  const usable = placed.reviews.filter((r) => usableIds.has(r.sessionId))
  const knee = findKnee(usable)
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const first = usable.filter((r) => r.position <= 5)
  const next = usable.filter((r) => r.position > 5 && r.position <= 20)
  const mFirst = first.length >= 30 ? mean(first.map((r) => r.residual)) : null
  const mNext = next.length >= 30 ? mean(next.map((r) => r.residual)) : null
  const sizes = placed.sessions.map((s) => s.reviews).sort((a, b) => a - b)
  return {
    asOf: now.toISOString(),
    windowDays,
    reviews: placed.reviews.length,
    sessions: placed.sessions.length,
    usableSessions: usableIds.size,
    truncated: placed.truncated,
    skipped: placed.skipped,
    medianSessionReviews: sizes.length ? (sizes[Math.floor(sizes.length / 2)] as number) : 0,
    medianSecondsPerReview: medianSeconds(placed.reviews),
    curve: positionCurve(usable),
    knee,
    warmup: {
      first: mFirst === null ? null : round3(mFirst),
      next: mNext === null ? null : round3(mNext),
      slowStart: mFirst !== null && mNext !== null && mNext - mFirst > FAT_DEFAULTS.dropThreshold,
    },
    advice: adviseSession(knee, usable),
    recent: [...placed.sessions].reverse().slice(0, 10),
  }
}
