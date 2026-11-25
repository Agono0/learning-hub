/**
 * Retention Planner read repository. Pure reads: cards, active revlog and the
 * retention/weights currently in force. Writes nothing.
 */
import { desc, eq, sql } from 'drizzle-orm'
import {
  MAX_CARDS_READ,
  type PlannerCard,
  type PlannerInput,
  type PlannerReview,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { cards, decks, revlog, userSettings } from '../schema'

/** Most revlog rows ever read for timing and calibration. */
export const PLANNER_MAX_REVLOG = 50_000

export interface PlannerData extends PlannerInput {
  /** True when the read ceiling cut the card list short. */
  cardsTruncated: boolean
}

export function loadRetentionPlannerData(
  opts: { deckId?: number; now?: Date; db?: LearningHubDB } = {},
): PlannerData {
  const database = opts.db ?? getDb()
  const now = opts.now ?? new Date()
  const settings = database.select().from(userSettings).limit(1).get()
  let currentRetention = settings?.desiredRetention ?? 0.9
  let currentSource: 'deck' | 'global' = 'global'
  let weights: number[] | null = settings?.fsrsWeights ?? null
  if (opts.deckId !== undefined) {
    const deck = database.select().from(decks).where(eq(decks.id, opts.deckId)).limit(1).get()
    if (deck) {
      if (deck.desiredRetention !== null && deck.desiredRetention !== undefined) {
        currentRetention = deck.desiredRetention
        currentSource = 'deck'
      }
      if (deck.fsrsWeights && deck.fsrsWeights.length > 0) weights = deck.fsrsWeights
    }
  }
  const base = database.select().from(cards)
  const rows = (opts.deckId === undefined ? base : base.where(eq(cards.deckId, opts.deckId)))
    .limit(MAX_CARDS_READ + 1)
    .all()
  const cardsTruncated = rows.length > MAX_CARDS_READ
  const plannerCards: PlannerCard[] = rows.slice(0, MAX_CARDS_READ).map((r) => ({
    id: r.id,
    deckId: r.deckId,
    state: r.state,
    suspended: r.suspended,
    stability: r.stability,
    difficulty: r.difficulty,
    due: r.due,
    lastReview: r.lastReview,
    scheduledDays: r.scheduledDays,
    reps: r.reps,
    lapses: r.lapses,
    learningStep: r.learningStep,
  }))
  const revRows = database
    .select({
      id: revlog.id,
      cardId: revlog.cardId,
      rating: revlog.rating,
      reviewedAt: revlog.reviewedAt,
      elapsedDays: revlog.elapsedDays,
      timeMs: revlog.timeMs,
    })
    .from(revlog)
    .where(sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`)
    .orderBy(desc(revlog.id))
    .limit(PLANNER_MAX_REVLOG)
    .all()
    .reverse()
  const reviews = revRows.filter((r) => r.rating >= 1 && r.rating <= 4) as PlannerReview[]
  return {
    cards: plannerCards,
    reviews,
    weights,
    currentRetention,
    currentSource,
    now,
    cardsTruncated,
  }
}
