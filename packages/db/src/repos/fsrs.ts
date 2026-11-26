/**
 * FSRS-6 optimization, evaluation, rescheduling, and append-only Undo
 * repository — shared across Web handlers, MCP tools, CLI, and headless server.
 */
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm'
import {
  buildSession,
  evaluateFsrsWeights,
  optimizeFsrsWeights,
  parseFsrsWeights,
  rescheduleCardHistory,
  type Confidence,
  type FsrsEvaluation,
  type FsrsOptimizationResult,
  type FsrsOptimizerRevlog,
  type SessionMode,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { CardNotFoundError } from '../review-service'
import { cards, decks, revlog, revlogUndos, userSettings } from '../schema'
import { withTransaction } from '../transaction'

/** Snapshot of card FSRS fields restored by an Undo operation. */
export interface PreReviewSnapshot {
  id: number
  due: string
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  reps: number
  lapses: number
  state: number
  lastReview: string | null
  learningStep: number
}

/**
 * Load non-undone `revlog` rows (globally or scoped to a single `deckId`),
 * suitable for FSRS-6 evaluation, optimization, and rescheduling.
 */
export function loadActiveRevlogs(
  opts: { deckId?: number; db?: LearningHubDB } = {},
): FsrsOptimizerRevlog[] {
  const database = opts.db ?? getDb()
  if (opts.deckId !== undefined) {
    return database.all<FsrsOptimizerRevlog>(sql`
      SELECT r.id AS id,
             r.card_id AS cardId,
             r.rating AS rating,
             r.reviewed_at AS reviewedAt,
             r.elapsed_days AS elapsedDays
      FROM revlog r
      JOIN cards c ON c.id = r.card_id
      WHERE c.deck_id = ${opts.deckId}
        AND NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = r.id)
      ORDER BY r.reviewed_at ASC, r.id ASC
    `)
  }
  return database.all<FsrsOptimizerRevlog>(sql`
    SELECT r.id AS id,
           r.card_id AS cardId,
           r.rating AS rating,
           r.reviewed_at AS reviewedAt,
           r.elapsed_days AS elapsedDays
    FROM revlog r
    WHERE NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = r.id)
    ORDER BY r.reviewed_at ASC, r.id ASC
  `)
}

/**
 * Inspect current FSRS-6 status (active weights, retention, default vs active
 * Log-Loss & calibration RMSE) globally or for a specific deck.
 */
export function getFsrsStatus(opts: { deckId?: number; db?: LearningHubDB } = {}): {
  deckId: number | null
  desiredRetention: number
  customWeights: number[] | null
  baseline: FsrsEvaluation
  active: FsrsEvaluation
} {
  const database = opts.db ?? getDb()
  const settings = database.select().from(userSettings).limit(1).get()
  let desiredRetention = settings?.desiredRetention ?? 0.9
  let customWeights: number[] | null = settings?.fsrsWeights ?? null

  if (opts.deckId !== undefined) {
    const deck = database.select().from(decks).where(eq(decks.id, opts.deckId)).limit(1).get()
    if (deck) {
      if (deck.desiredRetention !== null && deck.desiredRetention !== undefined) {
        desiredRetention = deck.desiredRetention
      }
      if (deck.fsrsWeights && deck.fsrsWeights.length > 0) {
        customWeights = deck.fsrsWeights
      }
    }
  }

  const revlogs = loadActiveRevlogs(opts)
  const baseline = evaluateFsrsWeights(revlogs)
  const active = customWeights ? evaluateFsrsWeights(revlogs, customWeights) : baseline
  return {
    deckId: opts.deckId ?? null,
    desiredRetention,
    customWeights,
    baseline,
    active,
  }
}

/**
 * Optimize (or explicitly set / reset) FSRS-6 weights for a deck or globally,
 * optionally rescheduling all reviewed cards by replaying their active `revlog`
 * history through `ts-fsrs`'s `Reschedule` engine.
 */
export async function optimizeAndPersistFsrs(
  opts: {
    deckId?: number
    mode?: 'optimize' | 'set' | 'reset'
    weights?: unknown
    desiredRetention?: number | null
    reschedule?: boolean
    db?: LearningHubDB
  } = {},
): Promise<{
  mode: 'optimize' | 'set' | 'reset'
  deckId: number | null
  optimization?: FsrsOptimizationResult
  weights: number[] | null
  desiredRetention: number
  rescheduledCards: number
}> {
  const database = opts.db ?? getDb()
  const mode = opts.mode ?? 'optimize'
  const revlogs = loadActiveRevlogs({ deckId: opts.deckId, db: database })

  let nextWeights: number[] | null = null
  let optimization: FsrsOptimizationResult | undefined

  if (mode === 'reset') {
    nextWeights = null
  } else if (mode === 'set') {
    nextWeights = parseFsrsWeights(opts.weights)
  } else {
    optimization = optimizeFsrsWeights(revlogs)
    nextWeights = optimization.status === 'optimized' ? optimization.weights : null
  }

  const settingsRow = database
    .select()
    .from(userSettings)
    .where(eq(userSettings.id, 'default'))
    .get()
  const globalRetention = settingsRow?.desiredRetention ?? 0.9
  const clampedRetention =
    opts.desiredRetention !== undefined && opts.desiredRetention !== null
      ? Math.max(0.5, Math.min(0.97, opts.desiredRetention))
      : opts.desiredRetention === null
        ? null
        : undefined

  // Resolve effective retention after update for optional rescheduling
  let effectiveRetention = typeof clampedRetention === 'number' ? clampedRetention : globalRetention

  if (opts.deckId !== undefined) {
    const deck = database.select().from(decks).where(eq(decks.id, opts.deckId)).get()
    if (deck && clampedRetention === undefined && deck.desiredRetention !== null) {
      effectiveRetention = deck.desiredRetention
    }
  }

  // Pre-compute rescheduled card patches BEFORE opening synchronous transaction (Rule #6)
  const patches = new Map<number, Awaited<ReturnType<typeof rescheduleCardHistory>>>()
  if (opts.reschedule) {
    const byCard = new Map<number, FsrsOptimizerRevlog[]>()
    for (const r of revlogs) {
      let arr = byCard.get(r.cardId)
      if (!arr) {
        arr = []
        byCard.set(r.cardId, arr)
      }
      arr.push(r)
    }
    for (const [cardId, history] of byCard.entries()) {
      const patch = await rescheduleCardHistory(history, {
        desiredRetention: effectiveRetention,
        weights: nextWeights,
      })
      if (patch) patches.set(cardId, patch)
    }
  }

  const nowIso = new Date().toISOString()
  let rescheduledCards = 0

  withTransaction((tx) => {
    if (opts.deckId !== undefined) {
      const deckPatch: Partial<typeof decks.$inferInsert> = {
        fsrsWeights: nextWeights,
      }
      if (clampedRetention !== undefined) {
        deckPatch.desiredRetention = clampedRetention
      }
      tx.update(decks).set(deckPatch).where(eq(decks.id, opts.deckId)).run()
    } else {
      const existing = tx.select().from(userSettings).where(eq(userSettings.id, 'default')).get()
      if (!existing) {
        tx.insert(userSettings)
          .values({
            id: 'default',
            fsrsWeights: nextWeights,
            desiredRetention: typeof clampedRetention === 'number' ? clampedRetention : 0.9,
            updatedAt: nowIso,
          })
          .run()
      } else {
        const settingsPatch: Partial<typeof userSettings.$inferInsert> = {
          fsrsWeights: nextWeights,
          updatedAt: nowIso,
        }
        if (typeof clampedRetention === 'number') {
          settingsPatch.desiredRetention = clampedRetention
        }
        tx.update(userSettings).set(settingsPatch).where(eq(userSettings.id, 'default')).run()
      }
    }

    if (patches.size > 0) {
      const targetIds = [...patches.keys()]
      const existingCards = tx
        .select({ id: cards.id })
        .from(cards)
        .where(inArray(cards.id, targetIds))
        .all()
      for (const row of existingCards) {
        const patch = patches.get(row.id)
        if (!patch) continue
        tx.update(cards).set(patch).where(eq(cards.id, row.id)).run()
        rescheduledCards += 1
      }
    }
  }, database)

  return {
    mode,
    deckId: opts.deckId ?? null,
    optimization,
    weights: nextWeights,
    desiredRetention: effectiveRetention,
    rescheduledCards,
  }
}

/**
 * Thrown by `undoCardReview` when the undo no longer applies: the revlog row is
 * not this card's, is already undone, or is not the card's latest active
 * review (a newer review happened, or the request is a replay). The card row is
 * left untouched (→ 409).
 */
export class UndoConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UndoConflictError'
  }
}

/**
 * Atomically undo a card review: restores `cards` to `preReview` AND records an
 * append-only tombstone in `revlog_undos` (never runs `DELETE FROM revlog`,
 * strictly upholding Hard Rule #8).
 *
 * Only the card's latest ACTIVE (non-undone) review can be undone. A stale or
 * replayed request (older review, already-undone review, another card's
 * revlog id, nothing to undo) throws `UndoConflictError` before any write, so
 * the card row can never diverge from its active revlog.
 */
export function undoCardReview(
  payload: { cardId: number; revlogId?: number; preReview: PreReviewSnapshot },
  opts: { db?: LearningHubDB } = {},
): { card: typeof cards.$inferSelect; revlogUndone: boolean; revlogId: number | null } {
  const database = opts.db ?? getDb()
  const snap = payload.preReview

  return withTransaction((tx) => {
    const existing = tx.select().from(cards).where(eq(cards.id, payload.cardId)).limit(1).get()
    if (!existing) throw new CardNotFoundError(payload.cardId)

    const notUndone = sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`
    const latestActive = tx
      .select({ id: revlog.id, state: revlog.state })
      .from(revlog)
      .where(and(eq(revlog.cardId, payload.cardId), notUndone))
      .orderBy(desc(revlog.id))
      .limit(1)
      .get()

    if (!latestActive) throw new UndoConflictError('No active review to undo for this card')
    if (payload.revlogId !== undefined) {
      if (latestActive.id !== payload.revlogId) {
        throw new UndoConflictError(
          'revlogId is not the latest active review of this card (stale or already undone)',
        )
      }
    } else if (latestActive.state !== snap.state) {
      throw new UndoConflictError('preReview does not match the latest active review')
    }
    const targetRevlogId = latestActive.id

    tx.update(cards)
      .set({
        due: snap.due,
        stability: snap.stability,
        difficulty: snap.difficulty,
        elapsedDays: snap.elapsedDays,
        scheduledDays: snap.scheduledDays,
        reps: snap.reps,
        lapses: snap.lapses,
        state: snap.state,
        lastReview: snap.lastReview,
        learningStep: snap.learningStep,
      })
      .where(eq(cards.id, payload.cardId))
      .run()

    const res = tx
      .insert(revlogUndos)
      .values({
        revlogId: targetRevlogId,
        cardId: payload.cardId,
        undoneAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .run()
    const revlogUndone = res.changes > 0

    const restored = tx.select().from(cards).where(eq(cards.id, payload.cardId)).limit(1).get()
    return { card: restored!, revlogUndone, revlogId: targetRevlogId }
  }, database)
}

const DAY_MS = 86_400_000

/** Options for the shared review due queue. */
export interface DueQueueOptions {
  /** Max cards returned (default 20, capped at 100 by the callers' clamps). */
  limit?: number
  /** 'normal' (default) | 'pretest' | 'cram' — core `buildSession` modes. */
  mode?: SessionMode
  /** Restrict the queue to one deck. */
  deckId?: number
  /** Instant the due-window and ordering evaluate at. */
  now?: Date
  /** Override the database handle (tests). */
  db?: LearningHubDB
}

/**
 * THE review queue — the web session builder's candidate fetch + ordering as
 * one shared repo function (apps/web/src/server/handlers/review/route.ts is
 * canonical): unsuspended cards due within 7 days, each card's most recent
 * ACTIVE revlog entry joined with `NOT EXISTS revlog_undos` (undone reviews
 * are erased history and never drive hypercorrection), then core
 * `buildSession` ordering — confident-wrong cards first (Butler et al.
 * hypercorrection), then most-overdue first (tie: lowest id), decks
 * interleaved. Returns full card rows in session order.
 *
 * Hosts (CLI review session, MCP, web) previously re-implemented slices of
 * this; the CLI copy had no undo exclusion, so erased reviews leaked back into
 * its queue semantics.
 */
export function dueQueue(opts: DueQueueOptions = {}): (typeof cards.$inferSelect)[] {
  const database = opts.db ?? getDb()
  const now = opts.now ?? new Date()
  const limit = Math.max(1, opts.limit ?? 20)

  // Candidates: everything due or newer — buildSession filters precisely per
  // mode ('normal' keeps only cards due at `now`).
  const filters = [
    eq(cards.suspended, false),
    lte(cards.due, new Date(now.getTime() + 7 * DAY_MS).toISOString()),
  ]
  if (opts.deckId !== undefined) filters.push(eq(cards.deckId, opts.deckId))
  const candidateRows = database
    .select()
    .from(cards)
    .where(and(...filters))
    .limit(1000)
    .all()

  // Most recent ACTIVE revlog entry per card — hypercorrection signal that
  // excludes undone reviews (append-only tombstones, ADR 0004).
  const recent = database.all<{
    card_id: number
    rating: number
    confidence: Confidence
    reviewed_at: string
  }>(sql`
    SELECT r.card_id, r.rating, r.confidence, r.reviewed_at
    FROM revlog r
    JOIN (
      SELECT max(id) AS id
      FROM revlog
      WHERE NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)
      GROUP BY card_id
    ) latest ON latest.id = r.id
  `)
  const recentByCard = new Map(recent.map((r) => [r.card_id, r]))

  const session = buildSession({
    rows: candidateRows.map((row) => ({
      id: row.id,
      deckId: row.deckId,
      due: row.due,
      state: row.state,
      reps: row.reps,
      stability: row.stability,
      suspended: row.suspended,
      buryUntil: row.buryUntil,
      recentRevlog: recentByCard.has(row.id)
        ? {
            rating: recentByCard.get(row.id)!.rating,
            confidence: recentByCard.get(row.id)!.confidence,
            reviewedAt: recentByCard.get(row.id)!.reviewed_at,
          }
        : null,
    })),
    limit,
    mode: opts.mode ?? 'normal',
    asOf: now,
  })

  const byId = new Map(candidateRows.map((c) => [c.id, c]))
  return session
    .map((r) => byId.get(r.id))
    .filter((c): c is typeof cards.$inferSelect => c !== undefined)
}
