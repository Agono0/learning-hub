/**
 * GET /api/dashboard — the payload the Today page (app/page.tsx) renders:
 * due-card count, streak, XP totals, daily quote and quest, and the
 * "fresh start" flag. Extracted verbatim from the former server component's
 * getDashboard() so the page can become a client component that fetches this.
 */
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '@learning-hub/db'
import { cards, quests, quotes, streaks, xpEvents } from '@learning-hub/db'
import { dayKey } from '@learning-hub/core'
import { withRoute } from '@/lib/api'

/** The exact shape app/page.tsx consumed. */
export interface DashboardData {
  dueCount: number
  streak:
    | typeof streaks.$inferSelect
    | {
        current: number
        best: number
        freezes: number
        weekendAmulet: boolean
        lastActiveDate: null
      }
  xpTotal: number
  xpToday: number
  quote: typeof quotes.$inferSelect | null
  quest: typeof quests.$inferSelect | null
  freshStart: boolean
  dateKey: string
}

function isFreshStartMoment(d: Date): boolean {
  return d.getUTCDay() === 1 || d.getUTCDate() === 1
}

function hashString(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

/** GET /api/dashboard */
export const GET = withRoute(async (): Promise<Response> => {
  const now = new Date()
  const today = dayKey(now)

  const [{ dueCount }] = await db
    .select({ dueCount: sql<number>`count(*)` })
    .from(cards)
    .where(and(lte(cards.due, now.toISOString()), eq(cards.suspended, false)))

  const [streakRow] = await db.select().from(streaks).limit(1)
  const [xpRow] = await db.select({ total: sql<number>`coalesce(sum(amount), 0)` }).from(xpEvents)
  const [xpTodayRow] = await db
    .select({ today: sql<number>`coalesce(sum(amount), 0)` })
    .from(xpEvents)
    .where(gte(xpEvents.createdAt, `${today}T00:00:00.000Z`))

  const allQuotes = await db.select().from(quotes).limit(500)
  const quote = allQuotes.length ? allQuotes[hashString(today) % allQuotes.length] : null

  const [todayQuest] = await db.select().from(quests).where(eq(quests.date, today)).limit(1)

  const payload: DashboardData = {
    dueCount: Number(dueCount ?? 0),
    streak: streakRow ?? {
      current: 0,
      best: 0,
      freezes: 2,
      weekendAmulet: false,
      lastActiveDate: null,
    },
    xpTotal: Number(xpRow?.total ?? 0),
    xpToday: Number(xpTodayRow?.today ?? 0),
    quote: quote ?? null,
    quest: todayQuest ?? null,
    freshStart: isFreshStartMoment(now),
    dateKey: today,
  }
  return Response.json(payload)
})
