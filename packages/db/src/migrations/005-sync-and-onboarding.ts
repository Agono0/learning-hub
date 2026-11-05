/**
 * 005 — Cloud sync tombstones, device-local sync configuration, and onboarding /
 * collapsible sidebar preferences on `user_settings`.
 */
import type { Migration } from './runner'

export const syncAndOnboarding: Migration = {
  id: 5,
  name: 'sync-and-onboarding',
  up(ctx) {
    ctx.addColumn('user_settings', 'onboarding_completed', 'INTEGER NOT NULL DEFAULT 0')
    ctx.addColumn('user_settings', 'sidebar_collapsed_groups', 'TEXT')

    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "sync_tombstones" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "table_name" TEXT NOT NULL,
      "record_key" TEXT NOT NULL,
      "deleted_at" TEXT NOT NULL
    );`)
    ctx.createIndex('sync_tombstones_key_idx', 'sync_tombstones', ['table_name', 'record_key'], {
      unique: true,
    })

    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "sync_configs" (
      "id" TEXT PRIMARY KEY DEFAULT 'default' NOT NULL,
      "provider" TEXT DEFAULT 'none' NOT NULL,
      "config_json" TEXT DEFAULT '{}' NOT NULL,
      "encryption_enabled" INTEGER DEFAULT 0 NOT NULL,
      "passphrase" TEXT,
      "last_synced_at" TEXT,
      "last_sync_revision" TEXT,
      "updated_at" TEXT NOT NULL
    );`)
  },
}
