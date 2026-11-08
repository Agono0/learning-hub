/**
 * Learning HUB — Circadian & Passive Learning DB Repository.
 */
import { desc, eq, inArray, sql } from 'drizzle-orm'
import type { BinauralMode, HandsFreeGradeEvent, TmrEarcon } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { circadianAudioSessions, tmrCues } from '../schema'

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

export function upsertTmrCue(
  cardId: number,
  earconSignature: TmrEarcon,
  database?: LearningHubDB,
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
        timesCuedAwake: sql`${tmrCues.timesCuedAwake} + 1`,
      },
    })
    .returning()
    .all()

  return row!
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
