/**
 * Delayed-feedback repository (Butler & Roediger 2008: delaying feedback until
 * after the response improved final-test performance over immediate feedback).
 *
 * When a deck runs delayed feedback, grades are committed blind (no answer
 * shown), so the misses of the last 24h are restudied — front AND back — at the
 * start of the next session, before any new card. This module owns that query;
 * handlers and pages never inline it.
 */
import { sql } from 'drizzle-orm'
import type { CardContent, CardFormat } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'

/**
 * Corrections window: blind grades older than 24h are stale — the learner
 * either already restudied them or the memory has decayed past the point of a
 * targeted correction (and FSRS has already rescheduled the card anyway).
 */
export const CORRECTIONS_WINDOW_MS = 86_400_000

/** One blind-graded miss to restudy before the session's new cards. */
export interface DelayedFeedbackCorrection {
  id: number
  type: CardFormat
  content: CardContent
  /** Grade of the most recent active review: 1 Again / 2 Hard (never 3–4). */
  rating: number
  /** ISO timestamp of that review. */
  reviewedAt: string
}

/**
 * Cards of ONE deck whose most recent ACTIVE `revlog` entry (undone reviews
 * excluded) falls inside the last `withinMs` (default 24h) and was graded 1 or
 * 2 — the blind-graded misses. Cards whose latest review is a pass or older
 * than the window are excluded, as are cards never reviewed.
 *
 * Order: worst grade first (Again before Hard), most recent first within a
 * grade, so the freshest misses get attention first.
 */
export function listDelayedFeedbackCorrections(opts: {
  deckId: number
  now?: Date
  withinMs?: number
  db?: LearningHubDB
}): DelayedFeedbackCorrection[] {
  const db = opts.db ?? getDb()
  const withinMs = opts.withinMs ?? CORRECTIONS_WINDOW_MS
  const cutoff = new Date((opts.now ?? new Date()).getTime() - withinMs).toISOString()
  const rows = db.all<{
    id: number
    type: string
    content: string
    rating: number
    reviewedAt: string
  }>(sql`
    SELECT c.id, c.type, c.content, l.rating AS rating, l.reviewed_at AS reviewedAt
    FROM cards c
    JOIN revlog l ON l.id = (
      SELECT max(r.id)
      FROM revlog r
      WHERE r.card_id = c.id
        AND NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = r.id)
    )
    WHERE c.deck_id = ${opts.deckId}
      AND l.rating IN (1, 2)
      AND l.reviewed_at >= ${cutoff}
    ORDER BY l.rating ASC, l.reviewed_at DESC
  `)
  return rows.map((row) => ({
    id: row.id,
    type: row.type as CardFormat,
    content: JSON.parse(row.content) as CardContent,
    rating: row.rating,
    reviewedAt: row.reviewedAt,
  }))
}
