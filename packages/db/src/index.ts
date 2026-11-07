/**
 * Learning HUB — database client (driver-agnostic).
 *
 * The SAME schema/service code runs on two interchangeable raw SQLite handles:
 *   - 'better-sqlite3' (Node default): native sync driver, in Next 15/16's
 *     serverExternalPackages allowlist (no bundler fights).
 *   - 'sqlite-wasm'    (browser/worker): the better-sqlite3-compatible shim in
 *     ./driver/sqlite-wasm.ts over @sqlite.org/sqlite-wasm (loaded lazily, so
 *     Node consumers never touch the wasm glue).
 *
 * Both handles satisfy the structural RawSqliteHandle contract and are wrapped
 * with the stock drizzle-orm/better-sqlite3 driver (identical drizzle code path
 * for both — it only duck-types prepare()/transaction()), then get
 * ensureSchema + ensureCascadeForeignKeys + ensureViews applied on open.
 *
 * Zero import side effects: the `db` export is a lazy Proxy that resolves the
 * active instance on first property access. In Node that auto-inits
 * better-sqlite3 synchronously (zero-config, same behavior as before); in a
 * browser/worker call `await initDb({ driver: 'sqlite-wasm', path | bytes })`
 * first. The active instance is cached on globalThis across dev hot-reloads.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type Database from 'better-sqlite3'
import * as schema from './schema'
import { resolveDbPath, resolveImagesDir } from './paths'
import { MIGRATIONS, runMigrations } from './migrations'
import { ensureSchemaIndexes, ensureSchemaTables } from './schema-ddl'

// ─── Driver-agnostic raw handle contract ────────────────────────────────────

/** One prepared statement (better-sqlite3 Statement shape; the wasm shim matches). */
export interface RawStatement {
  get(...p: unknown[]): unknown
  all(...p: unknown[]): unknown[]
  run(...p: unknown[]): { changes: number; lastInsertRowid: number | bigint }
}

/**
 * The transaction function both drivers return from RawSqliteHandle.transaction,
 * carrying better-sqlite3's BEGIN-behavior variants (native driver:
 * lib/methods/transaction.js; the wasm shim mirrors it verbatim). Use
 * `.immediate()` when the body writes: it takes the write lock at BEGIN
 * instead of upgrading from a read snapshot, so a concurrent writer's
 * mid-flight commit yields a clean wait (busy handler honored) instead of
 * SQLITE_BUSY "database is locked" on the stale-snapshot upgrade.
 */
export interface RawTransactionFn<T> {
  (): T
  /** Run the same body under `BEGIN IMMEDIATE` (write lock acquired up front). */
  immediate(): T
}

/**
 * Structural contract satisfied by BOTH the native better-sqlite3 Database and
 * the sqlite-wasm shim — exactly the surface ensureSchema,
 * ensureCascadeForeignKeys, ensureViews and backup.ts consume. `transaction`
 * returns better-sqlite3's behavior-variant function (its `opts` argument is
 * advisory — drizzle honors it; raw callers pick a variant on the returned
 * function, e.g. `.immediate()`).
 */
export interface RawSqliteHandle {
  prepare(sql: string): RawStatement
  exec(sql: string): void
  pragma(str: string): unknown
  transaction<T>(
    fn: () => T,
    opts?: { behavior?: 'deferred' | 'immediate' | 'exclusive' },
  ): RawTransactionFn<T>
  close(): void
}

/** Supported raw SQLite drivers. */
export type DbDriver = 'better-sqlite3' | 'sqlite-wasm'

/** Options for initDb. */
export interface DbInitOptions {
  driver?: DbDriver
  /**
   * File path (explicit paths short-circuit resolveDbPath). Omit for the Node
   * default. NOTE for driver 'sqlite-wasm': this wasm build's unix VFS is
   * in-memory (emscripten FS) — host file paths fail with SQLITE_CANTOPEN in
   * Node. Pass `bytes` instead and persist via sqlite3_js_db_export (browser
   * runtimes use OPFS VFSes for real files).
   */
  path?: string
  /** Raw SQLite file bytes — sqlite-wasm deserializes them into memory. */
  bytes?: Uint8Array
  /** Open read-only (skips file-writing pragmas like journal_mode = WAL). */
  readonly?: boolean
}

/**
 * The drizzle database type used across the app. Both drivers share the stock
 * drizzle-orm/better-sqlite3 code path; only `$client` (the raw handle) differs,
 * so it is typed as the driver-agnostic RawSqliteHandle.
 */
export type LearningHubDB = BetterSQLite3Database<typeof schema> & { $client: RawSqliteHandle }

// ─── Schema / view bootstrap (driver-agnostic) ──────────────────────────────

const CASCADE_FOREIGN_KEY_TABLES = [
  'courses',
  'units',
  'lessons',
  'highlights',
  'cards',
  'palace_items',
  'skill_edges',
  'mastery',
  'idea_links',
  'routine_steps',
]

/**
 * Ensure tables with foreign keys are configured with ON DELETE CASCADE in SQLite DDL.
 * SQLite cannot alter foreign key constraints directly; requires the table recreation pattern.
 * Note: habit_logs is intentionally omitted to preserve habit archival logic (ON DELETE NO ACTION).
 */
function ensureCascadeForeignKeys(sqlite: RawSqliteHandle, tableNames: Set<string>) {
  const hasSeqTable = tableNames.has('sqlite_sequence')

  for (const tableName of CASCADE_FOREIGN_KEY_TABLES) {
    if (!tableNames.has(tableName)) continue

    const tableInfo = sqlite
      .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) as { sql: string } | undefined
    if (!tableInfo || !tableInfo.sql) continue

    const originalSql = tableInfo.sql
    if (!originalSql.toUpperCase().includes('FOREIGN KEY')) continue
    if (originalSql.toUpperCase().includes('ON DELETE CASCADE')) continue

    // Query existing indexes for this table before dropping
    const existingIndexes = sqlite
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL",
      )
      .all(tableName) as { sql: string }[]

    // Capture autoincrement sequence if present
    const seqRow = hasSeqTable
      ? (sqlite.prepare('SELECT seq FROM sqlite_sequence WHERE name = ?').get(tableName) as
          { seq: number } | undefined)
      : undefined

    // Construct new table DDL with ON DELETE cascade
    const tableRegex = new RegExp(`CREATE\\s+TABLE\\s+[\`"]?${tableName}[\`"]?`, 'i')
    let newSql = originalSql.replace(tableRegex, `CREATE TABLE \`${tableName}_new\``)
    newSql = newSql.replace(/ON\s+DELETE\s+NO\s+ACTION/gi, 'ON DELETE cascade')

    const countBefore = (
      sqlite.prepare(`SELECT count(*) as c FROM \`${tableName}\``).get() as { c: number }
    ).c

    // FK enforcement must be off while the table is rebuilt, but it MUST be
    // restored even when the rebuild throws mid-way — otherwise the connection
    // silently runs without FK checks for its whole lifetime. Capture the
    // prior state and restore it in a finally block, then re-verify.
    const fkBefore =
      (sqlite.pragma('foreign_keys') as { foreign_keys: number }[])[0]?.foreign_keys === 1
    sqlite.pragma('foreign_keys = OFF')
    try {
      sqlite.transaction(() => {
        sqlite.exec(newSql)
        sqlite.exec(`INSERT INTO \`${tableName}_new\` SELECT * FROM \`${tableName}\`;`)
        sqlite.exec(`DROP TABLE \`${tableName}\`;`)
        sqlite.exec(`ALTER TABLE \`${tableName}_new\` RENAME TO \`${tableName}\`;`)
        if (seqRow && hasSeqTable) {
          sqlite
            .prepare('INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)')
            .run(tableName, seqRow.seq)
        }
        for (const idx of existingIndexes) {
          sqlite.exec(idx.sql)
        }
      })()
    } finally {
      sqlite.pragma(`foreign_keys = ${fkBefore ? 'ON' : 'OFF'}`)
    }
    const fkAfter = (sqlite.pragma('foreign_keys') as { foreign_keys: number }[])[0]?.foreign_keys
    if (fkAfter !== (fkBefore ? 1 : 0)) {
      throw new Error(
        `foreign_keys pragma failed to restore after rebuilding ${tableName} (expected ${fkBefore ? 1 : 0}, got ${fkAfter})`,
      )
    }

    const countAfter = (
      sqlite.prepare(`SELECT count(*) as c FROM \`${tableName}\``).get() as { c: number }
    ).c
    if (countBefore !== countAfter) {
      throw new Error(`Data loss in ${tableName}: before=${countBefore}, after=${countAfter}`)
    }
  }

  // Verify foreign key integrity
  const fkViolations = sqlite.pragma('foreign_key_check') as unknown[]
  if (fkViolations.length > 0) {
    throw new Error(`Foreign key check failed after migration: ${JSON.stringify(fkViolations)}`)
  }
}

/**
 * Bring any database — fresh or old, either driver — up to `schema.ts`:
 *   1. create missing tables (runtime DDL from the schema, ./schema-ddl)
 *   2. versioned migrations: add missing columns to existing tables (./migrations)
 *   3. create missing indexes (after 2 — new indexes may need new columns)
 *   4. one-time ON DELETE CASCADE table rebuilds
 * Every step is idempotent, so this runs on every open.
 */
function ensureSchema(sqlite: RawSqliteHandle) {
  ensureSchemaTables(sqlite)
  runMigrations(sqlite, MIGRATIONS)
  ensureSchemaIndexes(sqlite)
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as {
    name: string
  }[]
  // Idempotently migrate foreign keys to ON DELETE CASCADE
  ensureCascadeForeignKeys(sqlite, new Set(tables.map((t) => t.name)))
}

/**
 * Derived stat views (append-only data is never mutated).
 * True retention = successful real reviews (pre-review state Review/Relearning) / total.
 */
function ensureViews(sqlite: RawSqliteHandle) {
  sqlite.exec(`CREATE VIEW IF NOT EXISTS v_true_retention AS
    SELECT count(*) AS total,
           sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS retained,
           round(100.0 * sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) / count(*), 1) AS retention_pct
    FROM revlog
    WHERE state >= 2
      AND NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)`)
  sqlite.exec(`CREATE VIEW IF NOT EXISTS v_daily_reviews AS
    SELECT substr(reviewed_at, 1, 10) AS day, count(*) AS reviews,
           sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS correct,
           round(avg(time_ms)) AS avg_time_ms
    FROM revlog
    WHERE NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)
    GROUP BY substr(reviewed_at, 1, 10)`)
  sqlite.exec(`CREATE VIEW IF NOT EXISTS v_xp_daily AS
    SELECT substr(created_at, 1, 10) AS day, sum(amount) AS xp
    FROM xp_events GROUP BY substr(created_at, 1, 10)`)
}

// ─── Raw handle factories ───────────────────────────────────────────────────

type BetterSqlite3Ctor = typeof Database

let cachedBetterSqlite3: BetterSqlite3Ctor | undefined

/**
 * Synchronous, Node-only load of the native better-sqlite3 addon. Deliberately
 * bundler-opaque (runtime require instead of a static import) so importing
 * this module never pulls the native addon into browser/worker bundles.
 */
function loadBetterSqlite3(): BetterSqlite3Ctor {
  if (!cachedBetterSqlite3) {
    let req: ReturnType<typeof createRequire>
    try {
      req = createRequire(import.meta.url)
    } catch {
      req = createRequire(join(process.cwd(), 'package.json'))
    }
    try {
      cachedBetterSqlite3 = req('better-sqlite3') as BetterSqlite3Ctor
    } catch (err) {
      throw new Error(
        `better-sqlite3 is not available in this runtime (${err instanceof Error ? err.message : String(err)}). ` +
          'In a browser/worker runtime call await initDb({ driver: "sqlite-wasm", path | bytes }) instead.',
      )
    }
  }
  return cachedBetterSqlite3
}

/**
 * Apply the connection pragmas. Pass-through: on shared-nothing wasm VFSes
 * (e.g. opfs-sahpool) `journal_mode = WAL` silently degrades to DELETE — fine
 * for a single connection.
 */
function applyPragmas(raw: RawSqliteHandle, readonly: boolean) {
  if (!readonly) {
    raw.pragma('journal_mode = WAL') // the only file-writing pragma; skipped on readonly handles
  }
  raw.pragma('synchronous = NORMAL')
  raw.pragma('busy_timeout = 5000')
  raw.pragma('wal_autocheckpoint = 1000')
  raw.pragma('foreign_keys = ON')
}

function createBetterSqlite3Raw(opts: DbInitOptions): RawSqliteHandle {
  const DatabaseCtor = loadBetterSqlite3()
  const url = resolveDbPath(opts.path)
  const dir = dirname(url)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const sqlite = new DatabaseCtor(url, {
    timeout: 5000,
    // better-sqlite3 validates options strictly: omit `readonly` unless set.
    ...(opts.readonly === undefined ? {} : { readonly: opts.readonly }),
  })
  applyPragmas(sqlite, opts.readonly ?? false)
  return sqlite
}

async function createSqliteWasmRaw(opts: DbInitOptions): Promise<RawSqliteHandle> {
  // Dynamic import keeps the wasm glue (and its ~1MB module graph) out of
  // every Node bundle and out of the static import graph entirely.
  const { initSqliteWasm, createSqliteWasmDb } = await import('./driver/sqlite-wasm')
  await initSqliteWasm()
  const source: string | Uint8Array = opts.bytes ?? resolveDbPath(opts.path)
  const wasm = createSqliteWasmDb(source, { readonly: opts.readonly })
  applyPragmas(wasm, opts.readonly ?? false)
  return wasm
}

// ─── Active-instance registry (globalThis, hot-reload safe) ─────────────────

const g = globalThis as unknown as {
  /** Active drizzle instance (legacy key, kept for hot-reload continuity). */
  __learningHubDb?: LearningHubDB
  __learningHubDbRaw?: RawSqliteHandle
  __learningHubDbDriver?: DbDriver
  /** Options fingerprint of the active instance ('' for setDb-injected ones). */
  __learningHubDbKey?: string
  __learningHubDbInFlight?: Map<string, Promise<LearningHubDB>>
}

function activeState(): { instance: LearningHubDB; key: string } | undefined {
  if (!g.__learningHubDb) return undefined
  // Backfill metadata for instances adopted from a previous hot-reload pass.
  g.__learningHubDbDriver ??= 'better-sqlite3'
  g.__learningHubDbRaw ??= g.__learningHubDb.$client
  g.__learningHubDbKey ??= optionsKey({ driver: g.__learningHubDbDriver })
  return { instance: g.__learningHubDb, key: g.__learningHubDbKey }
}

/** Cheap content fingerprint for bytes-based cache keys (length + sampled FNV-1a). */
function fingerprintBytes(bytes: Uint8Array): string {
  let h = 0x811c9dc5
  const stride = Math.max(1, Math.floor(bytes.byteLength / 64))
  for (let i = 0; i < bytes.byteLength; i += stride) {
    h ^= bytes[i]
    h = Math.imul(h, 0x01000193)
  }
  return `${bytes.byteLength}:${(h >>> 0).toString(16)}`
}

function optionsKey(opts: DbInitOptions): string {
  return [
    opts.driver ?? 'better-sqlite3',
    opts.path ?? '',
    opts.readonly ? 'ro' : 'rw',
    opts.bytes ? fingerprintBytes(opts.bytes) : '',
  ].join('|')
}

/** Wrap a raw handle with drizzle (same driver/code path for both backends). */
function wrapWithDrizzle(raw: RawSqliteHandle): LearningHubDB {
  // drizzle-orm/better-sqlite3's construct() duck-types the client (prepare +
  // transaction); both drivers implement that surface. The cast is type-level
  // only — drizzle's parameter is declared as the native class.
  return drizzle(raw as unknown as Database.Database, { schema }) as unknown as LearningHubDB
}

function registerActive(
  driver: DbDriver,
  key: string,
  instance: LearningHubDB,
  raw: RawSqliteHandle,
): LearningHubDB {
  g.__learningHubDb = instance
  g.__learningHubDbRaw = raw
  g.__learningHubDbDriver = driver
  g.__learningHubDbKey = key
  return instance
}

/**
 * Node zero-config init (better-sqlite3 is fully synchronous): the same code
 * path initDb({ driver: 'better-sqlite3' }) takes, minus the await.
 */
function initBetterSqlite3Sync(opts: DbInitOptions = {}): LearningHubDB {
  const resolved: DbInitOptions = { ...opts, driver: 'better-sqlite3' }
  const key = optionsKey(resolved)
  const active = activeState()
  if (active && active.key === key) return active.instance
  const raw = createBetterSqlite3Raw(resolved)
  ensureSchema(raw)
  ensureViews(raw)
  return registerActive('better-sqlite3', key, wrapWithDrizzle(raw), raw)
}

/**
 * Initialize (or return the cached) database instance for the given options.
 * Idempotent: a second call with the same options returns the cached instance.
 * The result becomes the active instance used by getDb()/db.
 */
export async function initDb(opts: DbInitOptions = {}): Promise<LearningHubDB> {
  if (opts.path !== undefined && opts.bytes !== undefined) {
    throw new Error('initDb accepts either `path` or `bytes`, not both')
  }
  const driver: DbDriver = opts.driver ?? 'better-sqlite3'
  if (driver === 'better-sqlite3') return initBetterSqlite3Sync(opts)

  const key = optionsKey({ ...opts, driver })
  const active = activeState()
  if (active && active.key === key) return active.instance

  const inFlight = (g.__learningHubDbInFlight ??= new Map<string, Promise<LearningHubDB>>())
  const pending = inFlight.get(key)
  if (pending) return pending

  const creating = (async () => {
    const raw = await createSqliteWasmRaw(opts)
    ensureSchema(raw)
    ensureViews(raw)
    return registerActive('sqlite-wasm', key, wrapWithDrizzle(raw), raw)
  })()
  inFlight.set(key, creating)
  try {
    return await creating
  } finally {
    inFlight.delete(key)
  }
}

/**
 * The active drizzle instance. Node: lazily auto-inits better-sqlite3
 * synchronously (zero-config, every existing consumer keeps working).
 * Browser/worker: initDb({ driver: 'sqlite-wasm', ... }) must have resolved.
 */
export function getDb(): LearningHubDB {
  const active = activeState()
  if (active) return active.instance
  const inFlight = g.__learningHubDbInFlight
  if (inFlight && inFlight.size > 0) {
    throw new Error(
      'Database not initialized: an initDb() call is still in flight — await it before using the database',
    )
  }
  if (typeof process !== 'undefined' && process.versions?.node) {
    return initBetterSqlite3Sync()
  }
  throw new Error(
    'Database not initialized: call await initDb({ driver: "sqlite-wasm", path | bytes }) before using the database in non-Node runtimes',
  )
}

/** Detect which driver backs a raw handle (the wasm shim exposes the oo1 `handle`). */
function detectDriver(raw: RawSqliteHandle): DbDriver {
  return 'handle' in (raw as object) ? 'sqlite-wasm' : 'better-sqlite3'
}

/**
 * Replace the active instance (workers/tests): build a drizzle instance over
 * any RawSqliteHandle elsewhere and inject it as the getDb()/db target.
 */
export function setDb(instance: LearningHubDB): void {
  g.__learningHubDb = instance
  g.__learningHubDbRaw = (instance as { $client?: RawSqliteHandle }).$client
  g.__learningHubDbDriver = instance.$client ? detectDriver(instance.$client) : undefined
  g.__learningHubDbKey = '' // injected instances never match an initDb options key
}

/** Escape hatch to the ACTIVE raw connection (statements/pragmas/transactions). */
export function getRawDb(): RawSqliteHandle {
  return getDb().$client
}

/**
 * Shared drizzle client — a lazy Proxy over the active instance: resolution
 * (and, in Node, zero-config construction) happens on first property access,
 * so importing this module has no side effects.
 */
export const db: LearningHubDB = new Proxy({} as LearningHubDB, {
  get(_target, prop) {
    const target = getDb()
    const value = Reflect.get(target as object, prop, target)
    return typeof value === 'function'
      ? (value as (...args: unknown[]) => unknown).bind(target)
      : value
  },
  has(_target, prop) {
    return Reflect.has(getDb() as object, prop)
  },
  set(_target, prop, value) {
    ;(getDb() as unknown as Record<string | symbol, unknown>)[prop] = value
    return true
  },
  deleteProperty(_target, prop) {
    delete (getDb() as unknown as Record<string | symbol, unknown>)[prop as string]
    return true
  },
  ownKeys() {
    return Reflect.ownKeys(getDb() as object)
  },
  getOwnPropertyDescriptor(_target, prop) {
    const desc = Reflect.getOwnPropertyDescriptor(getDb() as object, prop)
    if (desc) desc.configurable = true // avoid Proxy invariant violations on the {} target
    return desc
  },
})

export { schema, resolveDbPath, resolveImagesDir }
export * from './schema'
export * from './transaction'
export * from './review-service'
export * from './backup'
export * from './sync'
export * from './cloud-sync'
export * from './starter-catalog'
export * from './repos'
