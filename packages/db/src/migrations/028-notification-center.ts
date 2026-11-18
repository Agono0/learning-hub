/**
 * 028 — notification center: user-managed delivery policy + delivery ledger.
 *
 * 1. `user_settings.notification_prefs` (JSON): per-channel enable/OS
 *    choices, quiet hours, daily cap, DND deadline. Default '{}' = derive
 *    from the pure catalog (`defaultNotificationPrefs()`), so adding channels
 *    later never needs another settings migration.
 * 2. `notification_log` (APPEND-ONLY): every delivery decision — delivered
 *    AND suppressed, with the reason — so the Notification Center history is
 *    transparent and searchable. Append-only like `reminder_log` (rule 8).
 *
 * Additive and backfill-safe. Never edit after it has shipped to any device
 * (AGENTS.md rule 4).
 */
import type { Migration } from './runner'

export const notificationCenter: Migration = {
  id: 28,
  name: 'notification-center',
  up(ctx) {
    ctx.addColumn('user_settings', 'notification_prefs', "TEXT NOT NULL DEFAULT '{}'")
    ctx.raw.exec(`
      CREATE TABLE IF NOT EXISTS notification_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        action_url TEXT,
        decision TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `)
    ctx.raw.exec(
      'CREATE INDEX IF NOT EXISTS notification_log_created_idx ON notification_log (created_at);',
    )
    ctx.raw.exec(
      'CREATE INDEX IF NOT EXISTS notification_log_channel_idx ON notification_log (channel, created_at);',
    )
  },
}
