import { evaluateFsrsWeights, FSRS6_DEFAULT_WEIGHTS } from '../fsrs-optimizer'
import type { Calibration, PlannerReview } from './model'

export const HOLDOUT_SHARE = 0.2
export const MIN_HOLDOUT = 200

/**
 * Measured calibration of predicted vs observed recall on the newest 20% of the
 * history. Read-only. The stored weights have no recorded fit date, so they may
 * have been fit on this slice; default weights are a reference, not a clean test.
 */
export function calibrateHeldOut(
  reviews: readonly PlannerReview[],
  weights: readonly number[] | null,
): Calibration {
  const custom = !!weights && weights.length > 0
  const cut = Math.floor(reviews.length * (1 - HOLDOUT_SHARE))
  const held = reviews.slice(cut)
  if (held.length < MIN_HOLDOUT) {
    return {
      heldOutReviews: held.length,
      scored: 0,
      activeLogLoss: null,
      activeRmse: null,
      defaultLogLoss: null,
      defaultRmse: null,
      usingCustomWeights: custom,
      note: `Not validated: only ${held.length} held-out reviews (need ${MIN_HOLDOUT}).`,
    }
  }
  // Cards need their earlier reviews for state, so score the held-out transitions
  // by replaying the whole history and counting only transitions in the slice.
  const heldIds = new Set(held.map((r) => r.id))
  const all = reviews.map((r) => ({
    id: r.id,
    cardId: r.cardId,
    rating: r.rating,
    reviewedAt: r.reviewedAt,
    elapsedDays: r.elapsedDays,
  }))
  const slice = all.filter((r) => heldIds.has(r.id))
  const active = evaluateFsrsWeights(slice, custom ? weights! : FSRS6_DEFAULT_WEIGHTS)
  const def = evaluateFsrsWeights(slice, FSRS6_DEFAULT_WEIGHTS)
  return {
    heldOutReviews: held.length,
    scored: active.sampleCount,
    activeLogLoss: active.logLoss,
    activeRmse: active.rmse,
    defaultLogLoss: def.logLoss,
    defaultRmse: def.rmse,
    usingCustomWeights: custom,
    note: custom
      ? 'Newest 20% of reviews. The stored custom weights have no recorded fit date and may have been fit on these reviews, so their score may be in-sample. Default weights are a reference, not a clean test.'
      : 'Newest 20% of reviews, scored with the default FSRS-6 weights (never fit to you).',
  }
}
