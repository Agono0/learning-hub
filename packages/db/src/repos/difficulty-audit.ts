/**
 * Difficulty-audit DB repository — the measured-behavior derivation shared by
 * the web handler, the headless server, the MCP tool, and the CLI (AGENTS.md:
 * reusable queries live in repos so every host computes the same numbers).
 *
 * Pure read path: revlog + cards, filtered through revlog_undos (append-only
 * tables stay append-only — Hard Rule #8).
 */
import { desc, eq, sql } from 'drizzle-orm'
import { dayKey, type MeasuredBehavior } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { cards, revlog } from '../schema'

/** How many days back the audit window looks by default. */
export const AUDIT_WINDOW_DAYS = 7

/**
 * Derives the measured behavior stream from real review rows:
 *   - retrieval minutes (sum of revlog timeMs inside the window)
 *   - per-day retrieval minutes (today = index 0, for the spacing audit)
 *   - deck-interleaving telemetry (consecutive same-deck pairs in review order)
 *   - distinct (day, deck) session pairs
 */
export function deriveMeasuredBehavior(
  tzOffset = 0,
  windowDays = AUDIT_WINDOW_DAYS,
  database?: LearningHubDB,
): MeasuredBehavior {
  const db = database ?? getDb()

  const rows = db
    .select({
      cardId: revlog.cardId,
      deckId: cards.deckId,
      timeMs: revlog.timeMs,
      reviewedAt: revlog.reviewedAt,
    })
    .from(revlog)
    .innerJoin(cards, eq(cards.id, revlog.cardId))
    .where(sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`)
    .orderBy(desc(revlog.id))
    .limit(3000)
    .all()

  if (rows.length === 0) {
    return {
      retrievalMinutes: 0,
      sessionCount: 0,
      retrievalMinutesByDay: new Array(windowDays).fill(0),
      consecutiveSameDeckReviews: 0,
      totalReviews: 0,
      distinctDecks: 0,
    }
  }

  const todayKey = dayKey(new Date(), tzOffset) // 'YYYY-MM-DD' local day key
  const todayMs = Date.parse(`${todayKey}T00:00:00Z`)
  const minutesByDay = new Array<number>(windowDays).fill(0)

  let retrievalMs = 0
  let consecutiveSameDeck = 0
  const decks = new Set<number>()
  const dayDeckPairs = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const reviewedKey = dayKey(new Date(r.reviewedAt), tzOffset)
    const reviewedMs = Date.parse(`${reviewedKey}T00:00:00Z`)
    const dayIndex = Math.round((todayMs - reviewedMs) / 86_400_000)
    if (dayIndex >= 0 && dayIndex < windowDays) {
      retrievalMs += r.timeMs
      minutesByDay[dayIndex] += r.timeMs / 60000
      dayDeckPairs.add(`${reviewedKey}:${r.deckId}`)
    }
    decks.add(r.deckId)
    // Newest-first scan: a same-deck adjacent pair in scan order is a
    // consecutive same-deck pair in review order too.
    const next = rows[i + 1]
    if (next && next.deckId === r.deckId) consecutiveSameDeck++
  }

  return {
    retrievalMinutes: Number((retrievalMs / 60000).toFixed(1)),
    sessionCount: dayDeckPairs.size,
    retrievalMinutesByDay: minutesByDay.map((m) => Number(m.toFixed(2))),
    consecutiveSameDeckReviews: consecutiveSameDeck,
    totalReviews: rows.length,
    distinctDecks: decks.size,
  }
}
