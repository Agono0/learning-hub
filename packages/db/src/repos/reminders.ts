/**
 * Learning HUB — Reminders repository.
 *
 * Persists reminder preferences, aggregates user learning facts for scheduling,
 * and maintains the append-only audit trail for dispatched notifications and user clicks.
 */
import { rowLimit } from '../limits'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import {
  planReminders,
  reminderSettingsSchema,
  type ReminderCandidate,
  type ReminderKind,
  type ReminderSettings,
  type UserFacts,
} from '@learning-hub/core/reminders'

export { planReminders }
import { getDb, type LearningHubDB } from '../index'
import {
  cards,
  courses,
  examDates,
  frictionEvents,
  ideas,
  reminderClicks,
  reminderLog,
  revlog,
  pushSubscriptions,
  streaks,
  userSettings,
  xpEvents,
} from '../schema'
import { liveStreak } from '@learning-hub/core/streaks'
import { getOpenFocusSession } from './focus-lock'

export function getOrCreateUserSettings(conn: LearningHubDB): typeof userSettings.$inferSelect {
  const existing = conn.select().from(userSettings).where(eq(userSettings.id, 'default')).get()
  if (existing) return existing
  conn.insert(userSettings).values({ id: 'default' }).run()
  return conn.select().from(userSettings).where(eq(userSettings.id, 'default')).get()!
}

export function getReminderSettings(database?: LearningHubDB): ReminderSettings {
  const conn = database ?? getDb()
  const row = getOrCreateUserSettings(conn)
  return reminderSettingsSchema.parse({
    enabled: row.remindersEnabled,
    quietStart: row.remindersQuietStart,
    quietEnd: row.remindersQuietEnd,
    dailyCap: row.remindersDailyCap,
    allowedKinds: row.remindersKinds,
  })
}

export function updateReminderSettings(
  input: Partial<ReminderSettings>,
  database?: LearningHubDB,
): ReminderSettings {
  const conn = database ?? getDb()
  const row = getOrCreateUserSettings(conn)
  const patch: Partial<typeof userSettings.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  }
  if (input.enabled !== undefined) patch.remindersEnabled = input.enabled
  if (input.quietStart !== undefined) patch.remindersQuietStart = input.quietStart
  if (input.quietEnd !== undefined) patch.remindersQuietEnd = input.quietEnd
  if (input.dailyCap !== undefined) patch.remindersDailyCap = input.dailyCap
  if (input.allowedKinds !== undefined) patch.remindersKinds = input.allowedKinds

  conn.update(userSettings).set(patch).where(eq(userSettings.id, row.id)).run()
  return getReminderSettings(conn)
}

export function collectUserFacts(database?: LearningHubDB): UserFacts {
  const conn = database ?? getDb()
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()

  // 1. Due reviews count
  const [dueCardsRow] = conn
    .select({ count: sql<number>`count(*)` })
    .from(cards)
    .where(and(lte(cards.due, now.toISOString()), eq(cards.suspended, false)))
    .all()
  const dueReviewsCount = dueCardsRow?.count ?? 0

  // 2. Reviews completed today
  const [reviewCountRow] = conn
    .select({ count: sql<number>`count(*)` })
    .from(revlog)
    .where(gte(revlog.reviewedAt, todayStart))
    .all()
  const reviewedTodayCount = reviewCountRow?.count ?? 0

  // 3. XP earned today
  const [xpRow] = conn
    .select({ total: sql<number>`coalesce(sum(${xpEvents.amount}), 0)` })
    .from(xpEvents)
    .where(gte(xpEvents.createdAt, todayStart))
    .all()
  const todayXp = xpRow?.total ?? 0

  // 4. Current streak — the real consecutive-day streak (with freezes/amulet),
  //    not "number of distinct days ever reviewed".
  const streakRow = conn.select().from(streaks).limit(1).get()
  const currentStreak = streakRow
    ? liveStreak(
        {
          current: streakRow.current,
          best: streakRow.best,
          lastActiveDate: streakRow.lastActiveDate,
          freezes: streakRow.freezes,
          weekendAmulet: Boolean(streakRow.weekendAmulet),
        },
        now,
      )
    : 0

  // 5. Active focus session duration — only a session still running counts;
  //    an abandoned one keeps completed=false but has endedAt set.
  const activeFocus = getOpenFocusSession(conn)
  let continuousFocusMinutes = 0
  if (activeFocus && activeFocus.startedAt) {
    const startMs = new Date(activeFocus.startedAt).getTime()
    continuousFocusMinutes = Math.max(0, Math.floor((now.getTime() - startMs) / 60000))
  }

  // 6. Oldest unfinished untouched course
  const [untouchedCourse] = conn
    .select({
      id: courses.id,
      title: courses.title,
      updatedAt: courses.updatedAt,
    })
    .from(courses)
    .orderBy(courses.updatedAt)
    .limit(1)
    .all()
  let untouchedCourseDays = 0
  let untouchedCourseTitle: string | null = null
  if (untouchedCourse && untouchedCourse.updatedAt) {
    const courseUpdatedMs = new Date(untouchedCourse.updatedAt).getTime()
    untouchedCourseDays = Math.floor((now.getTime() - courseUpdatedMs) / (1000 * 60 * 60 * 24))
    untouchedCourseTitle = untouchedCourse.title
  }

  // 7. Reminders sent today
  const sentToday = conn
    .select({
      kind: reminderLog.kind,
      sentAt: reminderLog.sentAt,
    })
    .from(reminderLog)
    .where(gte(reminderLog.sentAt, todayStart))
    .all()
    .map((r) => ({ kind: r.kind as ReminderKind, sentAt: r.sentAt }))

  // 8. Reminders clicked today
  const clickedToday = conn
    .select({
      kind: reminderClicks.kind,
      clickedAt: reminderClicks.clickedAt,
    })
    .from(reminderClicks)
    .where(gte(reminderClicks.clickedAt, todayStart))
    .all()
    .map((c) => ({ kind: (c.kind ?? 'daily_review') as ReminderKind, clickedAt: c.clickedAt }))

  // 9. Idea resurfacing (M18): the most decayed, still-seeded idea.
  let resurfaceIdeaTitle: string | null = null
  let resurfaceIdeaId: number | null = null
  try {
    const candidate = conn
      .select({ id: ideas.id, title: ideas.title, decayScore: ideas.decayScore })
      .from(ideas)
      .orderBy(desc(ideas.decayScore))
      .limit(1)
      .get()
    if (candidate && (candidate.decayScore ?? 0) > 0.4) {
      resurfaceIdeaTitle = candidate.title
      resurfaceIdeaId = candidate.id
    }
  } catch {
    /* ideas table optional */
  }

  // 10. Friction days in the last 7 (M18): how many days had a caught distraction.
  let frictionDaysLast7 = 0
  try {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const [frictionRow] = conn
      .select({ days: sql<number>`count(distinct substr(${frictionEvents.createdAt}, 1, 10))` })
      .from(frictionEvents)
      .where(gte(frictionEvents.createdAt, weekAgo))
      .all()
    frictionDaysLast7 = frictionRow?.days ?? 0
  } catch {
    /* friction events optional */
  }

  // 11. Next exam countdown (M18).
  let nextExamTitle: string | null = null
  let nextExamDays: number | null = null
  try {
    const exam = conn
      .select({ title: examDates.title, date: examDates.date })
      .from(examDates)
      .where(gte(examDates.date, now.toISOString().slice(0, 10)))
      .orderBy(examDates.date)
      .limit(1)
      .get()
    if (exam) {
      nextExamTitle = exam.title
      nextExamDays = Math.max(
        0,
        Math.round((new Date(exam.date + 'T00:00:00Z').getTime() - now.getTime()) / 86_400_000),
      )
    }
  } catch {
    /* exams optional */
  }

  return {
    now,
    dueReviewsCount,
    reviewedTodayCount,
    currentStreak,
    todayXp,
    continuousFocusMinutes,
    untouchedCourseDays,
    untouchedCourseTitle,
    sentToday,
    clickedToday,
    resurfaceIdeaTitle,
    resurfaceIdeaId,
    frictionDaysLast7,
    nextExamTitle,
    nextExamDays,
  }
}

export function planCurrentReminders(database?: LearningHubDB): ReminderCandidate[] {
  const conn = database ?? getDb()
  const settings = getReminderSettings(conn)
  const facts = collectUserFacts(conn)
  return planReminders(facts, settings)
}

export function logReminderSent(
  entry: { kind: ReminderKind; title: string; body: string; actionUrl?: string },
  database?: LearningHubDB,
): typeof reminderLog.$inferSelect {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()
  const [created] = conn
    .insert(reminderLog)
    .values({
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      actionUrl: entry.actionUrl,
      sentAt: nowIso,
    })
    .returning()
    .all()
  return created!
}

export function recordReminderClick(
  entry: { reminderLogId?: number; kind?: string; actionUrl?: string },
  database?: LearningHubDB,
): typeof reminderClicks.$inferSelect {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()
  const [created] = conn
    .insert(reminderClicks)
    .values({
      reminderLogId: entry.reminderLogId,
      kind: entry.kind,
      actionUrl: entry.actionUrl,
      clickedAt: nowIso,
    })
    .returning()
    .all()
  return created!
}

export function listRecentReminderLogs(
  limit = 50,
  database?: LearningHubDB,
): (typeof reminderLog.$inferSelect)[] {
  const conn = database ?? getDb()
  return conn.select().from(reminderLog).orderBy(desc(reminderLog.id)).limit(rowLimit(limit)).all()
}

/**
 * Engagement stat (F-08④): clicks in the window vs reminders sent in the same
 * window — both append-only tables, read-only here. `windowDays` counts
 * UTC days back from now (default 7).
 */
export function reminderEngagement(
  windowDays = 7,
  database?: LearningHubDB,
): { sent: number; clicked: number; engagementPct: number } {
  const conn = database ?? getDb()
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  const sent =
    conn
      .select({ n: sql<number>`count(*)` })
      .from(reminderLog)
      .where(gte(reminderLog.sentAt, since))
      .get()?.n ?? 0
  const clicked =
    conn
      .select({ n: sql<number>`count(*)` })
      .from(reminderClicks)
      .where(gte(reminderClicks.clickedAt, since))
      .get()?.n ?? 0
  const engagementPct = sent > 0 ? Math.round((clicked / sent) * 100) : 0
  return { sent, clicked, engagementPct }
}

// ── Web-push subscriptions (M18) ─────────────────────────────────────────────

export interface PushSubscriptionInput {
  endpoint: string
  keys: Record<string, string>
}

/** Stores/refreshes a browser push subscription (endpoint is the unique key). */
export function savePushSubscription(sub: PushSubscriptionInput): void {
  const conn = getDb()
  conn
    .insert(pushSubscriptions)
    .values({ endpoint: sub.endpoint, keysJson: sub.keys, createdAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { keysJson: sub.keys },
    })
    .run()
}

export function deletePushSubscription(endpoint: string): boolean {
  const conn = getDb()
  const result = conn
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .run()
  return result.changes > 0
}

export function listPushSubscriptions(database?: LearningHubDB): PushSubscriptionInput[] {
  const conn = database ?? getDb()
  const rows = conn
    .select({ endpoint: pushSubscriptions.endpoint, keysJson: pushSubscriptions.keysJson })
    .from(pushSubscriptions)
    .all()
  return rows.map((r) => ({ endpoint: r.endpoint, keys: r.keysJson }))
}
