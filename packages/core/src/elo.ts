/**
 * Elo rating for learners and items (chess.com puzzle-rating pattern).
 * Verified formulas: expected E = 1/(1+10^((D-R)/400)); R += K·(outcome−E);
 * K decays with attempts for stability: K = K0/(1 + attempts/const).
 * Used by: review grading, skill ladder, curriculum gating.
 */

export interface EloUpdate {
  ratingBefore: number
  ratingAfter: number
  itemDifficultyBefore: number
  itemDifficultyAfter: number
  expected: number
}

/** outcome ∈ [0,1] — 1 = fully correct (Easy/Good+sure), 0 = fully wrong (Again). */
export function outcomeFrom(grade: 1 | 2 | 3 | 4, confidence: 0 | 1): number {
  const gradeScore = (grade - 1) / 3 // 0 .. 1
  return 0.7 * gradeScore + 0.3 * confidence
}

/** One Elo exchange: update the learner rating and the item difficulty (K decays with attempts). */
export function eloUpdate(
  learnerRating: number,
  itemDifficulty: number,
  outcome: number,
  learnerAttempts: number,
  itemAttempts: number,
  opts?: { k0?: number; decay?: number },
): EloUpdate {
  // A NaN or out-of-range outcome would poison both ratings permanently.
  const o = Number.isFinite(outcome) ? clamp(outcome, 0, 1) : 0.5
  const k0 = opts?.k0 ?? 32
  const decay = opts?.decay ?? 400
  const expected = 1 / (1 + Math.pow(10, (itemDifficulty - learnerRating) / 400))
  const kLearner = k0 / (1 + learnerAttempts / decay)
  const kItem = k0 / (1 + itemAttempts / decay)
  const ratingAfter = clamp(learnerRating + kLearner * (o - expected), 100, 3000)
  const itemDifficultyAfter = clamp(itemDifficulty + kItem * (expected - o), 100, 3000)
  return {
    ratingBefore: learnerRating,
    ratingAfter,
    itemDifficultyBefore: itemDifficulty,
    itemDifficultyAfter: itemDifficultyAfter,
    expected,
  }
}

/** chess.com-style streak bonus: +5 rating points per streak step, capped. */
export function streakBonus(currentStreak: number, cap = 10): number {
  return Math.max(0, Math.min(currentStreak, cap)) * 5
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x))
}
