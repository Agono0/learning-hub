/**
 * Mastery service — the single canonical path for BKT/Elo skill-mastery
 * updates (AGENTS.md rule 7: "One grading path… never update FSRS/XP/mastery
 * by hand"). Every site that records a graded skill response routes through
 * {@link applySkillResponse}; no other module may write `mastery` or
 * `elo_events`.
 *
 * Invariants (enforced here, documented for reviewers):
 * - Runs inside the caller's transaction — this module never opens its own
 *   (rule 6: async work precedes `withTransaction`).
 * - `elo_events` is append-only (rule 8): one row per response, never updated.
 * - FSRS card state is NEVER touched here: an exam answer is not a card
 *   review, so exam submits pass no card context and skip scheduling entirely.
 * - Both historical callers are preserved bit-for-bit (golden-tested in
 *   apps/web/tests/mastery-golden.test.ts):
 *   • exam submit — learnerAttempts defaults to the current mastery attempts;
 *   • review path  — passes `learnerAttempts: card.reps` explicitly (the FSRS
 *     repetition count drives the K decay on that path).
 *   These two conventions differ today; unifying them is a deliberate,
 *   separately-tested behavior change — never a side effect of refactoring.
 */
import { eq } from 'drizzle-orm'
import { applyReviewToMastery, eloUpdate } from '@learning-hub/core'
import { mastery, eloEvents } from './schema'
import type { Transaction } from './transaction'

export interface SkillResponseInput {
  /** Target skill (mastery.skill_id FK). */
  skillId: number
  /** Answer quality ∈ [0, 1] — 1 = fully correct (eloUpdate clamps internally). */
  outcome: number
  /** Correctness used for the BKT update and the attempts/correct tallies. */
  correct: boolean
  /**
   * Learner attempt count fed to the Elo K-decay (`eloUpdate` arg 4).
   * Omit → the current mastery row's attempts (exam-submit semantics).
   * The canonical review path passes the card's FSRS `reps` explicitly.
   */
  learnerAttempts?: number
  /** Wall-clock ms for the elo_events row; defaults to schema now(). */
  atMs?: number
}

export interface SkillResponseResult {
  skillId: number
  /** BKT posterior after this response (also written to mastery.p_known). */
  pKnownAfter: number
  ratingBefore: number
  ratingAfter: number
  attemptsAfter: number
  correctAfter: number
}

/**
 * Apply one graded skill response to the BKT/Elo mastery model — the ONE
 * write path for `mastery` rows and `elo_events` rows (rule 7).
 */
export function applySkillResponse(
  tx: Transaction,
  input: SkillResponseInput,
): SkillResponseResult {
  const row = tx.select().from(mastery).where(eq(mastery.skillId, input.skillId)).limit(1).get()

  const before = row ?? { pKnown: 0.1, attempts: 0, correct: 0 }
  const after = applyReviewToMastery(before, input.correct)
  const learnerAttempts = input.learnerAttempts ?? row?.attempts ?? 0
  const eloCalc = eloUpdate(row?.elo ?? 1000, 1000, input.outcome, learnerAttempts, 0)
  const nowIso = input.atMs !== undefined ? new Date(input.atMs).toISOString() : undefined

  const eventValues = {
    skillId: input.skillId,
    ratingBefore: eloCalc.ratingBefore,
    ratingAfter: eloCalc.ratingAfter,
    itemDifficulty: eloCalc.itemDifficultyBefore,
    outcome: input.outcome,
    ...(nowIso !== undefined ? { createdAt: nowIso } : {}),
  }
  tx.insert(eloEvents).values(eventValues).run()

  if (row) {
    tx.update(mastery)
      .set({
        pKnown: after.pKnown,
        attempts: after.attempts,
        correct: after.correct,
        elo: eloCalc.ratingAfter,
        updatedAt: nowIso ?? new Date().toISOString(),
      })
      .where(eq(mastery.id, row.id))
      .run()
  } else {
    tx.insert(mastery)
      .values({
        skillId: input.skillId,
        pKnown: after.pKnown,
        attempts: after.attempts,
        correct: after.correct,
        elo: eloCalc.ratingAfter,
        ...(nowIso !== undefined ? { updatedAt: nowIso } : {}),
      })
      .onConflictDoNothing()
      .run()
  }

  return {
    skillId: input.skillId,
    pKnownAfter: after.pKnown,
    ratingBefore: eloCalc.ratingBefore,
    ratingAfter: eloCalc.ratingAfter,
    attemptsAfter: after.attempts,
    correctAfter: after.correct,
  }
}
