/**
 * Behavioural evidence for one pair: does a card fail more often right after
 * its lookalike was reviewed? Reviews of card X count as "exposed" when the
 * other card was reviewed within the lag window just before. This is
 * observational (cards reviewed together may share a hard topic) and reviews
 * of one card are not independent, so the interval is rough and the verdict is
 * conservative.
 */
import { INF_DEFAULTS, clamp01, round3, type InfReview } from './cues'

export interface Evidence {
  /** Reviews of either card that came within the lag window after the other card. */
  exposedReviews: number
  exposedFails: number
  /** Reviews with no recent review of the other card. */
  otherReviews: number
  otherFails: number
  exposedFailRate: number | null
  otherFailRate: number | null
  /** exposedFailRate minus otherFailRate. Positive means failing more right after the lookalike. */
  lift: number | null
  liftLow: number | null
  liftHigh: number | null
  verdict: 'interfering' | 'no-signal' | 'insufficient'
}

/** Normal-approximation interval on a difference of two proportions. */
function diffInterval(s1: number, n1: number, s2: number, n2: number) {
  const p1 = s1 / n1
  const p2 = s2 / n2
  const se = Math.sqrt((p1 * (1 - p1)) / n1 + (p2 * (1 - p2)) / n2)
  const d = p1 - p2
  return { d, low: d - 1.96 * se, high: d + 1.96 * se }
}

export const FAIL_RATING = 1
/** The lift interval must start above this to call a pair interfering. */
export const LIFT_THRESHOLD = 0.05

export function pairEvidence(
  a: number,
  b: number,
  reviews: InfReview[],
  lagHours: number = INF_DEFAULTS.lagHours,
  minGroup: number = INF_DEFAULTS.minGroup,
): Evidence {
  const rows = reviews
    .filter((r) => r.cardId === a || r.cardId === b)
    .map((r) => ({ cardId: r.cardId, fail: r.rating <= FAIL_RATING, t: Date.parse(r.reviewedAt) }))
    .filter((r) => Number.isFinite(r.t))
    .sort((x, y) => x.t - y.t)
  const lag = lagHours * 3_600_000
  const last = new Map<number, number>()
  let eN = 0
  let eF = 0
  let oN = 0
  let oF = 0
  for (const r of rows) {
    const other = r.cardId === a ? b : a
    const seen = last.get(other)
    const exposed = seen !== undefined && r.t - seen <= lag && r.t - seen >= 0
    if (exposed) {
      eN++
      if (r.fail) eF++
    } else {
      oN++
      if (r.fail) oF++
    }
    last.set(r.cardId, r.t)
  }
  const base: Evidence = {
    exposedReviews: eN,
    exposedFails: eF,
    otherReviews: oN,
    otherFails: oF,
    exposedFailRate: eN ? round3(eF / eN) : null,
    otherFailRate: oN ? round3(oF / oN) : null,
    lift: null,
    liftLow: null,
    liftHigh: null,
    verdict: 'insufficient',
  }
  if (eN < minGroup || oN < minGroup) return base
  const { d, low, high } = diffInterval(eF, eN, oF, oN)
  return {
    ...base,
    lift: round3(d),
    liftLow: round3(low),
    liftHigh: round3(high),
    verdict: low > LIFT_THRESHOLD ? 'interfering' : 'no-signal',
  }
}

/** Per-card fail rate over a review list (null when the card has no reviews). */
export function failRate(cardId: number, reviews: InfReview[]): { n: number; rate: number | null } {
  let n = 0
  let f = 0
  for (const r of reviews) {
    if (r.cardId !== cardId) continue
    n++
    if (r.rating <= FAIL_RATING) f++
  }
  return { n, rate: n ? round3(clamp01(f / n)) : null }
}
