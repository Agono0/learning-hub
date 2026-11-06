/**
 * 008 — Reminders schema expansion:
 * - `user_settings` reminder preferences (`reminders_enabled`, `reminders_quiet_start`,
 *   `reminders_quiet_end`, `reminders_daily_cap`, `reminders_kinds`).
 * - `reminder_log` append-only audit trail of dispatched notifications.
 * - `reminder_clicks` append-only tracking of user interaction with notifications.
 */
import type { Migration } from './runner'

export const reminders: Migration = {
  id: 8,
  name: 'reminders',
  up(ctx) {
    ctx.addColumn('user_settings', 'reminders_enabled', 'INTEGER NOT NULL DEFAULT 1')
    ctx.addColumn('user_settings', 'reminders_quiet_start', "TEXT NOT NULL DEFAULT '22:00'")
    ctx.addColumn('user_settings', 'reminders_quiet_end', "TEXT NOT NULL DEFAULT '08:00'")
    ctx.addColumn('user_settings', 'reminders_daily_cap', 'INTEGER NOT NULL DEFAULT 3')
    ctx.addColumn(
      'user_settings',
      'reminders_kinds',
      'TEXT NOT NULL DEFAULT \'["daily_review","streak_saver","break_reminder","curriculum_nudge"]\'',
    )

    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "reminder_log" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "kind" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "action_url" TEXT,
      "sent_at" TEXT NOT NULL
    );`)
    ctx.createIndex('reminder_log_sent_at_idx', 'reminder_log', ['sent_at'])

    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "reminder_clicks" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "reminder_log_id" INTEGER REFERENCES "reminder_log"("id"),
      "kind" TEXT,
      "action_url" TEXT,
      "clicked_at" TEXT NOT NULL
    );`)
    ctx.createIndex('reminder_clicks_clicked_at_idx', 'reminder_clicks', ['clicked_at'])
  },
}
