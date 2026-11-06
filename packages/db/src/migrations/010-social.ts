/**
 * 010 — Serverless Social schema expansion:
 * - `boss_battles` for solo boss battles whose damage derives from revlog.
 * - `friends` for decentralized Gist friend leaderboards.
 */
import type { Migration } from './runner'

export const social: Migration = {
  id: 10,
  name: 'social',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "boss_battles" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "boss_key" TEXT NOT NULL,
      "boss_name" TEXT NOT NULL,
      "max_hp" INTEGER NOT NULL,
      "current_hp" INTEGER NOT NULL,
      "player_hp" INTEGER NOT NULL DEFAULT 100,
      "status" TEXT NOT NULL DEFAULT 'active',
      "started_at" TEXT NOT NULL,
      "ended_at" TEXT,
      "revlog_start_id" INTEGER NOT NULL
    );`)

    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "friends" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "alias" TEXT NOT NULL,
      "gist_url" TEXT NOT NULL,
      "last_synced_at" TEXT,
      "last_data_json" TEXT,
      "created_at" TEXT NOT NULL
    );`)
    ctx.createIndex('friends_gist_url_idx', 'friends', ['gist_url'], { unique: true })
  },
}
