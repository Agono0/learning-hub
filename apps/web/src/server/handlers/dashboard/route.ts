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
  focusSessions,
  getDailyQuest,
  journalEntries,
  lessonProgress,
  lessons,
  listQuotes,
  quests,
  quotes,
  streaks,
  units,
  xpEvents,
} from '@learning-hub/db'
import {
  buildAgenda,
  buildNotifications,
  dayKey,
  FOCUS_TARGET_MINUTES,
  type AgendaItem,
  type NotificationItem,
} from '@learning-hub/core'
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
  /** prioritized "do this next" list (packages/core/src/agenda.ts) */
  agenda: AgendaItem[]
  /** needs-attention list for the bell (packages/core/src/notifications.ts) */
  notifications: NotificationItem[]
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

  const { quotes: allQuotes } = listQuotes({ limit: 500 })
  const quote = allQuotes.length ? allQuotes[hashString(today) % allQuotes.length] : null

  const todayQuest = getDailyQuest(today)

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

  // Today agenda facts beyond the loops above: focus minutes and the journal.
  const [focusRow] = await db
    .select({ minutes: sql<number>`coalesce(sum(${focusSessions.actualMinutes}), 0)` })
    .from(focusSessions)
    .where(
      and(
        gte(focusSessions.startedAt, `${today}T00:00:00.000Z`),
        eq(focusSessions.completed, true),
      ),
    )
  const [journalRow] = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(eq(journalEntries.date, today))
    .limit(1)

  const examDaysLeft = (iso: string) =>
    Math.ceil((new Date(`${iso}T23:59:59.000Z`).getTime() - now.getTime()) / 86_400_000)

  const agenda: AgendaItem[] = buildAgenda({
    dueCount: Number(dueCount ?? 0),
    exams: upcomingExams.map((e) => ({ title: e.title, daysLeft: examDaysLeft(e.date) })),
    inProgressLessons: inProgress.map((l) => ({
      lessonId: l.lessonId,
      title: l.lessonTitle,
      courseTitle: l.courseTitle,
    })),
    focusMinutesToday: Math.round(Number(focusRow?.minutes ?? 0)),
    focusTargetMinutes: FOCUS_TARGET_MINUTES,
    quest: todayQuest ? { title: 'daily quest', completed: todayQuest.completed } : null,
    journalDoneToday: journalRow != null,
  })

  const streakState = {
    current: streakRow?.current ?? 0,
    lastActiveDate: streakRow?.lastActiveDate ?? null,
  }
  const notifications: NotificationItem[] = buildNotifications({
    dueCount: Number(dueCount ?? 0),
    exams: upcomingExams.map((e) => ({ title: e.title, daysLeft: examDaysLeft(e.date) })),
    streak: streakState,
    today,
    openLessons: inProgress.map((l) => ({ lessonId: l.lessonId, title: l.lessonTitle })),
  })

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
    agenda,
    notifications,
  }
  return Response.json(payload)
})
