/**
 * GET /api/dashboard — the payload the Today page (app/page.tsx) renders:
 * due-card count, streak, XP totals, daily quote and quest, the
 * "fresh start" flag, and the Zeigarnik open loops (unfinished lessons and
 * upcoming exams — Zeigarnik 1927: interrupted tasks stay in memory, so
 * surfacing them invites completion). Extracted verbatim from the former
 * server component's getDashboard() so the page can become a client
 * component that fetches this.
 */
import { and, asc, eq, gte, sql } from 'drizzle-orm'
import { db } from '@learning-hub/db'
import {
  courses,
  examDates,
  focusSessions,
  getDailyQuest,
  getDueCardCount,
  getOpenFocusSession,
  getStreakRow,
  getTodayReviewTallies,
  getXpTotals,
  journalEntries,
  lessonProgress,
  lessons,
  listQuotes,
  quests,
  quotes,
  streaks,
  units,
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
  /** focus minutes actually completed today (UTC day bucket) — the Daily Loop focus ring */
  focusMinutesToday: number
  /** reviews committed today (revlog rows, undone excluded) — the Daily Loop reviews ring */
  reviewsToday: number
  /**
   * The focus session currently running (not completed AND not ended), if any —
   * same "live" definition as GET /api/focus. Null when nothing is running.
   */
  runningFocus: {
    id: number
    startedAt: string
    plannedMinutes: number
  } | null
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

  // Shared stats repo — the same aggregations MCP/CLI/the headless server serve.
  const dueCount = getDueCardCount({ now })
  const streakRow = getStreakRow({ now })
  const { total: xpTotal, today: xpToday } = getXpTotals({ now })

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
  const focusMinutesToday = Math.round(Number(focusRow?.minutes ?? 0))

  // Reviews committed today — the shared stats repo (undone reviews excluded,
  // ADR 0004) over the same UTC day key the agenda and XP totals use.
  const reviewsToday = getTodayReviewTallies({ now }).reviews

  // The live focus session (not completed, not ended) — same repo call the
  // focus handler uses, so the dashboard ring and /focus always agree.
  const openFocus = getOpenFocusSession()
  const runningFocus = openFocus
    ? {
        id: openFocus.id,
        startedAt: openFocus.startedAt,
        plannedMinutes: openFocus.plannedMinutes,
      }
    : null

  const [journalRow] = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(eq(journalEntries.date, today))
    .limit(1)

  const examDaysLeft = (iso: string) =>
    Math.ceil((new Date(`${iso}T23:59:59.000Z`).getTime() - now.getTime()) / 86_400_000)

  const agenda: AgendaItem[] = buildAgenda({
    dueCount,
    exams: upcomingExams.map((e) => ({ title: e.title, daysLeft: examDaysLeft(e.date) })),
    inProgressLessons: inProgress.map((l) => ({
      lessonId: l.lessonId,
      title: l.lessonTitle,
      courseTitle: l.courseTitle,
    })),
    focusMinutesToday,
    focusTargetMinutes: FOCUS_TARGET_MINUTES,
    quest: todayQuest ? { title: 'daily quest', completed: todayQuest.completed } : null,
    journalDoneToday: journalRow != null,
  })

  const streakState = {
    current: streakRow?.current ?? 0,
    lastActiveDate: streakRow?.lastActiveDate ?? null,
  }
  const notifications: NotificationItem[] = buildNotifications({
    dueCount,
    exams: upcomingExams.map((e) => ({ title: e.title, daysLeft: examDaysLeft(e.date) })),
    streak: streakState,
    today,
    openLessons: inProgress.map((l) => ({ lessonId: l.lessonId, title: l.lessonTitle })),
  })

  const payload: DashboardData = {
    dueCount,
    streak: streakRow ?? {
      current: 0,
      best: 0,
      freezes: 2,
      weekendAmulet: false,
      lastActiveDate: null,
    },
    xpTotal: Number(xpTotal),
    xpToday: Number(xpToday),
    quote: quote ?? null,
    quest: todayQuest ?? null,
    freshStart: isFreshStartMoment(now),
    dateKey: today,
    openLoops,
    agenda,
    notifications,
    focusMinutesToday,
    reviewsToday,
    runningFocus,
  }
  return Response.json(payload)
})
