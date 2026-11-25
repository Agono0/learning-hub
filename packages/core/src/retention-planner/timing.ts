import type { PassMix, PlannerReview, TimingEstimate } from './model'

export const DEFAULT_REVIEW_SECONDS = 8
export const MIN_TIME_MS = 500
export const MAX_TIME_MS = 180_000
export const TIMING_WINDOW = 2000
const MIN_PER_RATING = 30
const MIN_OVERALL = 50
/** If one exact value covers more than this share, rows look imported or synthetic. */
const REPEAT_SHARE_LIMIT = 0.4

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** Robust review-time estimate from the newest TIMING_WINDOW reviews. Pure. */
export function estimateTiming(reviews: readonly PlannerReview[]): TimingEstimate {
  const recent = reviews.slice(-TIMING_WINDOW)
  const considered = recent.length
  const kept = recent.filter((r) => r.timeMs >= MIN_TIME_MS && r.timeMs <= MAX_TIME_MS)
  const coverage = considered === 0 ? 0 : kept.length / considered
  const fallback = (note: string): TimingEstimate => ({
    source: 'default',
    secondsByRating: [
      DEFAULT_REVIEW_SECONDS,
      DEFAULT_REVIEW_SECONDS,
      DEFAULT_REVIEW_SECONDS,
      DEFAULT_REVIEW_SECONDS,
    ],
    secondsOverall: DEFAULT_REVIEW_SECONDS,
    usable: kept.length,
    considered,
    coverage,
    note,
  })
  if (kept.length < MIN_OVERALL) {
    return fallback(
      `Only ${kept.length} of ${considered} recent reviews have a usable time (0.5 s to 180 s). Using a default of ${DEFAULT_REVIEW_SECONDS} s per review.`,
    )
  }
  const counts = new Map<number, number>()
  for (const r of kept) counts.set(r.timeMs, (counts.get(r.timeMs) ?? 0) + 1)
  const top = Math.max(...counts.values())
  if (top / kept.length > REPEAT_SHARE_LIMIT) {
    return fallback(
      `${Math.round((top / kept.length) * 100)}% of review times are one identical value, which looks imported or synthetic. Using a default of ${DEFAULT_REVIEW_SECONDS} s per review.`,
    )
  }
  const overall = median(kept.map((r) => r.timeMs)) / 1000
  const byRating = [1, 2, 3, 4].map((rating) => {
    const rows = kept.filter((r) => r.rating === rating)
    return rows.length >= MIN_PER_RATING ? median(rows.map((r) => r.timeMs)) / 1000 : null
  })
  const perRating = byRating.some((v) => v !== null)
  const secondsByRating = byRating.map((v) => v ?? overall) as [number, number, number, number]
  return {
    source: perRating ? 'per-rating-median' : 'overall-median',
    secondsByRating,
    secondsOverall: overall,
    usable: kept.length,
    considered,
    coverage,
    note: `Median of ${kept.length} of ${considered} recent reviews with a usable time (0.5 s to 180 s). Idle gaps above 180 s are dropped, not averaged.`,
  }
}

export const DEFAULT_PASS_MIX = { hard: 0.1, good: 0.8, easy: 0.1 }
const MIN_MIX = 30

/** Share of Hard/Good/Easy among passing reviews in the history. An explicit assumption. */
export function estimatePassMix(reviews: readonly PlannerReview[]): PassMix {
  const passes = reviews.filter((r) => r.rating >= 2)
  if (passes.length < MIN_MIX) return { ...DEFAULT_PASS_MIX, n: passes.length, source: 'default' }
  const c = { hard: 0, good: 0, easy: 0 }
  for (const r of passes) {
    if (r.rating === 2) c.hard++
    else if (r.rating === 3) c.good++
    else c.easy++
  }
  const n = passes.length
  return { hard: c.hard / n, good: c.good / n, easy: c.easy / n, n, source: 'history' }
}
