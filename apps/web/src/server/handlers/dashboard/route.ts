/**
 * GET /api/dashboard — the payload the Today page (app/page.tsx) renders:
 * due-card count, streak, XP totals, daily quote and quest, the
 * "fresh start" flag, and the Zeigarnik open loops (unfinished lessons and
 * upcoming exams — Zeigarnik 1927: interrupted tasks stay in memory, so
 * surfacing them invites completion). Extracted verbatim from the former
 * server component's getDashboard() so the page can become a client
 * component that fetches this.
 */
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '@learning-hub/db'
import {
  cards,
  courses,
  examDates,
  lessonProgress,
  lessons,
  quests,
  quotes,
  streaks,
  units,
  xpEvents,
} from '@learning-hub/db'
import { dayKey } from '@learning-hub/core'
import { withRoute } from '@/lib/api'

/** One unfinished thing the dashboard invites the learner back to. */
export interface OpenLoop {
  kind: 'lesson' | 'exam'
  /** direct link target (query params included; static-export safe) */
  href: string
  title: string
  context: string
  /** lessons: when it was started; exams: ISO date of the exam */
  at: string
}

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
  openLoops: OpenLoop[]
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

  // Zeigarnik open loops: unfinished lessons (most recently started first)
  // and upcoming exams — surfaced so the learner can close the loop.
  const inProgress = await db
    .select({
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseTitle: courses.title,
      courseId: courses.id,
      startedAt: lessonProgress.startedAt,
    })
    .from(lessonProgress)
    .innerJoin(lessons, eq(lessonProgress.lessonId, lessons.id))
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(courses, eq(units.courseId, courses.id))
    .where(eq(lessonProgress.status, 'in_progress'))
    .orderBy(sql`${lessonProgress.startedAt} desc`)
    .limit(3)

  const upcomingExams = await db
    .select({
      id: examDates.id,
      title: examDates.title,
      date: examDates.date,
      courseId: examDates.courseId,
    })
    .from(examDates)
    .where(gte(examDates.date, today))
    .orderBy(asc(examDates.date))
    .limit(2)

  const openLoops: OpenLoop[] = [
    ...inProgress.map((l): OpenLoop => ({
      kind: 'lesson',
      href: `/courses/lesson?id=${l.lessonId}`,
      title: l.lessonTitle,
      context: l.courseTitle,
      at: l.startedAt,
    })),
    ...upcomingExams.map((e): OpenLoop => ({
      kind: 'exam',
      href: e.courseId != null ? `/courses/exam?id=${e.courseId}` : '/courses',
      title: e.title,
      context: e.date,
      at: e.date,
    })),
  ]

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
    openLoops,
  }
  return Response.json(payload)
})
