/**
 * Dual-driver tests: the SAME src code must run on better-sqlite3 (Node) and
 * the proven sqlite-wasm shim through the new driver-agnostic entry points.
 *
 *   (a) initDb({driver:'better-sqlite3', path})  → full schema + executeReview round-trip
 *   (b) initDb({driver:'sqlite-wasm', bytes})    → 45-table schema + views, executeReview
 *       round-trip, then backupAll() → restoreAll() through the wasm driver
 *   (c) `db` Proxy transparency: plain import → initDb → db.select()/insert/transaction
 *   (d) setDb/getDb round-trip incl. driver switching
 *   (e) zero-config Node auto-init: touching `db` with no instance works (back-compat)
 *
 * Import order matters by design: the module is imported FIRST (zero side
 * effects), then initDb runs, then `db` is touched.
 *
 * WHY bytes (not a file path) for the wasm legs: this @sqlite.org/sqlite-wasm
 * build routes its unix VFS through emscripten's in-memory FS — host file
 * paths never touch disk in Node (SQLITE_CANTOPEN on absolute paths), so the
 * wasm image carrier is sqlite3_deserialize over real file bytes, exactly the
 * flow the worker stage will use (host reads the DB file → hands over bytes).
 */
import { describe, it, expect, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { eq, sql } from 'drizzle-orm'
import Database from 'better-sqlite3'
import * as schema from '../src/schema'
import { schemaTableSql } from '../src/schema-ddl'
import * as dbpkg from '../src/index' // plain import — must have NO side effects
import { executeReview } from '../src/review-service'

const g = globalThis as unknown as Record<string, unknown>

let tmpDir: string
const opened: { close(): void }[] = []

try {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lhub-dual-driver-'))
} catch {
  tmpDir = path.join(os.tmpdir(), `lhub-dual-driver-${process.pid}`)
  fs.mkdirSync(tmpDir, { recursive: true })
}

afterAll(() => {
  for (const handle of opened) {
    try {
      handle.close()
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

/** Full schema DDL, generated from schema.ts (CREATE TABLE IF NOT EXISTS — idempotent). */
function fullTableDdl(): string[] {
  return schemaTableSql()
}

/** Full-schema SQLite image bytes, created with the native driver (initDb migrates, never creates tables). */
function createSchemaBytes(label: string): Uint8Array {
  const file = path.join(tmpDir, `${label}-${process.pid}.db`)
  const pre = new Database(file)
  for (const ddl of fullTableDdl()) pre.exec(ddl)
  pre.close()
  return fs.readFileSync(file)
}

function seedReviewFixtures(db: dbpkg.LearningHubDB, now: Date): void {
  db.insert(schema.userSettings)
    .values({ id: 'default', desiredRetention: 0.9, theme: 'system', updatedAt: now.toISOString() })
    .run()
  db.insert(schema.decks)
    .values({ id: 1, name: 'Dual-driver Deck', createdAt: now.toISOString() })
    .run()
  db.insert(schema.skills)
    .values({ id: 7, name: 'Dual-driver Skill', createdAt: now.toISOString() })
    .run()
  db.insert(schema.cards)
    .values({
      id: 1,
      deckId: 1,
      type: 'basic',
      content: { basic: { front: 'What is SQLite?', back: 'Embedded database' } },
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
}

const NOW = new Date('2026-11-04T12:00:00.000Z')

// ─── (a) better-sqlite3 via initDb ──────────────────────────────────────────

describe('(a) initDb({ driver: "better-sqlite3" })', () => {
  it('bootstraps the full schema and runs the executeReview round-trip', async () => {
    const file = path.join(tmpDir, `dual-bs-${process.pid}.db`)
    const pre = new Database(file)
    for (const ddl of fullTableDdl()) pre.exec(ddl)
    pre.close()

    const instance = await dbpkg.initDb({ driver: 'better-sqlite3', path: file })
    opened.push(instance.$client)

    // initDb stores the active instance; getDb/getRawDb agree
    expect(dbpkg.getDb()).toBe(instance)
    expect(dbpkg.getRawDb()).toBe(instance.$client)
    // native handle: NOT the wasm shim (no oo1 `handle` escape hatch)
    expect('handle' in (dbpkg.getRawDb() as object)).toBe(false)

    seedReviewFixtures(instance, NOW)
    const result = await executeReview({
      cardId: 1,
      grade: 3,
      confidence: 1,
      timeMs: 4000,
      today: NOW,
    })
    expect(result.card.state).toBeGreaterThan(0)
    expect(result.card.reps).toBe(1)
    expect(result.preReview.state).toBe(0)
    expect(result.revlog.rating).toBe(3)
    expect(result.xpEarned).toBe(7)
    expect(result.streak.current).toBe(1)
    expect(result.elo?.skillId).toBe(7)
    // durably written through the temp-file connection
    expect(instance.select().from(schema.revlog).all()).toHaveLength(1)

    // idempotent: same options return the cached instance
    expect(await dbpkg.initDb({ driver: 'better-sqlite3', path: file })).toBe(instance)
  })
})

// ─── (b) sqlite-wasm via initDb ─────────────────────────────────────────────

describe('(b) initDb({ driver: "sqlite-wasm" })', () => {
  it('deserializes a full-schema image, runs review round-trip + backup/restore on the wasm driver', async () => {
    const bytes = createSchemaBytes('dual-wasm')
    const instance = await dbpkg.initDb({ driver: 'sqlite-wasm', bytes })
    opened.push(instance.$client)
    expect(dbpkg.getDb()).toBe(instance)
    expect(dbpkg.getRawDb()).toBe(instance.$client)

    // every table of the real schema is present in the deserialized image
    const raw = dbpkg.getRawDb()
    const tables = (
      raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as {
        name: string
      }[]
    ).map((r) => r.name)
    expect(tables.length).toBeGreaterThanOrEqual(45)
    for (const name of [
      'cards',
      'revlog',
      'streaks',
      'xp_events',
      'mastery',
      'decks',
      'user_settings',
      'images',
    ]) {
      expect(tables).toContain(name)
    }
    // ensureViews ran
    const views = (
      raw.prepare("SELECT name FROM sqlite_master WHERE type='view'").all() as { name: string }[]
    ).map((r) => r.name)
    expect(views).toEqual(
      expect.arrayContaining(['v_true_retention', 'v_daily_reviews', 'v_xp_daily']),
    )

    // review round-trip on the wasm drizzle instance
    seedReviewFixtures(instance, NOW)
    const result = await executeReview({
      cardId: 1,
      grade: 3,
      confidence: 1,
      timeMs: 4000,
      today: NOW,
    })
    expect(result.card.state).toBeGreaterThan(0)
    expect(result.card.reps).toBe(1)
    expect(result.revlog.rating).toBe(3)
    expect(result.xpEarned).toBe(7)
    expect(result.streak.current).toBe(1)

    // backupAll → restoreAll round-trip THROUGH the wasm driver (raw-handle based)
    const backup = dbpkg.backupAll()
    expect(Object.keys(backup.tables).length).toBeGreaterThanOrEqual(45)
    const restored = dbpkg.restoreAll(backup)
    expect(restored.tables).toBe(Object.keys(backup.tables).length)
    expect(restored.rows).toBe(Object.values(backup.tables).reduce((n, rows) => n + rows.length, 0))
    expect(instance.select().from(schema.cards).where(eq(schema.cards.id, 1)).get()?.reps).toBe(1)
    expect(instance.select().from(schema.revlog).all()).toHaveLength(1)
  })

  it('boots from an EMPTY image: all 45-table DDL + views apply through the wasm handle', async () => {
    const instance = await dbpkg.initDb({ driver: 'sqlite-wasm', bytes: new Uint8Array(0) })
    opened.push(instance.$client)

    // initDb ran ensureSchema (no tables yet → no-ops) + ensureViews (valid on
    // missing tables); the full DDL then applies through the raw handle.
    const raw = dbpkg.getRawDb()
    for (const ddl of fullTableDdl()) raw.exec(ddl)
    const tables = (
      raw
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
        .all() as {
        name: string
      }[]
    ).map((r) => r.name)
    expect(tables.length).toBeGreaterThanOrEqual(45)

    // fully usable afterwards, including writes (needs deserialize headroom)
    seedReviewFixtures(instance, NOW)
    const result = await executeReview({
      cardId: 1,
      grade: 3,
      confidence: 1,
      timeMs: 4000,
      today: NOW,
    })
    expect(result.card.reps).toBe(1)
    expect(instance.select().from(schema.revlog).all()).toHaveLength(1)
  })
})

// ─── (c) `db` Proxy transparency over the wasm driver ───────────────────────

describe('(c) `db` lazy Proxy transparency', () => {
  it('works after a plain import + initDb: select/insert/transaction all forward', async () => {
    const bytes = createSchemaBytes('dual-proxy')
    await dbpkg.initDb({ driver: 'sqlite-wasm', bytes })

    // the module was imported at the top with zero side effects; touching `db`
    // now resolves the ACTIVE (wasm) instance
    expect('select' in dbpkg.db).toBe(true)
    expect('handle' in (dbpkg.getRawDb() as object)).toBe(true) // wasm shim is active

    dbpkg.db
      .insert(schema.userSettings)
      .values({
        id: 'default',
        desiredRetention: 0.9,
        theme: 'system',
        updatedAt: NOW.toISOString(),
      })
      .run()
    dbpkg.db
      .insert(schema.decks)
      .values({ id: 1, name: 'Proxy Deck', createdAt: NOW.toISOString() })
      .run()
    dbpkg.db
      .insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        type: 'basic',
        content: { basic: { front: 'Q', back: 'A' } },
        tags: [],
        due: NOW.toISOString(),
        createdAt: NOW.toISOString(),
      })
      .run()
    expect(dbpkg.db.select().from(schema.decks).all()).toHaveLength(1)
    expect(dbpkg.db.select().from(schema.cards).all()).toHaveLength(1)

    dbpkg.db.transaction(
      (tx) => {
        tx.insert(schema.xpEvents)
          .values({
            source: 'review',
            amount: 3,
            meta: { cardId: 1 },
            createdAt: NOW.toISOString(),
          })
          .run()
      },
      { behavior: 'immediate' },
    )
    expect(dbpkg.db.select().from(schema.xpEvents).all()).toHaveLength(1)
  })
})

// ─── (d) setDb / getDb round-trip ───────────────────────────────────────────

describe('(d) setDb/getDb', () => {
  it('round-trips injected instances across drivers', async () => {
    const wasmInstance = dbpkg.getDb() // active from (c)

    const bsFile = path.join(tmpDir, `dual-bs-inject-${process.pid}.db`)
    const pre = new Database(bsFile)
    for (const ddl of fullTableDdl()) pre.exec(ddl)
    pre.close()
    const bsInstance = await dbpkg.initDb({ driver: 'better-sqlite3', path: bsFile })
    opened.push(bsInstance.$client)
    expect(dbpkg.getDb()).toBe(bsInstance) // initDb switched the active instance

    dbpkg.setDb(wasmInstance)
    expect(dbpkg.getDb()).toBe(wasmInstance)
    dbpkg.setDb(bsInstance)
    expect(dbpkg.getDb()).toBe(bsInstance)
  })
})

// ─── (e) zero-config Node auto-init (back-compat) ───────────────────────────

describe('(e) zero-config auto-init', () => {
  it('touching `db` in Node auto-inits better-sqlite3 without any explicit initDb', () => {
    // simulate a fresh consumer process: wipe the active-instance registry
    for (const key of [
      '__learningHubDb',
      '__learningHubDbRaw',
      '__learningHubDbDriver',
      '__learningHubDbKey',
    ]) {
      delete g[key]
    }
    const rows = dbpkg.db
      .select({ n: sql<number>`count(*)` })
      .from(schema.decks)
      .all()
    expect(Number(rows[0]?.n)).toBeGreaterThanOrEqual(0)
    // the auto-initialized active handle is the native driver, not the shim
    expect('handle' in (dbpkg.getRawDb() as object)).toBe(false)
    opened.push(dbpkg.getRawDb())
  })
})
