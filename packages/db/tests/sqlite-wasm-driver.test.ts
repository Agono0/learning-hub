/**
 * DE-RISK SPIKE — better-sqlite3-compatible shim over @sqlite.org/sqlite-wasm.
 *
 * Proves that the repo's sync drizzle code (drizzle-orm/better-sqlite3 + the
 * raw better-sqlite3 usage in src/index.ts / src/backup.ts) runs unchanged on
 * the wasm shim:
 *   (a) raw CRUD parity shim vs better-sqlite3 on temp files,
 *   (b) drizzle insert/select/update/delete over the shim (repo schema),
 *   (c) transaction semantics: commit, rollback-on-throw, nested savepoint,
 *   (d) THE KEY PROOF: executeReview() end-to-end on the wasm drizzle instance,
 *   (e) backup-style raw reads (SELECT * over tables),
 *   (f) 1000-row insert perf sanity (< 2s).
 *
 * NO existing packages/db/src file is modified by this spike — it only adds
 * src/driver/sqlite-wasm.ts, src/driver/sqlite-wasm-drizzle.ts and this test.
 * (Importing src/review-service transitively opens the real app DB via
 * src/index — same as the existing suite; that is pre-existing behavior.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq } from 'drizzle-orm'
import Database from 'better-sqlite3'
import * as schema from '../src/schema'
import type { LearningHubDB } from '../src/index'
import { executeReview } from '../src/review-service'
import { initSqliteWasm, createSqliteWasmDb } from '../src/driver/sqlite-wasm'
import type { SqliteWasmDatabase } from '../src/driver/sqlite-wasm'
import { createWasmLearningHubDb } from '../src/driver/sqlite-wasm-drizzle'

let tmpDir: string
let nextId = 0
const openDbs: { close(): void }[] = []

beforeAll(async () => {
  await initSqliteWasm()
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhub-wasm-spike-'))
})

afterAll(() => {
  for (const db of openDbs) {
    try {
      db.close()
    } catch {
      /* already closed */
    }
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    /* best-effort cleanup on Windows (a handle may linger) */
  }
})

function uniqueFile(label: string): string {
  nextId += 1
  return path.join(tmpDir, `${label}-${nextId}-${process.pid}.db`)
}

function createWasmDb(label: string): SqliteWasmDatabase {
  const db = createSqliteWasmDb(uniqueFile(label))
  openDbs.push(db)
  return db
}

function createBsDb(label: string): Database.Database {
  const db = new Database(uniqueFile(label), { timeout: 5000 })
  openDbs.push(db)
  return db
}

/**
 * Minimal schema DDL copied from packages/db/src/schema.ts (cards, revlog,
 * streaks, xp_events, mastery, elo_events, decks, user_settings). mastery's
 * `references(() => skills.id)` FK clause is omitted because the minimal DB
 * has no skills table; the unique index on skill_id is kept.
 */
const MINIMAL_DDL = `
CREATE TABLE \`decks\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT,
  \`name\` text NOT NULL,
  \`description\` text,
  \`emoji\` text DEFAULT '📚',
  \`created_at\` text NOT NULL
);
CREATE TABLE \`cards\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT,
  \`deck_id\` integer NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  \`note_id\` integer,
  \`bullet_id\` integer,
  \`type\` text NOT NULL,
  \`content\` text NOT NULL,
  \`tags\` text DEFAULT '[]',
  \`source\` text,
  \`skill_id\` integer,
  \`suspended\` integer DEFAULT 0,
  \`bury_until\` text,
  \`due\` text NOT NULL,
  \`stability\` real DEFAULT 0,
  \`difficulty\` real DEFAULT 0,
  \`elapsed_days\` integer DEFAULT 0,
  \`scheduled_days\` integer DEFAULT 0,
  \`reps\` integer DEFAULT 0,
  \`lapses\` integer DEFAULT 0,
  \`state\` integer DEFAULT 0,
  \`last_review\` text,
  \`learning_step\` integer DEFAULT 0,
  \`created_at\` text NOT NULL
);
CREATE TABLE \`revlog\` (
  \`id\` integer PRIMARY KEY,
  \`card_id\` integer NOT NULL,
  \`rating\` integer NOT NULL,
  \`state\` integer NOT NULL,
  \`elapsed_days\` integer NOT NULL,
  \`scheduled_days\` integer NOT NULL,
  \`time_ms\` integer NOT NULL,
  \`confidence\` integer DEFAULT 1,
  \`retrievability\` real,
  \`reviewed_at\` text NOT NULL
);
CREATE TABLE \`streaks\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT,
  \`current\` integer DEFAULT 0,
  \`best\` integer DEFAULT 0,
  \`last_active_date\` text,
  \`freezes\` integer DEFAULT 2,
  \`weekend_amulet\` integer DEFAULT 0,
  \`updated_at\` text NOT NULL
);
CREATE TABLE \`xp_events\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT,
  \`source\` text NOT NULL,
  \`amount\` integer NOT NULL,
  \`meta\` text,
  \`created_at\` text NOT NULL
);
CREATE TABLE \`elo_events\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT,
  \`skill_id\` integer,
  \`rating_before\` real NOT NULL,
  \`rating_after\` real NOT NULL,
  \`item_difficulty\` real,
  \`outcome\` real NOT NULL,
  \`created_at\` text NOT NULL
);
CREATE TABLE \`mastery\` (
  \`id\` integer PRIMARY KEY AUTOINCREMENT,
  \`skill_id\` integer NOT NULL UNIQUE,
  \`p_known\` real DEFAULT 0.1,
  \`attempts\` integer DEFAULT 0,
  \`correct\` integer DEFAULT 0,
  \`elo\` real DEFAULT 1000,
  \`updated_at\` text NOT NULL
);
CREATE TABLE \`user_settings\` (
  \`id\` text PRIMARY KEY DEFAULT 'default',
  \`ai_provider\` text DEFAULT 'none',
  \`ai_model\` text,
  \`ai_base_url\` text,
  \`ai_api_key\` text,
  \`ai_headers\` text,
  \`desired_retention\` real DEFAULT 0.9,
  \`session_minutes\` integer DEFAULT 25,
  \`theme\` text DEFAULT 'dark',
  \`detox_wizard\` text DEFAULT '{}',
  \`values_affirmation\` text,
  \`daily_loop_state\` text DEFAULT '{}',
  \`updated_at\` text NOT NULL
);
`

// ─── (a) raw CRUD parity: shim vs better-sqlite3 ────────────────────────────

describe('(a) shim CRUD parity vs better-sqlite3', () => {
  let bs: Database.Database
  let wa: SqliteWasmDatabase

  beforeAll(() => {
    bs = createBsDb('parity-bs')
    wa = createWasmDb('parity-wasm')
    const ddl = `CREATE TABLE t (
      a INTEGER PRIMARY KEY AUTOINCREMENT, b TEXT, c REAL, d BLOB, e INTEGER)`
    bs.exec(ddl)
    wa.exec(ddl)
  })

  it('run(): {changes, lastInsertRowid} identical', () => {
    const bsInfo = bs
      .prepare('INSERT INTO t (b, c, d, e) VALUES (?, ?, ?, ?)')
      .run('hello', 1.5, Buffer.from([1, 2, 3]), null)
    const waInfo = wa
      .prepare('INSERT INTO t (b, c, d, e) VALUES (?, ?, ?, ?)')
      .run('hello', 1.5, Buffer.from([1, 2, 3]), null)
    expect(waInfo).toEqual(bsInfo) // { changes: 1, lastInsertRowid: 1 }

    const bsInfo2 = bs.prepare('INSERT INTO t (b) VALUES (?)').run('x')
    const waInfo2 = wa.prepare('INSERT INTO t (b) VALUES (?)').run('x')
    expect(waInfo2).toEqual(bsInfo2) // lastInsertRowid advances identically
    expect(waInfo2.lastInsertRowid).toBe(2)
  })

  it('get()/all(): object rows, Buffer blobs, undefined on miss', () => {
    const bsRow = bs.prepare('SELECT a, b, c, d, e FROM t WHERE a = 1').get()
    const waRow = wa.prepare('SELECT a, b, c, d, e FROM t WHERE a = 1').get()
    expect(waRow).toEqual(bsRow)
    expect((waRow as Record<string, unknown>).d).toEqual(Buffer.from([1, 2, 3]))
    expect((waRow as Record<string, unknown>).e).toBeNull()

    const bsRows = bs.prepare('SELECT a, b FROM t ORDER BY a').all()
    const waRows = wa.prepare('SELECT a, b FROM t ORDER BY a').all()
    expect(waRows).toEqual(bsRows)

    expect(wa.prepare('SELECT * FROM t WHERE a = 999').get()).toBeUndefined()
    expect(bs.prepare('SELECT * FROM t WHERE a = 999').get()).toBeUndefined()
  })

  it('raw(): array rows like better-sqlite3 (drizzle values() path)', () => {
    const bsRow = bs.prepare('SELECT a, b, c FROM t WHERE a = 1').raw().get()
    const waRow = wa.prepare('SELECT a, b, c FROM t WHERE a = 1').raw().get()
    expect(waRow).toEqual(bsRow)
    expect(Array.isArray(waRow)).toBe(true)

    const bsRows = bs.prepare('SELECT a, b FROM t ORDER BY a').raw().all()
    const waRows = wa.prepare('SELECT a, b FROM t ORDER BY a').raw().all()
    expect(waRows).toEqual(bsRows)
  })

  it('update/delete changes counts + bigint and boolean binding parity', () => {
    const bsUp = bs.prepare('UPDATE t SET c = c + 1 WHERE a <= 2').run()
    const waUp = wa.prepare('UPDATE t SET c = c + 1 WHERE a <= 2').run()
    expect(waUp.changes).toBe(bsUp.changes)

    const bsDel = bs.prepare('DELETE FROM t WHERE a = 2').run()
    const waDel = wa.prepare('DELETE FROM t WHERE a = 2').run()
    expect(waDel.changes).toBe(bsDel.changes)

    // bigint binds as 64-bit int (epocs-ms ids stay plain numbers on read)
    bs.prepare('INSERT INTO t (b, e) VALUES (?, ?)').run('bigint', 9007199254740991n)
    wa.prepare('INSERT INTO t (b, e) VALUES (?, ?)').run('bigint', 9007199254740991n)
    const bsBig = bs.prepare('SELECT CAST(e AS TEXT) AS e FROM t WHERE b = ?').get('bigint')
    const waBig = wa.prepare('SELECT CAST(e AS TEXT) AS e FROM t WHERE b = ?').get('bigint')
    expect(waBig).toEqual(bsBig) // '9007199254740991' both sides

    // boolean binding DIVERGENCE (documented): the wasm build coerces booleans
    // to 0/1, while better-sqlite3 throws on booleans — the shim is a superset.
    wa.prepare('INSERT INTO t (b, e) VALUES (?, ?)').run('bool', true)
    expect(wa.prepare('SELECT e FROM t WHERE b = ?').get('bool')).toEqual({ e: 1 })
    expect(() => bs.prepare('INSERT INTO t (b, e) VALUES (?, ?)').run('bool', true)).toThrow(
      /only bind numbers, strings, bigints, buffers, and null/,
    )
  })

  it('pragma(): read form, write form, table_info, foreign_key_check', () => {
    wa.pragma('foreign_keys = ON') // write form executes
    expect(wa.pragma('foreign_keys')).toEqual(bs.pragma('foreign_keys')) // [{foreign_keys: 1}]

    const bsInfo = bs.pragma('table_info(t)') as { name: string }[]
    const waInfo = wa.pragma('table_info(t)') as { name: string }[]
    expect(waInfo.map((c) => c.name)).toEqual(bsInfo.map((c) => c.name))

    expect(wa.pragma('foreign_key_check')).toEqual([]) // read form, no violations
    expect(wa.pragma('journal_mode', { simple: true })).toBe('delete') // write form + simple returns the value
  })

  it('persistence: data survives close + reopen on a real file (Node default VFS)', () => {
    const file = uniqueFile('persist')
    const db1 = createSqliteWasmDb(file)
    db1.exec('CREATE TABLE p (x TEXT)')
    db1.prepare('INSERT INTO p (x) VALUES (?)').run('durable')
    db1.close()
    const db2 = createSqliteWasmDb(file)
    expect(db2.prepare('SELECT x FROM p').get()).toEqual({ x: 'durable' })
    db2.close()
  })
})

// ─── (c) transaction semantics ──────────────────────────────────────────────

describe('(c) shim transaction semantics (BEGIN/COMMIT/ROLLBACK/savepoint)', () => {
  let wa: SqliteWasmDatabase

  beforeAll(() => {
    wa = createWasmDb('tx')
    wa.exec('CREATE TABLE tx (v INTEGER)')
  })

  it('commit: rows persist after the wrapped fn returns', () => {
    const insert = wa.prepare('INSERT INTO tx (v) VALUES (?)')
    const tx = wa.transaction((n: number) => insert.run(n))
    tx(1)
    expect(wa.prepare('SELECT count(*) AS n FROM tx').get()).toEqual({ n: 1 })
    expect(wa.inTransaction).toBe(false)
  })

  it('rollback on throw: partial writes are undone', () => {
    const insert = wa.prepare('INSERT INTO tx (v) VALUES (?)')
    const tx = wa.transaction((n: number) => {
      insert.run(n)
      insert.run(n + 1)
      throw new Error('boom')
    })
    expect(() => tx(10)).toThrow('boom')
    const n = wa.prepare('SELECT count(*) AS n FROM tx').get() as { n: number }
    expect(n.n).toBe(1) // the two rolled-back inserts are gone
  })

  it('immediate variant runs BEGIN IMMEDIATE and commits', () => {
    const insert = wa.prepare('INSERT INTO tx (v) VALUES (?)')
    const tx = wa.transaction(() => {
      expect(wa.inTransaction).toBe(true) // BEGIN IMMEDIATE ran
      insert.run(50)
      return 'ok'
    })
    expect(tx.immediate()).toBe('ok')
    expect(wa.inTransaction).toBe(false)
    const n = wa.prepare('SELECT count(*) AS n FROM tx WHERE v = 50').get() as { n: number }
    expect(n.n).toBe(1)
  })

  it('nested call uses a savepoint and releases cleanly', () => {
    const insert = wa.prepare('INSERT INTO tx (v) VALUES (?)')
    const inner = wa.transaction((n: number) => insert.run(n))
    const outer = wa.transaction((n: number) => inner(n + 100))
    outer(1)
    const n = wa.prepare('SELECT count(*) AS n FROM tx').get() as { n: number }
    expect(n.n).toBe(3) // 2 prior rows + the nested insert (committed with outer)

    // Nested throw rolls back to the savepoint AND the whole outer txn
    const failingInner = wa.transaction(() => {
      throw new Error('inner boom')
    })
    const outer2 = wa.transaction(() => {
      insert.run(7)
      failingInner()
    })
    expect(() => outer2()).toThrow('inner boom')
    const n2 = wa.prepare('SELECT count(*) AS n FROM tx').get() as { n: number }
    expect(n2.n).toBe(3) // the outer savepoint (incl. v=7) also rolled back
  })

  it('rejects promise-returning callbacks like better-sqlite3', async () => {
    const tx = wa.transaction(async () => 1)
    expect(() => tx()).toThrow('Transaction function cannot return a promise')
  })
})

// ─── (b) drizzle over wasm ──────────────────────────────────────────────────

describe('(b) drizzle insert/select/update/delete over the shim', () => {
  it('CRUD on repo schema tables (cards, revlog, streaks)', async () => {
    const wa = createWasmDb('drizzle')
    wa.exec(MINIMAL_DDL)
    const db = createWasmLearningHubDb(wa)
    const now = new Date('2026-11-04T12:00:00.000Z')

    db.insert(schema.decks).values({ id: 1, name: 'Wasm Deck', createdAt: now.toISOString() }).run()
    db.insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        type: 'qa',
        content: { front: 'Q', back: 'A' },
        tags: [],
        due: now.toISOString(),
        createdAt: now.toISOString(),
      })
      .run()
    db.insert(schema.revlog)
      .values({
        id: now.getTime(),
        cardId: 1,
        rating: 3,
        state: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        timeMs: 5000,
        confidence: 1,
        retrievability: null,
        reviewedAt: now.toISOString(),
      })
      .run()
    db.insert(schema.streaks)
      .values({
        id: 1,
        current: 0,
        best: 0,
        freezes: 2,
        weekendAmulet: false,
        updatedAt: now.toISOString(),
      })
      .run()

    // select (json columns are parsed by drizzle)
    const card = db.select().from(schema.cards).where(eq(schema.cards.id, 1)).get()
    expect(card).toBeDefined()
    expect(card!.content).toEqual({ front: 'Q', back: 'A' })
    expect(card!.tags).toEqual([])
    expect(card!.suspended).toBe(false)
    expect(card!.deckId).toBe(1)

    // update
    db.update(schema.cards).set({ suspended: true }).where(eq(schema.cards.id, 1)).run()
    expect(db.select().from(schema.cards).where(eq(schema.cards.id, 1)).get()!.suspended).toBe(true)
    db.update(schema.cards).set({ suspended: false }).where(eq(schema.cards.id, 1)).run()

    // drizzle transaction over the shim (drizzle calls client.transaction(...)[behavior])
    db.transaction(
      (tx) => {
        tx.insert(schema.xpEvents)
          .values({
            source: 'review',
            amount: 5,
            meta: { cardId: 1 },
            createdAt: now.toISOString(),
          })
          .run()
        tx.update(schema.streaks).set({ current: 3 }).where(eq(schema.streaks.id, 1)).run()
      },
      { behavior: 'immediate' },
    )
    expect(db.select().from(schema.streaks).get()!.current).toBe(3)
    expect(db.select().from(schema.xpEvents).all()).toHaveLength(1)

    // delete
    db.delete(schema.revlog).where(eq(schema.revlog.cardId, 1)).run()
    expect(db.select().from(schema.revlog).all()).toHaveLength(0)

    wa.close()
  })
})

// ─── (d) THE KEY PROOF: executeReview on the wasm drizzle instance ──────────

describe('(d) executeReview end-to-end over sqlite-wasm', () => {
  it('runs the atomic review pipeline unchanged (card+revlog+xp+streak+mastery)', async () => {
    const wa = createWasmDb('review')
    wa.pragma('foreign_keys = ON')
    wa.exec(MINIMAL_DDL)
    const db = createWasmLearningHubDb(wa)
    const now = new Date('2026-11-04T12:00:00.000Z')

    db.insert(schema.userSettings)
      .values({
        id: 'default',
        desiredRetention: 0.9,
        theme: 'system',
        updatedAt: now.toISOString(),
      })
      .run()
    db.insert(schema.decks).values({ id: 1, name: 'Deck', createdAt: now.toISOString() }).run()
    db.insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        type: 'qa',
        content: { front: 'What is SQLite?', back: 'Embedded database' },
        tags: [],
        skillId: 7, // exercises the Elo/mastery branch too
        due: now.toISOString(),
        state: 0,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        createdAt: now.toISOString(),
      })
      .run()

    const result = await executeReview(
      { cardId: 1, grade: 3, confidence: 1, timeMs: 4000, today: now },
      { db: db as unknown as LearningHubDB, now },
    )

    // Card advanced (same assertions as the canonical suite's T1)
    expect(result.card.state).toBeGreaterThan(0)
    expect(result.card.reps).toBe(1)
    expect(result.card.stability).toBeGreaterThan(0)
    expect(result.preReview.state).toBe(0)

    // Revlog row written (Anki pre-review state)
    expect(result.revlog.rating).toBe(3)
    expect(result.revlog.state).toBe(0)
    expect(result.revlog.confidence).toBe(1)
    expect(result.revlog.retrievability).toBeNull()

    // XP: 2 (review) + 5 (recall bonus) = 7
    expect(result.xpEarned).toBe(7)

    // Streak updated
    expect(result.streak.current).toBe(1)
    expect(result.streak.best).toBe(1)
    expect(result.streak.lastActiveDate).toBe('2026-11-04')

    // Elo/mastery branch (skillId = 7)
    expect(result.elo).not.toBeNull()
    expect(result.elo!.skillId).toBe(7)

    // Everything is durably inside the wasm file DB
    const savedCard = db.select().from(schema.cards).where(eq(schema.cards.id, 1)).get()
    expect(savedCard?.reps).toBe(1)
    expect(db.select().from(schema.revlog).where(eq(schema.revlog.cardId, 1)).all()).toHaveLength(1)
    const xp = db.select().from(schema.xpEvents).all()
    expect(xp).toHaveLength(1)
    expect(xp[0]!.amount).toBe(7)
    const masteryRows = db.select().from(schema.mastery).all()
    expect(masteryRows).toHaveLength(1)
    expect(masteryRows[0]!.skillId).toBe(7)
    expect(masteryRows[0]!.attempts).toBe(1)
    expect(masteryRows[0]!.correct).toBe(1)
    expect(db.select().from(schema.eloEvents).all()).toHaveLength(1)
    expect(db.select().from(schema.streaks).all()).toHaveLength(1)

    wa.close()
  })
})

// ─── (e) backup-style raw reads ─────────────────────────────────────────────

describe('(e) backup-style raw reads through the shim', () => {
  it('SELECT * over tables + sqlite_master inventory (backupAll pattern)', () => {
    const wa = createWasmDb('backup')
    wa.exec(MINIMAL_DDL)
    const db = createWasmLearningHubDb(wa)
    const now = new Date('2026-11-04T12:00:00.000Z')
    db.insert(schema.decks).values({ id: 1, name: 'B', createdAt: now.toISOString() }).run()
    db.insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        type: 'qa',
        content: { front: 'F', back: 'B' },
        tags: ['x'],
        due: now.toISOString(),
        createdAt: now.toISOString(),
      })
      .run()

    // Raw reads exactly like backup.ts: sqlite_master inventory + SELECT * dump
    const tables = (
      wa
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
        .all() as { name: string }[]
    ).map((r) => r.name)
    expect(tables).toContain('cards')
    expect(tables).toContain('revlog')
    expect(tables).toContain('streaks')
    expect(tables).toContain('xp_events')
    expect(tables).toContain('mastery')

    const cards = wa.prepare('SELECT * FROM "cards"').all() as Record<string, unknown>[]
    expect(cards).toHaveLength(1)
    expect(cards[0]!.deck_id).toBe(1)
    expect(cards[0]!.content).toBe(JSON.stringify({ front: 'F', back: 'B' })) // raw TEXT (round-trip bytes)

    // pragma foreign_key_list reads (backup restore-order helper)
    const fks = wa.pragma('foreign_key_list("cards")') as { table: string }[]
    expect(fks.some((fk) => fk.table === 'decks')).toBe(true)

    wa.close()
  })
})

// ─── (f) perf sanity ────────────────────────────────────────────────────────

describe('(f) 1000-row insert perf sanity', () => {
  it('inserts 1000 rows through the shim in < 2s', () => {
    const wa = createWasmDb('perf')
    wa.exec('CREATE TABLE perf (id INTEGER PRIMARY KEY, n INTEGER, s TEXT)')
    const insert = wa.prepare('INSERT INTO perf (n, s) VALUES (?, ?)')
    const tx = wa.transaction(() => {
      for (let i = 0; i < 1000; i++) insert.run(i, `row-${i}`)
    })
    const t0 = performance.now()
    tx.immediate()
    const elapsedMs = performance.now() - t0
    expect(wa.prepare('SELECT count(*) AS n FROM perf').get()).toEqual({ n: 1000 })
    expect(elapsedMs).toBeLessThan(2000)
    wa.close()
  })
})

describe('deserialized images grow without SQLITE_FULL (RESIZEABLE)', () => {
  it('writes far beyond the original image size', async () => {
    await initSqliteWasm()
    const file = path.join(os.tmpdir(), `lh-grow-${process.pid}.db`)
    const seed = new Database(file)
    seed.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, body TEXT)')
    seed.close()
    const db = createSqliteWasmDb(fs.readFileSync(file))
    try {
      const insert = db.prepare('INSERT INTO t (body) VALUES (?)')
      // ~2 MB into an image that started at a few KB (old fixed headroom: ~64 KB)
      for (let i = 0; i < 2000; i++) insert.run('x'.repeat(1000))
      expect((db.prepare('SELECT count(*) AS c FROM t').get() as { c: number }).c).toBe(2000)
    } finally {
      db.close()
      fs.rmSync(file, { force: true })
    }
  })
})
