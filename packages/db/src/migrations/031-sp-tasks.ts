/**
 * 031 — sp-tasks (S3-01): Super Productivity parity core — the task system.
 *
 * Batch A of the SP parity schema (TASKS.md Epic 3): task projects, tags,
 * the task items themselves (with SP's subtask one-nesting-level parent,
 * per-day time maps, won't-do state), repeat configs, per-task reminders,
 * and the item↔tag link table. Batch B (S3-02) adds the time-log/section/
 * attachment/view/metric/counter tables on top.
 *
 * Fresh databases get these tables from `schema.ts` (drizzle-kit push on
 * Node, generated runtime DDL in the native webview worker) — this migration
 * only brings EXISTING databases up to that shape. Every statement is
 * `IF NOT EXISTS`, so the migration is a no-op on fresh DBs and re-runnable
 * on migrated ones. Never edit after it has shipped (AGENTS.md rule 4).
 *
 * Referential integrity note: the DDL carries FOREIGN KEY clauses to match
 * what the generated DDL from schema.ts emits, but SQLite does not enforce
 * them unless `PRAGMA foreign_keys=ON`; the task repos (S3-15) own integrity
 * so both fresh and migrated databases behave identically.
 */
import type { Migration } from './runner'

export const spTasks: Migration = {
  id: 31,
  name: 'sp-tasks',
  up(ctx) {
    // Order matters for the FOREIGN KEY clauses: projects/tags/repeat-cfgs
    // before items, items before the link table and reminders.
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "task_projects" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "title" TEXT NOT NULL,
      "notes" TEXT,
      "backlog_flag" INTEGER NOT NULL DEFAULT 0,
      "color" TEXT,
      "archived_at" TEXT,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );`)
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "task_tags" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "name" TEXT NOT NULL UNIQUE,
      "color" TEXT,
      "created_at" TEXT NOT NULL
    );`)
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "task_repeat_cfgs" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "cycle" TEXT NOT NULL,
      "interval" INTEGER NOT NULL DEFAULT 1,
      "start_date" TEXT,
      "end_date" TEXT,
      "skip_dates" TEXT NOT NULL DEFAULT '[]',
      "re_anchor" TEXT NOT NULL DEFAULT 'completion',
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );`)
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "task_items" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "parent_id" INTEGER,
      "project_id" INTEGER,
      "title" TEXT NOT NULL,
      "notes" TEXT,
      "priority" TEXT NOT NULL DEFAULT 'none',
      "estimate_ms" INTEGER,
      "time_spent_on_day" TEXT NOT NULL DEFAULT '{}',
      "due" TEXT,
      "due_with_time" INTEGER NOT NULL DEFAULT 0,
      "deadline" TEXT,
      "is_done" INTEGER NOT NULL DEFAULT 0,
      "done_at" TEXT,
      "wonthado" INTEGER NOT NULL DEFAULT 0,
      "repeat_cfg_id" INTEGER,
      "order" INTEGER NOT NULL DEFAULT 0,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL,
      FOREIGN KEY ("parent_id") REFERENCES "task_items" ("id"),
      FOREIGN KEY ("project_id") REFERENCES "task_projects" ("id"),
      FOREIGN KEY ("repeat_cfg_id") REFERENCES "task_repeat_cfgs" ("id")
    );`)
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "task_item_tags" (
      "item_id" INTEGER NOT NULL,
      "tag_id" INTEGER NOT NULL,
      PRIMARY KEY ("item_id", "tag_id"),
      FOREIGN KEY ("item_id") REFERENCES "task_items" ("id"),
      FOREIGN KEY ("tag_id") REFERENCES "task_tags" ("id")
    );`)
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "task_reminders" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "task_id" INTEGER NOT NULL,
      "remind_at" TEXT NOT NULL,
      "type" TEXT NOT NULL DEFAULT 'at_time',
      "exact_alarm" INTEGER NOT NULL DEFAULT 0,
      "created_at" TEXT NOT NULL,
      FOREIGN KEY ("task_id") REFERENCES "task_items" ("id")
    );`)

    // List-scanning indexes (S3-15 repos): project/parent/done/due filters,
    // repeat projections, reminder lookups, and the tag side of the link table
    // (the composite PK already covers item→tags).
    ctx.createIndex('task_items_project_idx', 'task_items', ['project_id'])
    ctx.createIndex('task_items_parent_idx', 'task_items', ['parent_id'])
    ctx.createIndex('task_items_done_idx', 'task_items', ['is_done'])
    ctx.createIndex('task_items_due_idx', 'task_items', ['due'])
    ctx.createIndex('task_items_repeat_idx', 'task_items', ['repeat_cfg_id'])
    ctx.createIndex('task_item_tags_tag_idx', 'task_item_tags', ['tag_id'])
    ctx.createIndex('task_reminders_task_idx', 'task_reminders', ['task_id'])
    ctx.createIndex('task_reminders_at_idx', 'task_reminders', ['remind_at'])
  },
}
