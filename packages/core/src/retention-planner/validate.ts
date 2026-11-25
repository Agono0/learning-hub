import { evaluateFsrsWeights, FSRS6_DEFAULT_WEIGHTS } from '../fsrs-optimizer'
import type { Calibration, PlannerReview } from './model'

export const HOLDOUT_EVERY = 5
export const MIN_HOLDOUT = 200

/**
 * Measured calibration of predicted vs observed recall on a held-out fifth of
 * CARDS (every 5th card id), each with its COMPLETE review history so per-card
 * memory state is replayed correctly. Read-only. This is not a time split and
 * not a clean out-of-sample test: stored custom weights have no recorded fit
 * date and may have been fit on these cards; default weights are a reference.
 */
export function calibrateHeldOut(
  reviews: readonly PlannerReview[],
  weights: readonly number[] | null,
): Calibration {
  const custom = !!weights && weights.length > 0
  const held = reviews.filter((r) => r.cardId % HOLDOUT_EVERY === 0)
  if (held.length < MIN_HOLDOUT) {
    return {
      heldOutReviews: held.length,
      scored: 0,
      activeLogLoss: null,
      activeRmse: null,
      defaultLogLoss: null,
      defaultRmse: null,
      usingCustomWeights: custom,
      note: `Not validated: only ${held.length} reviews on the held-out cards (need ${MIN_HOLDOUT}).`,
    }
  }
  const slice = held.map((r) => ({
    id: r.id,
    cardId: r.cardId,
    rating: r.rating,
    reviewedAt: r.reviewedAt,
    elapsedDays: r.elapsedDays,
  }))
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
      ? 'Every 5th card, full history each (not a time split). The stored custom weights have no recorded fit date and may have been fit on these cards, so their score may be in-sample. Default weights are a reference, not a clean test.'
      : 'Every 5th card, full history each (not a time split), scored with the default FSRS-6 weights (never fit to you).',
  }
}
