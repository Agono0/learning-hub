/**
 * 007 — Max Focus Mode schema expansion:
 * - `focus_sessions` commitment-lock columns (`mode`, `locked_until`, `allowlist_id`,
 *   `allow_snapshot`, `exit_requested_at`, `ended_early`).
 * - `focus_allowlists` domain and executable preset library.
 * - `focus_bridge` device-local extension pairing credentials.
 */
import type { Migration } from './runner'

export const maxFocus: Migration = {
  id: 7,
  name: 'max-focus',
  up(ctx) {
    ctx.addColumn('focus_sessions', 'mode', "TEXT NOT NULL DEFAULT 'standard'")
    ctx.addColumn('focus_sessions', 'locked_until', 'TEXT')
    ctx.addColumn('focus_sessions', 'allowlist_id', 'INTEGER')
    ctx.addColumn('focus_sessions', 'allow_snapshot', 'TEXT')
    ctx.addColumn('focus_sessions', 'exit_requested_at', 'TEXT')
    ctx.addColumn('focus_sessions', 'ended_early', 'INTEGER NOT NULL DEFAULT 0')

    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "focus_allowlists" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "name" TEXT NOT NULL,
      "domains" TEXT NOT NULL,
      "apps" TEXT NOT NULL,
      "is_default" INTEGER NOT NULL DEFAULT 0,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );`)
    ctx.createIndex('focus_allowlist_name_idx', 'focus_allowlists', ['name'], {
      unique: true,
    })

    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "focus_bridge" (
      "id" TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
      "pairing_token" TEXT NOT NULL,
      "extension_id" TEXT,
      "last_heartbeat_at" TEXT,
      "updated_at" TEXT NOT NULL
    );`)

    // Seed default allowlist if table is empty
    const nowIso = new Date().toISOString()
    const defaultDomains = JSON.stringify([
      'youtube.com',
      'youtu.be',
      'ytimg.com',
      'googlevideo.com',
    ])
    const defaultApps = JSON.stringify([])
    ctx.raw
      .exec(`INSERT OR IGNORE INTO "focus_allowlists" ("name", "domains", "apps", "is_default", "created_at", "updated_at")
      SELECT 'Default Learning & Video', '${defaultDomains}', '${defaultApps}', 1, '${nowIso}', '${nowIso}'
      WHERE NOT EXISTS (SELECT 1 FROM "focus_allowlists" LIMIT 1);`)
  },
}
