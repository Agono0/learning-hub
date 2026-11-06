/**
 * 011 — Online engagement schema expansion:
 * - `online_servers` for worker endpoint registration.
 * - `online_identity` for local device keypair / magic link settings.
 * - `online_prefs` for opt-in online preferences.
 * - `online_inbox` for append-only nudges and room notifications.
 */
import type { Migration } from './runner'

export const online: Migration = {
  id: 11,
  name: 'online',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "online_servers" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "name" TEXT NOT NULL,
      "url" TEXT NOT NULL,
      "is_default" INTEGER NOT NULL DEFAULT 0,
      "created_at" TEXT NOT NULL
    );`)

    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "online_identity" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "mode" TEXT NOT NULL DEFAULT 'offline',
      "user_id" TEXT NOT NULL,
      "alias" TEXT NOT NULL DEFAULT 'Learner',
      "pub_key" TEXT,
      "priv_key" TEXT,
      "registered_at" TEXT
    );`)

    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "online_prefs" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "show_on_leaderboard" INTEGER NOT NULL DEFAULT 1,
      "allow_buddy_requests" INTEGER NOT NULL DEFAULT 1,
      "share_presence" INTEGER NOT NULL DEFAULT 1,
      "active_room_code" TEXT
    );`)

    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "online_inbox" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "kind" TEXT NOT NULL,
      "sender_alias" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "meta" TEXT,
      "read" INTEGER NOT NULL DEFAULT 0,
      "received_at" TEXT NOT NULL
    );`)
    ctx.createIndex('online_inbox_received_idx', 'online_inbox', ['received_at'])
  },
}
