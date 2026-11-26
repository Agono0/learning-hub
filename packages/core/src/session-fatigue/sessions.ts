/** Split a review stream into sessions and attach each review's difficulty baseline. */
import {
  FAT_DEFAULTS,
  clamp01,
  median,
  round3,
  type FatReview,
  type PlacedReview,
  type Session,
} from './cues'

export interface PlaceOptions {
  gapMinutes?: number
  maxReviews?: number
  maxSessions?: number
  minCardReviews?: number
}

export interface Placed {
  sessions: Session[]
  reviews: PlacedReview[]
  /** True when reviews or sessions were cut to the caps. */
  truncated: boolean
  /** Reviews dropped for a bad time or rating. */
  skipped: number
}

/**
 * Sessions are runs of reviews with no gap longer than `gapMinutes`. Position
 * and elapsed minutes count from each session's first review.
 *
 * Difficulty control: each review's baseline is its card's success rate over
 * every other review in the window (leave-one-out), so a hard card that
 * happens to come late does not look like fatigue. Cards with too few
 * reviews fall back to the overall success rate.
 */
export function placeReviews(all: FatReview[], opts: PlaceOptions = {}): Placed {
  const gap = (opts.gapMinutes ?? FAT_DEFAULTS.gapMinutes) * 60_000
  const maxReviews = opts.maxReviews ?? FAT_DEFAULTS.maxReviews
  const maxSessions = opts.maxSessions ?? FAT_DEFAULTS.maxSessions
  const minCard = opts.minCardReviews ?? FAT_DEFAULTS.minCardReviews

  let skipped = 0
  const clean = all
    .map((r) => ({ ...r, t: Date.parse(r.reviewedAt) }))
    .filter((r) => {
      const ok =
        Number.isFinite(r.t) &&
        r.rating >= 1 &&
        r.rating <= 4 &&
        Number.isFinite(r.timeMs) &&
        r.timeMs >= 0
      if (!ok) skipped++
      return ok
    })
    .sort((a, b) => a.t - b.t || a.cardId - b.cardId)
  let truncated = clean.length > maxReviews
  const kept = truncated ? clean.slice(clean.length - maxReviews) : clean

  // Card baselines (leave-one-out) and median times.
  const stat = new Map<number, { n: number; s: number; times: number[] }>()
  let totalS = 0
  const allTimes: number[] = []
  for (const r of kept) {
    const s = stat.get(r.cardId) ?? { n: 0, s: 0, times: [] }
    s.n++
    if (r.rating >= 3) s.s++
    if (r.timeMs <= FAT_DEFAULTS.maxTimeMs) {
      s.times.push(r.timeMs)
      allTimes.push(r.timeMs)
    }
    stat.set(r.cardId, s)
    if (r.rating >= 3) totalS++
  }
  const overall = kept.length ? totalS / kept.length : 0
  const globalMedian = median(allTimes) || 1
  const cardMedian = new Map<number, number>()
  for (const [id, s] of stat)
    if (s.times.length >= minCard) cardMedian.set(id, median(s.times) || 1)

  const sessions: Session[] = []
  const placed: PlacedReview[] = []
  let cur: { id: number; start: number; last: number; n: number } | null = null
  for (const r of kept) {
    if (!cur || r.t - cur.last > gap) {
      if (cur) closeSession(cur, sessions)
      cur = { id: sessions.length + 1, start: r.t, last: r.t, n: 0 }
    }
    cur.n++
    cur.last = r.t
    const s = stat.get(r.cardId)!
    const success = r.rating >= 3
    const baseline = s.n - 1 >= minCard ? (s.s - (success ? 1 : 0)) / (s.n - 1) : overall
    const ref = cardMedian.get(r.cardId) ?? globalMedian
    placed.push({
      cardId: r.cardId,
      rating: r.rating,
      timeMs: r.timeMs,
      reviewedAt: r.reviewedAt,
      sessionId: cur.id,
      position: cur.n,
      minute: round3((r.t - cur.start) / 60_000),
      success,
      baseline: round3(clamp01(baseline)),
      residual: round3((success ? 1 : 0) - clamp01(baseline)),
      speed: round3(
        Math.min(FAT_DEFAULTS.speedCap, Math.min(r.timeMs, FAT_DEFAULTS.maxTimeMs) / ref),
      ),
    })
  }
  if (cur) closeSession(cur, sessions)
  // Keep the newest sessions when there are too many.
  if (sessions.length > maxSessions) {
    truncated = true
    const keep = new Set(sessions.slice(sessions.length - maxSessions).map((s) => s.id))
    return {
      sessions: sessions.filter((s) => keep.has(s.id)),
      reviews: placed.filter((r) => keep.has(r.sessionId)),
      truncated,
      skipped,
    }
  }
  return { sessions, reviews: placed, truncated, skipped }
}

function closeSession(
  c: { id: number; start: number; last: number; n: number },
  out: Session[],
): void {
  out.push({
    id: c.id,
    startedAt: new Date(c.start).toISOString(),
    endedAt: new Date(c.last).toISOString(),
    reviews: c.n,
    minutes: round3((c.last - c.start) / 60_000),
  })
}
