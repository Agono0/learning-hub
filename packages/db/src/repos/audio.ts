/**
 * Learning HUB — Audio & Voice DB Repository.
 *
 * Provides queries for due cards audio scripts and hands-free commute session logs.
 */
import { rowLimit } from '../limits'
import { and, asc, desc, eq, lte } from 'drizzle-orm'
import { cardAnswerText, cardFrontText, type CardContent } from '@learning-hub/core'
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
  return conn
    .select()
    .from(audioSessions)
    .orderBy(desc(audioSessions.createdAt))
    .limit(rowLimit(limit))
    .all()
}

/** Spoken stand-in for a cloze blank — TTS engines read '___' as 'underscore'. */
const SPOKEN_BLANK = 'blank'

/** One malformed legacy row (e.g. a cloze missing `text`) must not fail the whole queue. */
function safeText(read: () => string): string {
  try {
    const v = read()
    return typeof v === 'string' ? v : ''
  } catch {
    return ''
  }
}

/**
 * Due, unsuspended cards as speakable prompt/answer pairs, most overdue first.
 *
 * Text comes from the canonical per-format helpers (`cardFrontText` /
 * `cardAnswerText`) — `CardContent` is nested (`{ basic: { front, back } }`,
 * `{ cloze: { text, answers } }`, …), so reading flat `content.front` made every
 * card speak a placeholder. Legacy flat `{ front, back }` rows still work.
 * Formats with no text (image occlusion, sketches) are skipped, so fewer than
 * `limit` rows may come back. `stability` (FSRS S, days) lets callers pace the
 * recall pause; `spokenFront` replaces cloze blanks with a speakable word.
 */
export function getDueCardsForAudio(
  limit = 20,
  deckId?: number,
  database?: LearningHubDB,
): Array<{
  id: number
  front: string
  back: string
  spokenFront: string
  deckName?: string
  stability: number
}> {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()
  const safeLimit = Math.max(1, Math.min(200, Math.floor(Number.isFinite(limit) ? limit : 20)))

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
      stability: cards.stability,
    })
    .from(cards)
    .leftJoin(decks, eq(cards.deckId, decks.id))
    .where(and(...conditions))
    .orderBy(asc(cards.due), asc(cards.id))
    .limit(safeLimit)
    .all()

  const out: ReturnType<typeof getDueCardsForAudio> = []
  for (const r of rows) {
    const content = (r.content ?? {}) as CardContent & { front?: unknown; back?: unknown }
    const front =
      safeText(() => cardFrontText(content)) ||
      (typeof content.front === 'string' ? content.front : '')
    const back =
      safeText(() => cardAnswerText(content)) ||
      (typeof content.back === 'string' ? content.back : '')
    if (!front.trim()) continue
    out.push({
      id: r.id,
      front,
      back,
      spokenFront: front.replace(/_{3,}/g, SPOKEN_BLANK),
      deckName: r.deckName ?? undefined,
      stability: r.stability ?? 0,
    })
  }
  return out
}
