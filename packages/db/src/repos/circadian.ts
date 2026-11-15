/**
 * Learning HUB — Circadian & Passive Learning DB Repository.
 */
import { desc, gte, inArray, eq, sql } from 'drizzle-orm'
import {
  generateTmrEarcon,
  type BinauralMode,
  type HandsFreeGradeEvent,
  type TmrEarcon,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { cards, circadianAudioSessions, revlog, tmrCues } from '../schema'
import { withTransaction, type Transaction } from '../transaction'

export function recordCircadianAudioSession(
  data: {
    sessionMode: 'commute' | 'sleep_tmr' | 'wind_down'
    deckId?: number
    cardsReviewed: number
    durationSeconds: number
    binauralMode?: BinauralMode
    handsFreeInputs?: HandsFreeGradeEvent[]
  },
  database?: LearningHubDB,
): typeof circadianAudioSessions.$inferSelect {
  const db = database ?? getDb()
  const nowIso = new Date().toISOString()

  const [row] = db
    .insert(circadianAudioSessions)
    .values({
      sessionMode: data.sessionMode,
      deckId: data.deckId,
      cardsReviewed: data.cardsReviewed,
      durationSeconds: data.durationSeconds,
      binauralMode: data.binauralMode ?? 'none',
      handsFreeInputs: data.handsFreeInputs ?? [],
      createdAt: nowIso,
    })
    .returning()
    .all()

  return row!
}

export function listCircadianAudioSessions(
  limit = 20,
  database?: LearningHubDB,
): (typeof circadianAudioSessions.$inferSelect)[] {
  const db = database ?? getDb()
  return db
    .select()
    .from(circadianAudioSessions)
    .orderBy(desc(circadianAudioSessions.createdAt))
    .limit(limit)
    .all()
}

/**
 * Create the card's TMR cue, or count one more awake pairing if it exists. The
 * stored signature is refreshed too, so cues minted by an older generator converge
 * on the current deterministic earcon.
 */
export function upsertTmrCue(
  cardId: number,
  earconSignature: TmrEarcon,
  database?: LearningHubDB | Transaction,
): typeof tmrCues.$inferSelect {
  const db = database ?? getDb()
  const nowIso = new Date().toISOString()

  const [row] = db
    .insert(tmrCues)
    .values({
      cardId,
      earconSignature,
      timesCuedAwake: 1,
      createdAt: nowIso,
    })
    .onConflictDoUpdate({
      target: tmrCues.cardId,
      set: {
        earconSignature,
        timesCuedAwake: sql`${tmrCues.timesCuedAwake} + 1`,
      },
    })
    .returning()
    .all()

  return row!
}

/**
 * Mint (or refresh) a TMR cue for every card reviewed since `sinceIso` — TMR only
 * helps memories encoded that day (Rasch & Born 2007), so tonight's replay list is
 * "what I studied today". Cards are taken most-recent first, capped at `limit`;
 * deleted cards are skipped (revlog outlives cards). One transaction; returns the
 * number of cues minted or refreshed.
 */
export function mintTmrCuesForRecentReviews(
  sinceIso: string,
  limit = 40,
  database?: LearningHubDB,
): number {
  const db = database ?? getDb()
  const safeLimit = Math.max(1, Math.min(200, Math.floor(limit)))
  const recent = db
    .select({ cardId: revlog.cardId, last: sql<string>`max(${revlog.reviewedAt})` })
    .from(revlog)
    .innerJoin(cards, eq(cards.id, revlog.cardId))
    .where(gte(revlog.reviewedAt, sinceIso))
    .groupBy(revlog.cardId)
    .orderBy(desc(sql`max(${revlog.reviewedAt})`))
    .limit(safeLimit)
    .all()
  if (recent.length === 0) return 0
  return mintTmrCues(
    recent.map((r) => r.cardId),
    database,
  )
}

/** True when a card with this id exists (TMR cues FK onto `cards`). */
export function cardExists(cardId: number, database?: LearningHubDB): boolean {
  const db = database ?? getDb()
  return db.select({ id: cards.id }).from(cards).where(eq(cards.id, cardId)).get() !== undefined
}

/**
 * Mint (or refresh) the deterministic earcon cue for each card id, in one
 * transaction. Duplicate ids count once. Returns the number of distinct cards.
 * Callers pass ids of cards that exist (FK onto `cards`).
 */
export function mintTmrCues(cardIds: readonly number[], database?: LearningHubDB): number {
  const unique = [...new Set(cardIds)]
  if (unique.length === 0) return 0
  withTransaction((tx) => {
    for (const cardId of unique) {
      upsertTmrCue(cardId, generateTmrEarcon(cardId), tx)
    }
  }, database)
  return unique.length
}

export function getTmrCuesForSleepReplay(
  limit = 40,
  database?: LearningHubDB,
): (typeof tmrCues.$inferSelect)[] {
  const db = database ?? getDb()
  return db.select().from(tmrCues).orderBy(desc(tmrCues.timesCuedAwake)).limit(limit).all()
}

export function recordSleepTmrPlayback(cardIds: number[], database?: LearningHubDB): void {
  if (cardIds.length === 0) return
  const db = database ?? getDb()
  const nowIso = new Date().toISOString()

  db.update(tmrCues)
    .set({
      timesCuedSleep: sql`${tmrCues.timesCuedSleep} + 1`,
      lastSleepCueAt: nowIso,
    })
    .where(inArray(tmrCues.cardId, cardIds))
    .run()
}
