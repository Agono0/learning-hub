/**
 * Learning HUB — Notification Center repository.
 *
 * Persists the user-managed delivery policy (`user_settings.notification_prefs`
 * JSON, defaults derived from the pure catalog) and maintains the append-only
 * delivery ledger (`notification_log`) that powers the center's history feed.
 * The policy is a single JSON column on purpose: adding channels later needs
 * no migration, and unknown ids are dropped by the core parser.
 */
import { and, desc, eq, gte, lt } from 'drizzle-orm'
import {
  notificationLogEntrySchema,
  parseNotificationPrefs,
  type DeliveryDecision,
  type NotificationChannelId,
  type NotificationLogEntry,
  type NotificationPrefs,
} from '@learning-hub/core/notification-center'
import { notificationLog, userSettings } from '../schema'
import { getDb, type LearningHubDB } from '../index'
import { getOrCreateUserSettings } from './reminders'

/** The effective policy (stored JSON merged with catalog defaults). */
export function getNotificationPrefs(database?: LearningHubDB): NotificationPrefs {
  const conn = database ?? getDb()
  const row = getOrCreateUserSettings(conn)
  return parseNotificationPrefs(row.notificationPrefs)
}

/**
 * Persist a (partial) policy update: stored JSON is parsed, overlaid with the
 * incoming patch, re-validated by the core parser and written back. Callers
 * send the full prefs object from the client (validated upstream by the route
 * handler), but partial storage stays safe regardless.
 */
export function updateNotificationPrefs(
  input: Partial<NotificationPrefs>,
  database?: LearningHubDB,
): NotificationPrefs {
  const conn = database ?? getDb()
  const row = getOrCreateUserSettings(conn)
  const merged = parseNotificationPrefs({ ...getNotificationPrefs(conn), ...input })
  conn
    .update(userSettings)
    .set({ notificationPrefs: merged as unknown as Record<string, unknown> })
    .where(eq(userSettings.id, row.id))
    .run()
  return merged
}

/** Append one delivery-decision row (ledger is write-only; rule 8). */
export function logNotification(entry: NotificationLogEntry, database?: LearningHubDB): void {
  const conn = database ?? getDb()
  const parsed = notificationLogEntrySchema.parse(entry)
  conn
    .insert(notificationLog)
    .values({
      channel: parsed.channel,
      title: parsed.title,
      body: parsed.body,
      actionUrl: parsed.actionUrl,
      decision: parsed.decision,
      createdAt: parsed.createdAt,
    })
    .run()
}

/** Recent ledger rows, newest first (history feed; capped for calm). */
export function listNotificationLog(limit = 50, database?: LearningHubDB): NotificationLogEntry[] {
  const conn = database ?? getDb()
  const rows = conn
    .select()
    .from(notificationLog)
    .orderBy(desc(notificationLog.createdAt), desc(notificationLog.id))
    .limit(Math.min(Math.max(limit, 1), 200))
    .all()
  return rows.map((row) => ({
    channel: row.channel as NotificationChannelId,
    title: row.title,
    body: row.body,
    actionUrl: row.actionUrl,
    decision: row.decision as DeliveryDecision,
    createdAt: row.createdAt,
  }))
}

/**
 * Count ledger rows for a local calendar day (the daily-cap counter).
 * `dayStartIso`/`dayEndIso` come from the caller (the route passes the
 * client's day bounds with its timezone offset), keeping the repo
 * timezone-neutral. ISO-8601 strings compare lexicographically = chronologically.
 */
export function countNotificationsOnDay(
  dayStartIso: string,
  dayEndIso: string,
  decision: DeliveryDecision = 'deliver',
  database?: LearningHubDB,
): number {
  const conn = database ?? getDb()
  const rows = conn
    .select({ id: notificationLog.id })
    .from(notificationLog)
    .where(
      and(
        gte(notificationLog.createdAt, dayStartIso),
        lt(notificationLog.createdAt, dayEndIso),
        eq(notificationLog.decision, decision),
      ),
    )
    .all()
  return rows.length
}
