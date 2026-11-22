/**
 * 032 — sp-views (S3-02): Super Productivity parity core — batch B.
 *
 * The batch-A companions: per-task time logs, task list sections,
 * attachments, the young/old archive tiers, simple counters (+ their daily
 * logs, which the streak math in S3-31/S3-90 needs), per-day metric records
 * (with the evaluation-sheet fields S3-50 renders), and saved task views /
 * boards (S3-24/S3-44).
 *
 * Fresh databases get these from `schema.ts` (drizzle-kit / generated
 * runtime DDL) — this migration only upgrades EXISTING databases. Every
 * statement is `IF NOT EXISTS`; never edit after it has shipped
 * (AGENTS.md rule 4). Link columns are plain integers + indexes (batch A
 * convention): repos (S3-15) own referential integrity.
 */
import type { Migration } from './runner'

export const spViews: Migration = {
  id: 32,
  name: 'sp-views',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "task_time_logs" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "task_id" INTEGER NOT NULL,
      "day" TEXT NOT NULL,
      "session_ms" INTEGER NOT NULL,
      "started_at" TEXT,
      "source" TEXT NOT NULL DEFAULT 'manual',
      "created_at" TEXT NOT NULL,
      FOREIGN KEY ("task_id") REFERENCES "task_items" ("id")
    );`)
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "task_sections" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "name" TEXT NOT NULL,
      "sort_order" INTEGER NOT NULL DEFAULT 0,
      "created_at" TEXT NOT NULL
    );`)
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "task_attachments" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "task_id" INTEGER NOT NULL,
      "type" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "title" TEXT,
      "created_at" TEXT NOT NULL,
      FOREIGN KEY ("task_id") REFERENCES "task_items" ("id")
    );`)
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "task_archive_tiers" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "task_id" INTEGER NOT NULL UNIQUE,
      "tier" TEXT NOT NULL DEFAULT 'young',
      "archived_at" TEXT NOT NULL,
      "created_at" TEXT NOT NULL,
      FOREIGN KEY ("task_id") REFERENCES "task_items" ("id")
    );`)
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "simple_counters" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "label" TEXT NOT NULL,
      "color" TEXT,
      "archived" INTEGER NOT NULL DEFAULT 0,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );`)
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "simple_counter_logs" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "counter_id" INTEGER NOT NULL,
      "day" TEXT NOT NULL,
      "count" INTEGER NOT NULL DEFAULT 1,
      "created_at" TEXT NOT NULL,
      FOREIGN KEY ("counter_id") REFERENCES "simple_counters" ("id")
    );`)
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "metric_days" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "day" TEXT NOT NULL UNIQUE,
      "metrics" TEXT NOT NULL DEFAULT '{}',
      "impact" INTEGER,
      "energy" INTEGER,
      "reflection" TEXT,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );`)
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "task_views" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "name" TEXT NOT NULL,
      "kind" TEXT NOT NULL DEFAULT 'custom',
      "filter" TEXT NOT NULL DEFAULT '{}',
      "sort_by" TEXT,
      "group_by" TEXT,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );`)

    ctx.createIndex('task_time_logs_task_day_idx', 'task_time_logs', ['task_id', 'day'])
    ctx.createIndex('task_attachments_task_idx', 'task_attachments', ['task_id'])
    ctx.createIndex('task_archive_tiers_tier_idx', 'task_archive_tiers', ['tier'])
    // One row per counter per day — taps increment `count` (streak math).
    ctx.createIndex('simple_counter_logs_day_uniq', 'simple_counter_logs', ['counter_id', 'day'], {
      unique: true,
    })
    ctx.createIndex('task_views_kind_idx', 'task_views', ['kind'])
  },
}
