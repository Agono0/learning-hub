/**
 * Learning HUB — Canonical Spaced Repetition Review Engine.
 *
 * Implements the atomic review service contract shared across Web UI, Matching Games,
 * Model Context Protocol (MCP) server, and Terminal CLI.
 *
 * Features:
 * - FSRS-6 state transitions via ts-fsrs and @learning-hub/core
 * - Predicted retrievability calculation (Feature 10 / Addon 10)
 * - Safe streak tracking preserving current and best records (DEF-001)
 * - Unified XP rewards and Elo/BKT skill tree progression (DEF-005)
 * - 100% atomic synchronous transactions with rollback on failure
 */
import { eq, inArray, sql } from 'drizzle-orm'
import { DefaultScheduler, type Grade as FsrsGrade } from 'ts-fsrs'
import {
  type Grade,
  type Confidence,
  type StreakState,
  XP_REWARDS,
  recordActivity,
  outcomeFrom,
  eloUpdate,
  bktUpdate,
  cardRowToFsrs,
  fsrsToCardRow,
  parseFsrsWeights,
  eventBus,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from './index'
import { withTransaction, type Transaction } from './transaction'
import { cards, decks, revlog, streaks, xpEvents, eloEvents, mastery, userSettings } from './schema'

/** One card grade to process (all fields optional except cardId and grade). */
export interface ReviewPayload {
  cardId: number
  grade: Grade // 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)
  confidence?: Confidence // 0 (Uncertain) | 1 (Confident) - defaults to 1
  timeMs?: number // Milliseconds spent on review - defaults to 5000
  today?: string | Date // Review timestamp - defaults to new Date()
  desiredRetention?: number // Override deck/user setting (0.9)
  fsrsWeights?: readonly number[] | null // Override deck/user FSRS-6 weights
}

/** Full outcome of one review: card before/after, revlog row, streak, XP, Elo. */
export interface ReviewResult {
  card: typeof cards.$inferSelect
  preReview: typeof cards.$inferSelect
  revlog: typeof revlog.$inferSelect
  streak: StreakState
  xpEarned: number
  elo?: {
    skillId: number
    ratingBefore: number
    ratingAfter: number
    outcome: number
  } | null
  newElo?: number
  retrievability?: number | null
}

/** Optional overrides for review execution (test-db injection, fixed clock). */
export interface ReviewOptions {
  db?: LearningHubDB
  now?: Date
}

/** Thrown when a review references a cardId that does not exist (→ 404). */
export class CardNotFoundError extends Error {
  constructor(cardId: number) {
    super(`Card not found: ${cardId}`)
    this.name = 'CardNotFoundError'
  }
}

/** Thrown when a review payload fails validation (→ 400). */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

const DAY_MS = 86_400_000

/**
 * Update the streak row inside an active transaction (DEF-001 fix: safely
 * preserve the existing current and best streaks). Reads the single streaks
 * row, applies core's `recordActivity` for `now`, then updates — or inserts,
 * when no row exists yet — and returns the resulting StreakState.
 * Shared by the review engine and the route adapters that already hold a tx.
 */
export function updateStreakInTx(tx: Transaction, now: Date): StreakState {
  const streakRow = tx.select().from(streaks).limit(1).get()
  const initialStreak: StreakState = {
    current: streakRow?.current ?? 0,
    best: streakRow?.best ?? 0,
    lastActiveDate: streakRow?.lastActiveDate ?? null,
    freezes: streakRow?.freezes ?? 2,
    weekendAmulet: Boolean(streakRow?.weekendAmulet),
  }
  const nextStreak = recordActivity(initialStreak, now)
  const streakValues = {
    current: nextStreak.current,
    best: nextStreak.best,
    lastActiveDate: nextStreak.lastActiveDate,
    freezes: nextStreak.freezes,
    weekendAmulet: nextStreak.weekendAmulet,
    updatedAt: now.toISOString(),
  }
  if (streakRow) {
    tx.update(streaks).set(streakValues).where(eq(streaks.id, streakRow.id)).run()
  } else {
    tx.insert(streaks).values(streakValues).run()
  }
  return nextStreak
}

/** Cache schedulers by (desiredRetention, weights). */
const schedulerCache = new Map<string, Promise<DefaultScheduler<'FSRS-6'>>>()

function schedulerKey(desiredRetention: number, weights?: readonly number[] | null): string {
  const clamped = Math.max(0.5, Math.min(0.97, desiredRetention))
  const wKey =
    weights && weights.length > 0 ? weights.map((n) => n.toFixed(4)).join(',') : 'default'
  return `${clamped.toFixed(3)}:${wKey}`
}

/**
 * Get (and cache) the FSRS-6 scheduler for a desired retention (0.5–0.97) and
 * optional 21-parameter weight vector.
 */
export async function getScheduler(
  desiredRetention: number,
  weights?: readonly number[] | null,
): Promise<DefaultScheduler<'FSRS-6'>> {
  const clamped = Math.max(0.5, Math.min(0.97, desiredRetention))
  let validWeights: number[] | undefined
  if (weights && weights.length > 0) {
    try {
      validWeights = parseFsrsWeights(weights)
    } catch {
      validWeights = undefined
    }
  }
  const key = schedulerKey(clamped, validWeights)
  let cached = schedulerCache.get(key)
  if (!cached) {
    cached = DefaultScheduler({
      version: 'FSRS-6',
      desiredRetention: clamped,
      weights: validWeights,
      enableShortTerm: true,
    })
    schedulerCache.set(key, cached)
  }
  return cached
}

/**
 * Executes a single card review grading inside an active transaction.
 */
function executeReviewInTx(
  tx: Transaction,
  payload: ReviewPayload,
  sched: DefaultScheduler<'FSRS-6'>,
  now: Date,
): ReviewResult {
  const confidence: Confidence = payload.confidence === 0 ? 0 : 1
  const timeMs = typeof payload.timeMs === 'number' && payload.timeMs >= 0 ? payload.timeMs : 5000

  // a. Load Card
  const card = tx.select().from(cards).where(eq(cards.id, payload.cardId)).get()
  if (!card) {
    throw new CardNotFoundError(payload.cardId)
  }
  const preReview = { ...card }

  // b. Compute next FSRS state
  const input = cardRowToFsrs(card)
  const { card: nextFsrs } = sched.review({
    card: input,
    grade: payload.grade as FsrsGrade,
    now,
  })

  const elapsedDays = card.lastReview
    ? Math.max(0, Math.round((now.getTime() - Date.parse(card.lastReview)) / DAY_MS))
    : 0

  // c. Compute predicted retrievability (Feature 10 / Addon 10)
  const retrievability =
    card.state !== 0 && card.stability > 0
      ? Math.round(
          sched.model.forgettingCurve(
            { stability: card.stability, difficulty: card.difficulty },
            Math.max(0, elapsedDays),
          ) * 10000,
        ) / 10000
      : null

  const patch = fsrsToCardRow(nextFsrs)

  // d. Update cards row
  const [updatedCard] = tx
    .update(cards)
    .set({ ...patch, elapsedDays })
    .where(eq(cards.id, card.id))
    .returning()
    .all()

  // e. Insert revlog entry with collision-safe epoch ms
  let revlogId = now.getTime()
  const collision = tx.select({ id: revlog.id }).from(revlog).where(eq(revlog.id, revlogId)).get()
  if (collision) {
    const maxRow = tx
      .select({ maxId: sql<number>`max(id)` })
      .from(revlog)
      .get()
    revlogId = Math.max(revlogId + 1, (maxRow?.maxId ?? revlogId) + 1)
  }

  const revlogValues = {
    id: revlogId,
    cardId: card.id,
    rating: payload.grade,
    state: card.state, // Pre-review state (Anki specification)
    elapsedDays,
    scheduledDays: patch.scheduledDays,
    timeMs,
    confidence,
    retrievability,
    reviewedAt: now.toISOString(),
  }
  const [revlogEntry] = tx.insert(revlog).values(revlogValues).returning().all()

  // f. Award XP (append-only)
  const xpAmount =
    XP_REWARDS.review + (payload.grade >= 3 && confidence === 1 ? XP_REWARDS.reviewRecall : 0)
  tx.insert(xpEvents)
    .values({
      source: 'review',
      amount: xpAmount,
      meta: { cardId: card.id, grade: payload.grade, confidence },
      createdAt: now.toISOString(),
    })
    .run()

  // g. Update Streak (DEF-001 fix, shared helper)
  const nextStreak = updateStreakInTx(tx, now)

  // h. Elo & Mastery updates (if card linked to curriculum skillId)
  let eloResult = null
  if (card.skillId) {
    const outcome = outcomeFrom(payload.grade, confidence)
    const isCorrect = payload.grade >= 3
    const m = tx.select().from(mastery).where(eq(mastery.skillId, card.skillId)).limit(1).get()
    const ratingBefore = m?.elo ?? 1000
    const attemptsBefore = m?.attempts ?? 0
    const correctBefore = m?.correct ?? 0
    const pKnownBefore = m?.pKnown ?? 0.1

    const eloCalc = eloUpdate(ratingBefore, 1000, outcome, card.reps, attemptsBefore)
    const pKnownAfter = bktUpdate(pKnownBefore, isCorrect)
    const attemptsAfter = attemptsBefore + 1
    const correctAfter = correctBefore + (isCorrect ? 1 : 0)

    tx.insert(eloEvents)
      .values({
        skillId: card.skillId,
        ratingBefore: eloCalc.ratingBefore,
        ratingAfter: eloCalc.ratingAfter,
        itemDifficulty: eloCalc.itemDifficultyBefore,
        outcome,
        createdAt: now.toISOString(),
      })
      .run()

    if (m) {
      tx.update(mastery)
        .set({
          elo: eloCalc.ratingAfter,
          pKnown: pKnownAfter,
          attempts: attemptsAfter,
          correct: correctAfter,
          updatedAt: now.toISOString(),
        })
        .where(eq(mastery.id, m.id))
        .run()
    } else {
      tx.insert(mastery)
        .values({
          skillId: card.skillId,
          elo: eloCalc.ratingAfter,
          pKnown: pKnownAfter,
          attempts: attemptsAfter,
          correct: correctAfter,
          updatedAt: now.toISOString(),
        })
        .run()
    }

    eloResult = {
      skillId: card.skillId,
      ratingBefore: eloCalc.ratingBefore,
      ratingAfter: eloCalc.ratingAfter,
      outcome,
    }
  }

  return {
    card: updatedCard!,
    preReview,
    revlog: revlogEntry!,
    streak: nextStreak,
    xpEarned: xpAmount,
    elo: eloResult,
    newElo: eloResult?.ratingAfter,
    retrievability,
  }
}

/**
 * Execute multiple card reviews atomically in a single SQLite transaction.
 * Schedulers and settings are resolved asynchronously prior to opening the transaction.
 */
export async function executeBatchReview(
  payloads: ReviewPayload[],
  opts?: ReviewOptions,
): Promise<ReviewResult[]> {
  if (!Array.isArray(payloads) || payloads.length === 0) {
    return []
  }

  const database = opts?.db ?? getDb()

  // 1. Validate payloads
  for (const payload of payloads) {
    if (!payload.cardId || typeof payload.cardId !== 'number') {
      throw new ValidationError('Invalid cardId: must be a positive integer')
    }
    if (![1, 2, 3, 4].includes(payload.grade)) {
      throw new ValidationError('Invalid grade: must be 1, 2, 3, or 4')
    }
  }

  // 2. Pre-transaction Async Preparation: resolve deck + global retention & weights
  const settingsRow = database
    .select({
      desiredRetention: userSettings.desiredRetention,
      fsrsWeights: userSettings.fsrsWeights,
    })
    .from(userSettings)
    .limit(1)
    .get()
  const defaultRetention = settingsRow?.desiredRetention ?? 0.9
  const defaultWeights = settingsRow?.fsrsWeights ?? null

  const uniqueCardIds = [...new Set(payloads.map((p) => p.cardId))]
  const cardDeckRows =
    uniqueCardIds.length > 0
      ? database
          .select({ id: cards.id, deckId: cards.deckId })
          .from(cards)
          .where(inArray(cards.id, uniqueCardIds))
          .all()
      : []
  const deckByCard = new Map<number, number>(cardDeckRows.map((r) => [r.id, r.deckId]))

  const uniqueDeckIds = [...new Set(cardDeckRows.map((r) => r.deckId))]
  const deckRows =
    uniqueDeckIds.length > 0
      ? database
          .select({
            id: decks.id,
            desiredRetention: decks.desiredRetention,
            fsrsWeights: decks.fsrsWeights,
          })
          .from(decks)
          .where(inArray(decks.id, uniqueDeckIds))
          .all()
      : []
  const deckConfig = new Map(deckRows.map((d) => [d.id, d]))

  const schedulers = new Map<string, DefaultScheduler<'FSRS-6'>>()
  const payloadKeys: string[] = []
  for (const payload of payloads) {
    const deckId = deckByCard.get(payload.cardId)
    const dCfg = deckId !== undefined ? deckConfig.get(deckId) : undefined
    const ret = payload.desiredRetention ?? dCfg?.desiredRetention ?? defaultRetention
    const weights =
      payload.fsrsWeights !== undefined
        ? payload.fsrsWeights
        : (dCfg?.fsrsWeights ?? defaultWeights)
    const key = schedulerKey(ret, weights)
    payloadKeys.push(key)
    if (!schedulers.has(key)) {
      schedulers.set(key, await getScheduler(ret, weights))
    }
  }

  // Streak state before the batch — used to publish streak events (updated /
  // broken) after the commit. A break is any decrease of `current`.
  const prevStreak = database.select().from(streaks).limit(1).get() ?? null

  // 3. Synchronous Atomic Transaction Execution
  const results = withTransaction((tx) => {
    const results: ReviewResult[] = []
    for (let i = 0; i < payloads.length; i++) {
      const payload = payloads[i]!
      const sched = schedulers.get(payloadKeys[i]!)!
      const now =
        opts?.now ??
        (payload.today
          ? typeof payload.today === 'string'
            ? new Date(payload.today)
            : payload.today
          : new Date())
      results.push(executeReviewInTx(tx, payload, sched, now))
    }
    return results
  }, database)

  // 4. Publish platform events — AFTER the commit, so listeners observe
  // durable state (results[i] corresponds to payloads[i]).
  for (let i = 0; i < results.length; i++) {
    eventBus.emit('review.completed', {
      cardId: results[i]!.card.id,
      grade: payloads[i]!.grade,
      xpEarned: results[i]!.xpEarned,
    })
  }

  // Streak facts (first result's streak is the committed row state).
  const streakNow = results[0]!.streak
  if (prevStreak && streakNow.current < prevStreak.current) {
    eventBus.emit('streak.broken', {})
  } else if (
    !prevStreak ||
    streakNow.current !== prevStreak.current ||
    streakNow.best !== prevStreak.best
  ) {
    eventBus.emit('streak.updated', { current: streakNow.current, best: streakNow.best })
  }

  eventBus.emit('review.batch.completed', { count: results.length })

  return results
}

/**
 * Executes a card review grading atomically inside a single SQLite transaction.
 */
export async function executeReview(
  payload: ReviewPayload,
  opts?: ReviewOptions,
): Promise<ReviewResult> {
  const [result] = await executeBatchReview([payload], opts)
  return result!
}
