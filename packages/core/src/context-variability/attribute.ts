/** Attach a context (place, noise, time of day) to every review. */
import {
  CTX_DEFAULTS,
  UNLOGGED,
  bucketOfHour,
  localHour,
  localWeekday,
  type CtxReview,
  type CtxSession,
  type ReviewContext,
} from './cues'

export interface AttributeOptions {
  /** Minutes east of UTC. Default 0. */
  tzOffsetMinutes?: number
  now?: Date
  openSessionHours?: number
}

/**
 * A review belongs to the session that started most recently at or before it,
 * provided the session had not ended by then. Open sessions are cut off after
 * `openSessionHours` so a forgotten session cannot claim a week of reviews.
 */
export function attributeReviews(
  reviews: CtxReview[],
  sessions: CtxSession[],
  opts: AttributeOptions = {},
): ReviewContext[] {
  const tz = opts.tzOffsetMinutes ?? 0
  const openMs = (opts.openSessionHours ?? CTX_DEFAULTS.openSessionHours) * 3_600_000
  const spans = sessions
    .map((s) => {
      const start = Date.parse(s.startedAt)
      const end = s.endedAt ? Date.parse(s.endedAt) : start + openMs
      return { s, start, end: Number.isFinite(end) ? end : start + openMs }
    })
    .filter((x) => Number.isFinite(x.start))
    .sort((a, b) => a.start - b.start)

  const out: ReviewContext[] = []
  for (const r of reviews) {
    const t = Date.parse(r.reviewedAt)
    if (!Number.isFinite(t)) continue
    let hit: (typeof spans)[number] | undefined
    for (let i = spans.length - 1; i >= 0; i--) {
      const sp = spans[i]!
      if (sp.start <= t) {
        if (t <= sp.end) hit = sp
        break
      }
    }
    const hour = localHour(r.reviewedAt, tz)
    const day = localWeekday(r.reviewedAt, tz)
    out.push({
      cardId: r.cardId,
      success: r.rating >= 3,
      at: r.reviewedAt,
      place: hit ? hit.s.place : UNLOGGED,
      noise: hit ? hit.s.noise : null,
      bucket: bucketOfHour(hour),
      dayType: day === 0 || day === 6 ? 'weekend' : 'weekday',
      hour,
    })
  }
  return out
}
