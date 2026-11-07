/**
 * 021 — Multi-device sync registry (M19): one row per device that has synced
 * against the shared cloud target. Device identity is client-side (stable
 * localStorage UUID), so this table is pure roster state — safe to merge,
 * useful on the Backup page to show which devices share a target.
 */
import type { Migration } from './runner'

export const syncDevices: Migration = {
  id: 21,
  name: 'sync-devices',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "sync_devices" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "device_id" TEXT NOT NULL UNIQUE,
      "name" TEXT NOT NULL,
      "platform" TEXT,
      "last_push_at" TEXT,
      "last_pull_at" TEXT,
      "last_revision" TEXT,
      "created_at" TEXT NOT NULL
    );`)
  },
}
