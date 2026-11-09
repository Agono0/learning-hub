/**
 * Bayesian Knowledge Tracing (4-parameter HMM) — skill mastery estimation.
 * Verified formulas (BKT literature):
 *   P(L|correct)   = P(L)·(1−S) / (P(L)·(1−S) + (1−P(L))·G)
 *   P(L|incorrect) = P(L)·S     / (P(L)·S + (1−P(L))·(1−G))
 *   P(L_next)      = P(L|evidence) + (1 − P(L|evidence))·P(T)
 * Mastery gate: P(known) ≥ 0.95 (typical threshold, plan MASTERY_THRESHOLD).
 */
import { MASTERY_THRESHOLD, type BKTParams } from './types'

/** Standard BKT parameter set (Corbett & Anderson-style defaults). */
export const DEFAULT_BKT: BKTParams = { pInit: 0.1, pTransit: 0.15, pGuess: 0.2, pSlip: 0.1 }

/** One BKT evidence step: posterior P(known | outcome) plus the learning transition. */
export function bktUpdate(
  pKnown: number,
  correct: boolean,
  params: BKTParams = DEFAULT_BKT,
): number {
  const { pGuess: G, pSlip: S, pTransit: T } = params
  const conditional = correct
    ? (pKnown * (1 - S)) / (pKnown * (1 - S) + (1 - pKnown) * G)
    : (pKnown * S) / (pKnown * S + (1 - pKnown) * (1 - G))
  return conditional + (1 - conditional) * T
}

/** Mastery gate: pKnown ≥ threshold AND enough attempts. */
export function isMastered(pKnown: number, attempts: number, minAttempts = 5): boolean {
  return pKnown >= MASTERY_THRESHOLD && attempts >= minAttempts
}

/** Probability the learner is ready to unlock dependents (used by DAG gating). */
export function unlockProbability(pKnown: number): number {
  if (pKnown >= 0.95) return 1
  if (pKnown <= 0.5) return 0
  return Math.max(0, Math.min(1, (pKnown - 0.5) / 0.45)) // 0.5 → 0, 0.95 → 1
}
