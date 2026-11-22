/**
 * Tests for the 032 sp-views migration (S3-02, batch B).
 *
 * Direct-migration tests (no registry dependency — MIGRATIONS registration
 * is lead-applied alongside the schema.ts batch): the eight batch-B tables,
 * their indexes, idempotency (double `up` + runner re-run), and an SP-shaped
 * usage check (per-day time log rows, counter logs keyed by day, unique
 * metric day).
 */
import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { createMigrationContext, runMigrations } from '../src/migrations/runner'
import { spViews } from '../src/migrations/032-sp-views'
import type { RawSqliteHandle } from '../src/index'

const open = () => new Database(':memory:') as unknown as RawSqliteHandle

const columns = (raw: RawSqliteHandle, table: string) =>
  (raw.pragma(`table_info("${table}")`) as { name: string }[]).map((c) => c.name)

const tables = (raw: RawSqliteHandle) =>
  (
    raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND (name LIKE 'task_%' OR name LIKE 'simple_%' OR name LIKE 'metric_%')",
      )
      .all() as { name: string }[]
  ).map((r) => r.name)

describe('032 sp-views (S3-02 batch B)', () => {
  it('creates all eight batch-B tables with the expected columns', () => {
    const raw = open()
    const report = runMigrations(raw, [spViews])
    expect(report.applied.map((m) => m.id)).toEqual([32])

    expect(tables(raw).sort()).toEqual([
      'metric_days',
      'simple_counter_logs',
      'simple_counters',
      'task_archive_tiers',
      'task_attachments',
      'task_sections',
      'task_time_logs',
      'task_views',
    ])

    expect(columns(raw, 'task_time_logs')).toEqual(
      expect.arrayContaining(['id', 'task_id', 'day', 'session_ms', 'started_at', 'source']),
    )
    expect(columns(raw, 'task_sections')).toEqual(
      expect.arrayContaining(['id', 'name', 'sort_order']),
    )
    expect(columns(raw, 'task_attachments')).toEqual(
      expect.arrayContaining(['id', 'task_id', 'type', 'value', 'title']),
    )
    expect(columns(raw, 'task_archive_tiers')).toEqual(
      expect.arrayContaining(['id', 'task_id', 'tier', 'archived_at']),
    )
    expect(columns(raw, 'simple_counters')).toEqual(
      expect.arrayContaining(['id', 'label', 'color', 'archived']),
    )
    expect(columns(raw, 'simple_counter_logs')).toEqual(
      expect.arrayContaining(['id', 'counter_id', 'day', 'count']),
    )
    expect(columns(raw, 'metric_days')).toEqual(
      expect.arrayContaining(['id', 'day', 'metrics', 'impact', 'energy', 'reflection']),
    )
    expect(columns(raw, 'task_views')).toEqual(
      expect.arrayContaining(['id', 'name', 'kind', 'filter', 'sort_by', 'group_by']),
    )
  })

  it('creates the batch-B indexes', () => {
    const raw = open()
    runMigrations(raw, [spViews])
    const names = (
      raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE '%_idx'")
        .all() as {
        name: string
      }[]
    ).map((r) => r.name)
    for (const expected of [
      'task_time_logs_task_day_idx',
      'task_attachments_task_idx',
      'task_archive_tiers_tier_idx',
      'simple_counter_logs_day_uniq',
      'task_views_kind_idx',
    ]) {
      expect(names).toContain(expected)
    }
  })

  it('is idempotent — double up() and runner re-run both no-op', () => {
    const raw = open()
    spViews.up(createMigrationContext(raw))
    expect(() => spViews.up(createMigrationContext(raw))).not.toThrow()
    const second = runMigrations(raw, [spViews])
    expect(second.applied).toEqual([])
  })

  it('accepts SP-shaped usage: time logs, counter logs, unique metric day', () => {
    const raw = open()
    runMigrations(raw, [spViews])
    raw.exec(
      `INSERT INTO task_time_logs (task_id, day, session_ms, source, created_at)
       VALUES (1, '2026-11-22', 900000, 'focus', '2026-11-22T10:00:00Z'),
              (1, '2026-11-22', 300000, 'manual', '2026-11-22T11:00:00Z');`,
    )
    raw.exec(
      `INSERT INTO simple_counters (label, created_at, updated_at) VALUES ('Water', '2026-11-22', '2026-11-22');
       INSERT INTO simple_counter_logs (counter_id, day, count, created_at)
       VALUES (1, '2026-11-22', 2, '2026-11-22');`,
    )
    raw.exec(
      `INSERT INTO metric_days (day, metrics, impact, energy, created_at, updated_at)
       VALUES ('2026-11-22', '{"deep_work":1500000}', 3, 2, '2026-11-22', '2026-11-22');`,
    )
    const totals = raw
      .prepare(
        `SELECT
          (SELECT SUM(session_ms) FROM task_time_logs WHERE day = '2026-11-22') AS ms,
          (SELECT count FROM simple_counter_logs WHERE day = '2026-11-22') AS taps,
          (SELECT impact FROM metric_days WHERE day = '2026-11-22') AS impact`,
      )
      .get() as { ms: number; taps: number; impact: number }
    expect(totals).toEqual({ ms: 1200000, taps: 2, impact: 3 })

    // metric_days.day is UNIQUE — a second insert for the same day fails.
    expect(() =>
      raw.exec(
        `INSERT INTO metric_days (day, metrics, created_at, updated_at)
         VALUES ('2026-11-22', '{}', '2026-11-22', '2026-11-22');`,
      ),
    ).toThrow()
  })
})
