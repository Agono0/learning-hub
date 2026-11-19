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
import { cognitiveUpsertKeys } from '../src/migrations/025-cognitive-upsert-keys'
import { exposureEventsMigration } from '../src/migrations/026-exposure-events'
import { hapticsSetting } from '../src/migrations/027-haptics-setting'
import { notificationCenter } from '../src/migrations/028-notification-center'
import { prototypeExemplarSessionsMigration } from '../src/migrations/029-prototype-exemplar'
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

  it('registers 029 prototype-exemplar last, after 028, 027, 026, 025, 024 and 023', () => {
    expect(MIGRATIONS[MIGRATIONS.length - 1]).toBe(prototypeExemplarSessionsMigration)
    expect(MIGRATIONS[MIGRATIONS.length - 2]).toBe(notificationCenter)
    expect(MIGRATIONS[MIGRATIONS.length - 3]).toBe(hapticsSetting)
    expect(MIGRATIONS[MIGRATIONS.length - 4]).toBe(exposureEventsMigration)
    expect(MIGRATIONS[MIGRATIONS.length - 5]).toBe(cognitiveUpsertKeys)
    expect(MIGRATIONS[MIGRATIONS.length - 6]).toBe(ultimateCognitiveExpansion)
    expect(MIGRATIONS[MIGRATIONS.length - 7]).toBe(deckDelayedFeedback)
  })
})

describe('027 haptics-setting', () => {
  // a pre-027 user_settings row, as shipped by earlier migrations
  const createPre027Settings = (raw: RawSqliteHandle) => {
    raw.exec(
      `CREATE TABLE user_settings (
        id TEXT PRIMARY KEY DEFAULT 'default',
        theme TEXT NOT NULL DEFAULT 'dark',
        session_minutes INTEGER NOT NULL DEFAULT 25,
        updated_at TEXT NOT NULL
      );`,
    )
    raw.exec(
      `INSERT INTO user_settings (id, theme, updated_at) VALUES ('default', 'dark', '2026-01-01T00:00:00.000Z');`,
    )
  }

  it('adds haptics_enabled to an existing user_settings table (rows keep default ON)', () => {
    const raw = open()
    createPre027Settings(raw)

    const report = runMigrations(raw, [hapticsSetting])
    expect(report.applied).toEqual([{ id: 27, name: 'haptics-setting' }])
    expect(columns(raw, 'user_settings')).toContain('haptics_enabled')
    // The shipped behavior (haptics on) is the default — existing users see no change.
    const row = raw
      .prepare('SELECT theme, haptics_enabled FROM user_settings WHERE id = ?')
      .get('default') as { theme: string; haptics_enabled: number }
    expect(row).toEqual({ theme: 'dark', haptics_enabled: 1 })
  })

  it('is idempotent — re-running adds nothing and fails nowhere', () => {
    const raw = open()
    createPre027Settings(raw)
    runMigrations(raw, [hapticsSetting])
    const second = runMigrations(raw, [hapticsSetting])
    expect(second.applied).toEqual([]) // recorded once; up() not re-run
    expect(() => hapticsSetting.up(createMigrationContext(raw))).not.toThrow() // even forced
  })

  it('is a no-op on tables that do not exist (fresh DBs get the column from schema.ts)', () => {
    const raw = open()
    const report = runMigrations(raw, [hapticsSetting])
    expect(report.applied).toEqual([{ id: 27, name: 'haptics-setting' }])
    expect(() => hapticsSetting.up(createMigrationContext(raw))).not.toThrow()
  })
})

describe('026 exposure-events', () => {
  it('creates the exposure_events table and indexes idempotently', () => {
    const raw = open()
    const ctx = createMigrationContext(raw)
    exposureEventsMigration.up(ctx)

    expect(ctx.hasTable('exposure_events')).toBe(true)
    const cols = columns(raw, 'exposure_events')
    expect(cols).toContain('token')
    expect(cols).toContain('normalized')
    expect(cols).toContain('source_type')
    expect(cols).toContain('context_snippet')

    // Idempotent re-run
    expect(() => exposureEventsMigration.up(ctx)).not.toThrow()
  })
})

describe('029 prototype-exemplar', () => {
  it('creates the append-only sessions table and created_at index idempotently', () => {
    const raw = open()
    const ctx = createMigrationContext(raw)
    prototypeExemplarSessionsMigration.up(ctx)

    expect(ctx.hasTable('prototype_exemplar_sessions')).toBe(true)
    const cols = columns(raw, 'prototype_exemplar_sessions')
    expect(cols).toContain('set_id')
    expect(cols).toContain('phase')
    expect(cols).toContain('trials_json')
    expect(cols).toContain('metrics_json')
    expect(cols).toContain('accuracy')
    expect(cols).toContain('created_at')

    // Idempotent re-run (fresh DBs get the same shape from schema.ts)
    expect(() => prototypeExemplarSessionsMigration.up(ctx)).not.toThrow()

    // The append-only ledger accepts inserts and answers day-bucket queries.
    raw.exec(`
      INSERT INTO prototype_exemplar_sessions (set_id, accuracy, created_at)
        VALUES ('proto-bird-typicality', 90.0, '2026-01-15T09:00:00.000Z');
    `)
    const row = raw
      .prepare(
        "SELECT set_id, phase, substr(created_at, 1, 10) AS day FROM prototype_exemplar_sessions WHERE substr(created_at, 1, 10) = '2026-01-15'",
      )
      .get()
    expect(row).toEqual({ set_id: 'proto-bird-typicality', phase: 'complete', day: '2026-01-15' })
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

describe('025 cognitive-upsert-keys', () => {
  /** The exact pre-release table shapes found in a real development database. */
  const legacyTables = (raw: RawSqliteHandle) =>
    raw.exec(`
      CREATE TABLE cards (id INTEGER PRIMARY KEY);
      CREATE TABLE palaces (id INTEGER PRIMARY KEY);
      CREATE TABLE tmr_cues (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        card_id integer NOT NULL REFERENCES cards(id) ON DELETE cascade,
        earcon_signature text NOT NULL,
        times_cued_awake integer NOT NULL DEFAULT 0,
        times_cued_sleep integer NOT NULL DEFAULT 0,
        last_sleep_cue_at text,
        overnight_gain_score real,
        created_at text NOT NULL
      );
      CREATE INDEX tmr_cues_card_idx ON tmr_cues (card_id);
      CREATE TABLE palace_3d_scenes (
        id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
        palace_id integer NOT NULL REFERENCES palaces(id) ON DELETE cascade,
        environment_archetype text NOT NULL DEFAULT 'roman_villa',
        camera_start_pos text,
        walk_path text,
        spatial_loci text NOT NULL DEFAULT '[]',
        audio_panning_enabled integer NOT NULL DEFAULT true,
        updated_at text NOT NULL
      );
    `)

  it('dedupes legacy rows (summing cue counters) and makes card_id / palace_id upsertable', () => {
    const raw = open()
    legacyTables(raw)
    raw.exec(`
      INSERT INTO cards (id) VALUES (1), (2);
      INSERT INTO palaces (id) VALUES (7);
      INSERT INTO tmr_cues (card_id, earcon_signature, times_cued_awake, times_cued_sleep, created_at)
        VALUES (1, '{}', 1, 2, 'a'), (1, '{}', 3, 4, 'b'), (2, '{}', 1, 0, 'c');
      INSERT INTO palace_3d_scenes (palace_id, spatial_loci, updated_at)
        VALUES (7, '[1]', 'old'), (7, '[2]', 'new');
    `)

    expect(runMigrations(raw, [cognitiveUpsertKeys]).applied).toEqual([
      { id: 25, name: 'cognitive-upsert-keys' },
    ])

    const cues = raw
      .prepare('SELECT card_id, times_cued_awake, times_cued_sleep FROM tmr_cues ORDER BY card_id')
      .all()
    expect(cues).toEqual([
      { card_id: 1, times_cued_awake: 4, times_cued_sleep: 6 },
      { card_id: 2, times_cued_awake: 1, times_cued_sleep: 0 },
    ])
    expect(raw.prepare('SELECT spatial_loci FROM palace_3d_scenes').all()).toEqual([
      { spatial_loci: '[2]' },
    ])

    // The upserts the repos issue now work.
    raw.exec(`
      INSERT INTO tmr_cues (card_id, earcon_signature, times_cued_awake, created_at)
        VALUES (1, '{}', 1, 'd')
        ON CONFLICT (card_id) DO UPDATE SET times_cued_awake = times_cued_awake + 1;
      INSERT INTO palace_3d_scenes (palace_id, spatial_loci, updated_at) VALUES (7, '[3]', 'x')
        ON CONFLICT (palace_id) DO UPDATE SET spatial_loci = excluded.spatial_loci;
    `)
    expect(raw.prepare('SELECT times_cued_awake FROM tmr_cues WHERE card_id = 1').get()).toEqual({
      times_cued_awake: 5,
    })
    expect(raw.prepare('SELECT spatial_loci FROM palace_3d_scenes').get()).toEqual({
      spatial_loci: '[3]',
    })
  })

  it('leaves a fresh 024 database untouched (key is already the primary key)', () => {
    const raw = open()
    raw.exec(
      'CREATE TABLE cards (id INTEGER PRIMARY KEY); CREATE TABLE palaces (id INTEGER PRIMARY KEY); CREATE TABLE decks (id INTEGER PRIMARY KEY); CREATE TABLE courses (id INTEGER PRIMARY KEY);',
    )
    runMigrations(raw, [ultimateCognitiveExpansion])
    const before = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all()
    runMigrations(raw, [cognitiveUpsertKeys])
    const after = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name")
      .all()
    expect(after).toEqual(before)
  })

  it('is a no-op when the tables do not exist', () => {
    expect(() => cognitiveUpsertKeys.up(createMigrationContext(open()))).not.toThrow()
  })
})
