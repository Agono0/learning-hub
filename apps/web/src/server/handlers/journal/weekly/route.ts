import { isCalendarDay } from '@/lib/query-params'
import { and, gte, lte, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { focusSessions, habitLogs, journalEntries } from '@learning-hub/db'
import { dayKey, aggregateWeek, type DailyReviewsRow, type XpDailyRow } from '@learning-hub/core'
import { tzOffsetFromQuery, withRoute } from '@/lib/api'

function mondayOf(date: Date, tzOffsetMinutes = 0): string {
  const key = dayKey(date, tzOffsetMinutes)
  const d = new Date(key + 'T00:00:00Z')
  const shift = (d.getUTCDay() + 6) % 7 // Mon=0
  return dayKey(new Date(d.getTime() - shift * 86_400_000), tzOffsetMinutes)
}

/** GET /api/journal/weekly?weekStart=YYYY-MM-DD&tzOffset=N — the honest weekly review from real data. */
export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const tz = tzOffsetFromQuery(req)
  const weekStartParam = url.searchParams.get('weekStart')
  const weekStart =
    weekStartParam && isCalendarDay(weekStartParam) ? weekStartParam : mondayOf(new Date(), tz)
  const weekEnd = dayKey(new Date(Date.parse(weekStart + 'T00:00:00Z') + 6 * 86_400_000))

  const dailyReviews = db.all<DailyReviewsRow>(
    sql`SELECT day, reviews, correct FROM v_daily_reviews WHERE day BETWEEN ${weekStart} AND ${weekEnd}`,
  )
  const xpDaily = db.all<XpDailyRow>(
    sql`SELECT day, xp FROM v_xp_daily WHERE day BETWEEN ${weekStart} AND ${weekEnd}`,
  )
  const focus = db
    .select({
      startedAt: focusSessions.startedAt,
      actualMinutes: focusSessions.actualMinutes,
      completed: focusSessions.completed,
    })
    .from(focusSessions)
    .where(
      and(
        gte(focusSessions.startedAt, weekStart),
        lte(focusSessions.startedAt, weekEnd + 'T23:59:59'),
      ),
    )
    .all()
  const habitLogRows = db
    .select({ date: habitLogs.date })
    .from(habitLogs)
    .where(and(gte(habitLogs.date, weekStart), lte(habitLogs.date, weekEnd)))
    .all()
  const entries = db
    .select({ date: journalEntries.date, mood: journalEntries.mood })
    .from(journalEntries)
    .where(and(gte(journalEntries.date, weekStart), lte(journalEntries.date, weekEnd)))
    .all()

  const week = aggregateWeek(weekStart, {
    dailyReviews,
    xpDaily,
    focusSessions: focus,
    habitLogs: habitLogRows,
    journalEntries: entries,
  })

  return Response.json({ ...week, weekEnd, isCurrentWeek: weekStart === mondayOf(new Date(), tz) })
})
