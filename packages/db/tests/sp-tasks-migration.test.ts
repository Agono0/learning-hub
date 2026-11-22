/**
 * Tests for the 031 sp-tasks migration (S3-01).
 *
 * Direct-migration tests (no registry dependency — MIGRATIONS registration
 * is lead-applied alongside the schema.ts batch): table creation with the
 * full SP batch-A column set, idempotency (double `up`, re-run through the
 * runner), and no-op behavior on a fresh database that already has the
 * tables from schema.ts.
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { createMigrationContext, runMigrations } from '../src/migrations/runner'
import { spTasks } from '../src/migrations/031-sp-tasks'
import type { RawSqliteHandle } from '../src/index'

const open = () => new Database(':memory:') as unknown as RawSqliteHandle

const columns = (raw: RawSqliteHandle, table: string) =>
  (raw.pragma(`table_info("${table}")`) as { name: string }[]).map((c) => c.name)

const tables = (raw: RawSqliteHandle) =>
  (
    raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'task_%'")
      .all() as {
      name: string
    }[]
  ).map((r) => r.name)

describe('031 sp-tasks (S3-01 batch A)', () => {
  it('creates all six batch-A tables with the SP parity columns', () => {
    const raw = open()
    const report = runMigrations(raw, [spTasks])
    expect(report.applied.map((m) => m.id)).toEqual([31])

    expect(tables(raw).sort()).toEqual([
      'task_item_tags',
      'task_items',
      'task_projects',
      'task_reminders',
      'task_repeat_cfgs',
      'task_tags',
    ])

    expect(columns(raw, 'task_items')).toEqual(
      expect.arrayContaining([
        'id',
        'parent_id',
        'project_id',
        'title',
        'notes',
        'priority',
        'estimate_ms',
        'time_spent_on_day',
        'due',
        'due_with_time',
        'deadline',
        'is_done',
        'done_at',
        'wonthado',
        'repeat_cfg_id',
        'order',
        'created_at',
        'updated_at',
      ]),
    )
    expect(columns(raw, 'task_projects')).toEqual(
      expect.arrayContaining(['id', 'title', 'notes', 'backlog_flag', 'color', 'archived_at']),
    )
    expect(columns(raw, 'task_repeat_cfgs')).toEqual(
      expect.arrayContaining([
        'id',
        'cycle',
        'interval',
        'start_date',
        'end_date',
        'skip_dates',
        're_anchor',
      ]),
    )
    expect(columns(raw, 'task_reminders')).toEqual(
      expect.arrayContaining(['id', 'task_id', 'remind_at', 'type', 'exact_alarm']),
    )
    expect(columns(raw, 'task_item_tags')).toEqual(['item_id', 'tag_id'])
    expect(columns(raw, 'task_tags')).toEqual(expect.arrayContaining(['id', 'name', 'color']))
  })

  it('creates the parity indexes idempotently', () => {
    const raw = open()
    runMigrations(raw, [spTasks])
    const names = (
      raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'task_%'")
        .all() as {
        name: string
      }[]
    ).map((r) => r.name)
    for (const expected of [
      'task_items_project_idx',
      'task_items_parent_idx',
      'task_items_done_idx',
      'task_items_due_idx',
      'task_items_repeat_idx',
      'task_item_tags_tag_idx',
      'task_reminders_task_idx',
      'task_reminders_at_idx',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('is idempotent — double up() and runner re-run both no-op', () => {
    const raw = open()
    spTasks.up(createMigrationContext(raw))
    // Second direct application must not throw (all IF NOT EXISTS).
    expect(() => spTasks.up(createMigrationContext(raw))).not.toThrow()
    // Runner on an already-migrated database applies nothing.
    const second = runMigrations(raw, [spTasks])
    expect(second.applied).toEqual([])
  })

  it('is a no-op on a fresh database that already has the tables (schema.ts path)', () => {
    const raw = open()
    // Simulate drizzle-kit push / runtime DDL having created everything.
    spTasks.up(createMigrationContext(raw))
    const before = tables(raw).sort()
    // A *new* database that already has the tables: the migration still
    // records (runner contract) but recreates nothing and loses no data.
    const raw2 = open()
    spTasks.up(createMigrationContext(raw2))
    raw2.exec(
      `INSERT INTO task_projects (title, created_at, updated_at) VALUES ('kept', '2026-01-01', '2026-01-01');`,
    )
    expect(() => spTasks.up(createMigrationContext(raw2))).not.toThrow()
    const kept = raw2.prepare('SELECT title FROM task_projects').all() as { title: string }[]
    expect(kept).toEqual([{ title: 'kept' }])
    expect(tables(raw2).sort()).toEqual(before)
  })

  it('accepts SP-shaped rows: per-day time map, won\u2019t-do, subtask parent', () => {
    const raw = open()
    runMigrations(raw, [spTasks])
    raw.exec(
      `INSERT INTO task_repeat_cfgs (cycle, interval, skip_dates, created_at, updated_at)
       VALUES ('w', 2, '[]', '2026-01-01', '2026-01-01');`,
    )
    raw.exec(
      `INSERT INTO task_items (title, time_spent_on_day, wonthado, is_done, repeat_cfg_id, "order", created_at, updated_at)
       VALUES ('parent', '{"2026-11-22": 900000}', 0, 0, 1, 0, '2026-01-01', '2026-01-01'),
              ('subtask', '{}', 1, 1, NULL, 1, '2026-01-01', '2026-01-01');`,
    )
    raw.exec(
      `UPDATE task_items SET parent_id = (SELECT id FROM task_items WHERE title = 'parent')
       WHERE title = 'subtask';`,
    )
    const counts = raw
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM task_items) AS items,
          (SELECT COUNT(*) FROM task_items WHERE parent_id IS NOT NULL) AS subs,
          (SELECT COUNT(*) FROM task_repeat_cfgs) AS cfgs`,
      )
      .get() as { items: number; subs: number; cfgs: number }
    expect(counts).toEqual({ items: 2, subs: 1, cfgs: 1 })
  })
})
