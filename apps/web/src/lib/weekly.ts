/**
 * Server-side query layer for the weekly review report: gathers the raw rows
 * (revlog, xp_events, focus_sessions, cards, streaks) straight from the
 * @learning-hub/db drizzle schema and hands them to core's pure
 * `computeWeeklyReportMetrics`. SERVER-only — imports the native SQLite client.
 */
import { and, gte, lt, sql } from 'drizzle-orm'
import { db, cards, focusSessions, revlog, streaks, xpEvents } from '@learning-hub/db'
import {
  clozeSegments,
  computeWeeklyReportMetrics,
  dayKey,
  type CardContent,
  type WeeklyCardRow,
  type WeeklyReportRaw,
  type WeeklyReportMetrics,
} from '@learning-hub/core'

const DAY_MS = 86_400_000

/** One-line display text for a card, whatever its format. */
function cardLabel(content: CardContent): string {
  if (content.basic) return content.basic.front
  if (content.cloze) {
    // render cloze blanks with their answers filled (a report wants to identify the card)
    return clozeSegments(content.cloze.text)
      .map((seg) => (seg.kind === 'text' ? seg.text : seg.answer))
      .join('')
      .trim()
  }
  if (content.mcq) return content.mcq.question
  if (content.typein) return content.typein.question
  if (content.grammar) return content.grammar.sentence
  if (content.matching) return `Matching — ${content.matching.pairs.length} pairs`
  if (content.proof_step) return content.proof_step.theorem
  if (content.occlusion) return 'Image occlusion'
  return '(card)'
}

/**
 * Gather the raw rows for the 7 LOCAL days ending today (tz = `offsetMinutes`,
 * `Date#getTimezoneOffset()` semantics) and compute the full report. The ISO
 * fetch window is widened to the exact UTC instants covered by the local days,
 * so no review is dropped or double-counted across a tz boundary; core scopes
 * the final buckets.
 */
export async function gatherWeeklyReportRaw(offsetMinutes: number): Promise<WeeklyReportRaw> {
  const weekEnd = dayKey(new Date(), offsetMinutes)
  const weekStartMs = Date.parse(weekEnd + 'T00:00:00Z') - 6 * DAY_MS
  // local-day window expressed as UTC instants: local = UTC - offset
  const fetchFrom = new Date(weekStartMs + offsetMinutes * 60_000).toISOString()
  const fetchUntil = new Date(weekStartMs + 7 * DAY_MS + offsetMinutes * 60_000).toISOString()

  const [reviewRows, xpRows, focusRows, cardRows, streakRows] = await Promise.all([
    db
      .select({
        cardId: revlog.cardId,
        rating: revlog.rating,
        state: revlog.state,
        timeMs: revlog.timeMs,
        retrievability: revlog.retrievability,
        reviewedAt: revlog.reviewedAt,
      })
      .from(revlog)
      .where(
        and(
          gte(revlog.reviewedAt, fetchFrom),
          lt(revlog.reviewedAt, fetchUntil),
          sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`,
        ),
      )
      .limit(20_000)
      .all(),
    db
      .select({ amount: xpEvents.amount, createdAt: xpEvents.createdAt })
      .from(xpEvents)
      .where(and(gte(xpEvents.createdAt, fetchFrom), lt(xpEvents.createdAt, fetchUntil)))
      .limit(20_000)
      .all(),
    db
      .select({
        startedAt: focusSessions.startedAt,
        actualMinutes: focusSessions.actualMinutes,
        completed: focusSessions.completed,
      })
      .from(focusSessions)
      .where(and(gte(focusSessions.startedAt, fetchFrom), lt(focusSessions.startedAt, fetchUntil)))
      .limit(5_000)
      .all(),
    db
      .select({
        id: cards.id,
        content: cards.content,
        due: cards.due,
        lapses: cards.lapses,
        stability: cards.stability,
        difficulty: cards.difficulty,
        reps: cards.reps,
        state: cards.state,
        suspended: cards.suspended,
        lastReview: cards.lastReview,
      })
      .from(cards)
      .limit(50_000)
      .all(),
    db.select().from(streaks).limit(1).all(),
  ])

  const weeklyCards: WeeklyCardRow[] = cardRows.map((c) => ({
    id: c.id,
    label: cardLabel(c.content),
    due: c.due,
    lapses: c.lapses,
    stability: c.stability,
    difficulty: c.difficulty,
    reps: c.reps,
    state: c.state,
    suspended: c.suspended,
    lastReview: c.lastReview,
  }))

  const raw: WeeklyReportRaw = {
    offsetMinutes,
    reviews: reviewRows,
    xpEvents: xpRows,
    focusSessions: focusRows,
    cards: weeklyCards,
    streak: streakRows[0] ?? null,
  }
  return raw
}

/** Full weekly report: raw rows → core pure math. */
export async function computeWeeklyReport(offsetMinutes: number): Promise<WeeklyReportMetrics> {
  const raw = await gatherWeeklyReportRaw(offsetMinutes)
  return computeWeeklyReportMetrics(raw)
}
