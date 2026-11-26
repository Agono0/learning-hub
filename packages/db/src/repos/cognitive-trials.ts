/**
 * Cognitive-trials repository — the shared read-only queries that turn raw
 * `revlog` history into the trial shapes the metacognition engines consume
 * (calibration profile, hypercorrection crucible).
 *
 * One definition, every host: web handlers, the headless server and MCP tools
 * previously each re-implemented these queries and mappings, and the copies
 * had drifted — only the web handlers excluded undone reviews, so a review the
 * learner erased still counted as a miss/success on the other hosts. Every
 * query here therefore excludes rows that have an entry in `revlog_undos`,
 * joins the cards table for FSRS state, and defers all row→trial mapping to
 * @learning-hub/core's canonical derivations (`correctionTrialsFromRows`,
 * `judgmentOfLearningFromRevlogRows`). The repos gather facts; the engines
 * own the math.
 */
import { rowLimit } from '../limits'
import { and, desc, eq, sql, type SQL } from 'drizzle-orm'
import {
  confidenceToForecast,
  correctionTrialsFromRows,
  type CorrectionTrial,
  type RelearnCandidate,
  type RevlogTrialRow,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { cards, revlog } from '../schema'

/** A revlog trial row plus the FSRS state of its card (0 = new/unset). */
export interface RevlogTrialRowWithCardState extends RevlogTrialRow {
  /** FSRS stability of the card at query time (0 when the card is new). */
  stability: number
  /** FSRS difficulty of the card at query time (0 when the card is new). */
  difficulty: number
}

/** Options for the shared trial queries. */
export interface RevlogTrialQueryOptions {
  /** Max rows returned (newest first). Each host keeps its sampling window. */
  limit: number
  /** Restrict to one deck's cards. */
  deckId?: number
  /** Override the database handle (tests). */
  database?: LearningHubDB
}

/**
 * Newest-first revlog trial rows (rating, stored confidence, latency) joined
 * with the card's current FSRS state. Undone reviews are excluded so every
 * host derives its trials from the same effective history.
 */
export function getRevlogTrialRows(
  options: RevlogTrialQueryOptions,
): RevlogTrialRowWithCardState[] {
  const db = options.database ?? getDb()

  const conditions: SQL[] = [
    sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`,
  ]
  if (options.deckId !== undefined) conditions.push(eq(cards.deckId, options.deckId))

  return db
    .select({
      cardId: revlog.cardId,
      rating: revlog.rating,
      confidence: revlog.confidence,
      timeMs: revlog.timeMs,
      stability: cards.stability,
      difficulty: cards.difficulty,
    })
    .from(revlog)
    .innerJoin(cards, eq(revlog.cardId, cards.id))
    .where(and(...conditions))
    .orderBy(desc(revlog.id))
    .limit(rowLimit(options.limit))
    .all()
}

/**
 * Reconstructs correction trials from newest-first revlog rows using core's
 * canonical crucible walk (a miss arms its card; the card's next success
 * counts as the correction — Butterfield & Metcalfe 2001) and seeds the FSRS
 * relearning queue from the joined card state: uncorrected misses become
 * candidates with their real stability/difficulty, falling back to
 * stability 1 / difficulty 6 for fresh cards.
 */
export function reconstructCorrectionTrials(rows: RevlogTrialRowWithCardState[]): {
  corrections: CorrectionTrial[]
  candidates: RelearnCandidate[]
} {
  const { corrections, armedMisses } = correctionTrialsFromRows(rows)

  const stateById = new Map(rows.map((r) => [r.cardId, r]))
  const candidates: RelearnCandidate[] = armedMisses.map(({ cardId, confidence }) => {
    const card = stateById.get(cardId)
    return {
      cardId,
      errorConfidence: confidenceToForecast(confidence),
      stability: card && card.stability > 0 ? card.stability : 1,
      difficulty: card && card.difficulty > 0 ? card.difficulty : 6,
      wasAlreadyCorrected: false,
    }
  })

  return { corrections, candidates }
}
