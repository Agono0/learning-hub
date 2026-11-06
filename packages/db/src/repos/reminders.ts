/**
 * Learning HUB — Reminders repository.
 *
 * Persists reminder preferences, aggregates user learning facts for scheduling,
 * and maintains the append-only audit trail for dispatched notifications and user clicks.
 */
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
  focusSessions,
  reminderClicks,
  reminderLog,
  revlog,
  userSettings,
  xpEvents,
} from '../schema'

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

  // 4. Current streak (estimate from distinct review days)
  const [distinctDaysRow] = conn
    .select({ count: sql<number>`count(distinct substr(${revlog.reviewedAt}, 1, 10))` })
    .from(revlog)
    .all()
  const currentStreak = Math.min(distinctDaysRow?.count ?? 0, 30)

  // 5. Active focus session duration
  const activeFocus = conn
    .select()
    .from(focusSessions)
    .where(eq(focusSessions.completed, false))
    .orderBy(desc(focusSessions.id))
    .limit(1)
    .get()
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
  return conn.select().from(reminderLog).orderBy(desc(reminderLog.id)).limit(limit).all()
}
