/**
 * Successive relearning (Rawson & Dunlosky 2011): within one session, a card
 * that was failed must be recalled CORRECTLY N times — with other cards in
 * between — before it counts as learned. The criterion converts the review
 * session's simple "Again → re-queue" into the criterion-based procedure that
 * gained roughly a letter grade in the classroom studies.
 *
 * Pure module — the session UI owns the per-card state; grading itself is
 * untouched (every recall still goes through the one grading path).
 */

export * from '../successive-relearning/successive-relearning-engine'

/** Per-card within-session state for the criterion. */
export interface SuccessiveState {
  /** correct recalls this session */
  correct: number
  /** failed recalls this session */
  mistakes: number
  /** correct recalls since the last mistake (or since start) */
  streakSinceMistake: number
}

export function initialSrState(): SuccessiveState {
  return { correct: 0, mistakes: 0, streakSinceMistake: 0 }
}

/** Fold one graded recall into the card's session state. */
export function recordSrResult(s: SuccessiveState, correct: boolean): SuccessiveState {
  return {
    correct: s.correct + (correct ? 1 : 0),
    mistakes: s.mistakes + (correct ? 0 : 1),
    streakSinceMistake: correct ? s.streakSinceMistake + 1 : 0,
  }
}

/**
 * True when the card has been failed this session and has not yet reached the
 * criterion — it must be re-queued. A card never failed this session is the
 * scheduler's business (FSRS), not the criterion's.
 */
export function needsAnotherRecall(s: SuccessiveState, criterion = 1): boolean {
  return s.mistakes > 0 && s.streakSinceMistake < criterion
}
