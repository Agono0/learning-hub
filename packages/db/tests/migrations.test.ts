import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  MIGRATIONS,
  assertMigrationOrder,
  createMigrationContext,
  runMigrations,
  type Migration,
} from '../src/migrations'
import { goalIfThen } from '../src/migrations/022-goal-if-then'
import { deckDelayedFeedback } from '../src/migrations/023-deck-delayed-feedback'
import { ultimateCognitiveExpansion } from '../src/migrations/024-ultimate-cognitive-expansion'
import type { RawSqliteHandle } from '../src/index'

const open = () => new Database(':memory:') as unknown as RawSqliteHandle

const columns = (raw: RawSqliteHandle, table: string) =>
  (raw.pragma(`table_info(${table})`) as { name: string }[]).map((c) => c.name)

describe('migration runner', () => {
  it('applies pending migrations once, in order, and records them', () => {
    const raw = open()
    raw.exec('CREATE TABLE things (id INTEGER PRIMARY KEY);')
    const calls: number[] = []
    const migrations: Migration[] = [
      { id: 1, name: 'one', up: (ctx) => (calls.push(1), ctx.addColumn('things', 'a', 'TEXT')) },
      {
        id: 2,
        name: 'two',
        up: (ctx) => (calls.push(2), ctx.createIndex('things_a_idx', 'things', ['a'])),
      },
    ]

    const first = runMigrations(raw, migrations)
    expect(first.applied.map((m) => m.id)).toEqual([1, 2])
    expect(first.version).toBe(2)
    expect(columns(raw, 'things')).toContain('a')

    const second = runMigrations(raw, migrations)
    expect(second.applied).toEqual([])
    expect(calls).toEqual([1, 2])
  })

  it('addColumn is a no-op when the column already exists (fresh drizzle-kit DB)', () => {
    const raw = open()
    raw.exec('CREATE TABLE things (id INTEGER PRIMARY KEY, a TEXT);')
    const report = runMigrations(raw, [
      {
        id: 1,
        name: 'add-a',
        up: (ctx) => expect(ctx.addColumn('things', 'a', 'TEXT')).toBe(false),
      },
    ])
    expect(report.applied).toHaveLength(1)
  })

  it('skips steps on tables that do not exist yet', () => {
    const raw = open()
    expect(() =>
      runMigrations(raw, [
        {
          id: 1,
          name: 'missing',
          up: (ctx) => {
            ctx.addColumn('nope', 'x', 'TEXT')
            ctx.createIndex('nope_idx', 'nope', ['x'])
          },
        },
      ]),
    ).not.toThrow()
  })

  it('rolls back a failing migration and does not record it', () => {
    const raw = open()
    raw.exec('CREATE TABLE things (id INTEGER PRIMARY KEY);')
    const boom: Migration = {
      id: 1,
      name: 'boom',
      up: (ctx) => {
        ctx.addColumn('things', 'a', 'TEXT')
        throw new Error('boom')
      },
    }
    expect(() => runMigrations(raw, [boom])).toThrow('boom')
    expect(columns(raw, 'things')).not.toContain('a')
    expect(raw.prepare('SELECT count(*) AS c FROM schema_migrations').get()).toEqual({ c: 0 })
  })

  it('rejects unordered or duplicate ids', () => {
    const m = (id: number): Migration => ({ id, name: `m${id}`, up: () => {} })
    expect(() => assertMigrationOrder([m(1), m(1)])).toThrow(/strictly increasing/)
    expect(() => assertMigrationOrder([m(2), m(1)])).toThrow(/strictly increasing/)
  })

  it('ships a well-formed registry', () => {
    expect(() => assertMigrationOrder(MIGRATIONS)).not.toThrow()
    expect(MIGRATIONS[0]?.id).toBe(1)
  })

  it('registers 024 ultimate-cognitive-expansion last, after 023 and 022', () => {
    expect(MIGRATIONS[MIGRATIONS.length - 1]).toBe(ultimateCognitiveExpansion)
    expect(MIGRATIONS[MIGRATIONS.length - 2]).toBe(deckDelayedFeedback)
    expect(MIGRATIONS[MIGRATIONS.length - 3]).toBe(goalIfThen)
  })
})

describe('022 goal-if-then', () => {
  // a pre-022 goals table, as shipped by the baseline migration
  const createPre022Goals = (raw: RawSqliteHandle) =>
    raw.exec(`CREATE TABLE goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wish TEXT NOT NULL,
      outcome TEXT,
      obstacle TEXT,
      if_then_plan TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      progress_pct REAL NOT NULL DEFAULT 0,
      quote_id INTEGER,
      due_date TEXT,
      created_at TEXT NOT NULL
    );`)

  it('adds the structured if-then columns to an existing goals table', () => {
    const raw = open()
    createPre022Goals(raw)
    raw.exec(
      `INSERT INTO goals (wish, created_at) VALUES ('Pass the exam', '2026-01-01T00:00:00Z');`,
    )

    const report = runMigrations(raw, [goalIfThen])
    expect(report.applied).toEqual([{ id: 22, name: 'goal-if-then' }])
    expect(columns(raw, 'goals')).toContain('if_condition')
    expect(columns(raw, 'goals')).toContain('then_action')
    // existing rows survive with NULL in the new optional columns
    const row = raw.prepare('SELECT wish, if_condition, then_action FROM goals').get() as {
      wish: string
      if_condition: null
      then_action: null
    }
    expect(row).toEqual({ wish: 'Pass the exam', if_condition: null, then_action: null })
  })

  it('is idempotent — re-running adds nothing and fails nowhere', () => {
    const raw = open()
    createPre022Goals(raw)
    runMigrations(raw, [goalIfThen])
    const second = runMigrations(raw, [goalIfThen])
    expect(second.applied).toEqual([]) // recorded once; up() not re-run
    expect(() => goalIfThen.up(createMigrationContext(raw))).not.toThrow() // even forced
  })
})

describe('024 ultimate-cognitive-expansion', () => {
  it('creates the 7 cognitive and spatial tables idempotently', () => {
    const raw = open()
    const report = runMigrations(raw, [ultimateCognitiveExpansion])
    expect(report.applied).toEqual([{ id: 24, name: 'ultimate-cognitive-expansion' }])
    expect(columns(raw, 'circadian_audio_sessions')).toContain('session_mode')
    expect(columns(raw, 'tmr_cues')).toContain('earcon_signature')
    expect(columns(raw, 'concept_dag_nodes')).toContain('mastery_prob')
    expect(columns(raw, 'concept_dag_edges')).toContain('prerequisite_id')
    expect(columns(raw, 'cognitive_telemetry_events')).toContain('estimated_cli')
    expect(columns(raw, 'palace_3d_scenes')).toContain('environment_archetype')
    expect(columns(raw, 'dialectic_arena_debates')).toContain('thesis_agent_role')

    // Idempotent re-run
    const second = runMigrations(raw, [ultimateCognitiveExpansion])
    expect(second.applied).toEqual([])
  })
})
