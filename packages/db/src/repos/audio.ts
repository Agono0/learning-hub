/**
 * Learning HUB — Audio & Voice DB Repository.
 *
 * Provides queries for due cards audio scripts and hands-free commute session logs.
 */
import { and, desc, eq, lte } from 'drizzle-orm'
import { audioSessions, cards, decks } from '../schema'
import { getDb, type LearningHubDB } from '../index'

export function recordAudioSession(
  session: {
    deckId?: number
    mode?: 'handsfree_review' | 'audio_digest'
    cardCount: number
    durationSeconds: number
    speechEngine?: string
  },
  database?: LearningHubDB,
): typeof audioSessions.$inferSelect {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()

  const [created] = conn
    .insert(audioSessions)
    .values({
      deckId: session.deckId,
      mode: session.mode ?? 'handsfree_review',
      cardCount: session.cardCount,
      durationSeconds: session.durationSeconds,
      speechEngine: session.speechEngine ?? 'webspeech',
      createdAt: nowIso,
    })
    .returning()
    .all()

  return created!
}

export function listAudioSessions(
  limit = 20,
  database?: LearningHubDB,
): (typeof audioSessions.$inferSelect)[] {
  const conn = database ?? getDb()
  return conn.select().from(audioSessions).orderBy(desc(audioSessions.createdAt)).limit(limit).all()
}

export function getDueCardsForAudio(
  limit = 20,
  deckId?: number,
  database?: LearningHubDB,
): Array<{ id: number; front: string; back: string; deckName?: string }> {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()

  const conditions = [lte(cards.due, nowIso), eq(cards.suspended, false)]
  if (deckId) {
    conditions.push(eq(cards.deckId, deckId))
  }

  const rows = conn
    .select({
      id: cards.id,
      content: cards.content,
      deckId: cards.deckId,
      deckName: decks.name,
    })
    .from(cards)
    .leftJoin(decks, eq(cards.deckId, decks.id))
    .where(and(...conditions))
    .limit(limit)
    .all()

  return rows.map((r) => {
    let front = 'Card Prompt'
    let back = 'Card Answer'

    if (r.content && typeof r.content === 'object') {
      const c = r.content as any
      front = c.front || c.prompt || c.question || 'Card Prompt'
      back = c.back || c.answer || 'Card Answer'
    }

    return {
      id: r.id,
      front,
      back,
      deckName: r.deckName ?? undefined,
    }
  })
}
