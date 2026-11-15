/**
 * Learning HUB — DE-RISK SPIKE: better-sqlite3-compatible shim over
 * `@sqlite.org/sqlite-wasm` (oo1 API). Goal: run the repo's sync drizzle code
 * (drizzle-orm/better-sqlite3) UNCHANGED on the wasm build of SQLite.
 *
 * The shim reproduces exactly the `Database` / `Statement` surface that the
 * repo and drizzle-orm/better-sqlite3@0.45 consume:
 *
 *   Database: prepare(sql) -> Statement, exec(sql), pragma(source, {simple?}),
 *             transaction(fn) -> fn with .default/.deferred/.immediate/.exclusive
 *             and .database, close(), open, memory, name, inTransaction.
 *   Statement: get(...params) -> row object | undefined, all(...params) -> rows[],
 *             run(...params) -> {changes, lastInsertRowid}, iterate(...params),
 *             raw(mode?) -> this (array-row mode), bind(), reset(), finalize(),
 *             sourceSql, database, readonly, busy.
 *
 * wasm oo1 mapping:
 *   - one oo1 Stmt per prepare(); rows are fetched with step() + Stmt.get()
 *     (array-fill / object-fill forms); every op reset()s before and after.
 *   - run(): changes  = sqlite3_changes64(db)   (BigInt in wasm -> Number)
 *            lastInsertRowid = sqlite3_last_insert_rowid(db) (BigInt -> Number)
 *     both converted to plain numbers when safe, matching better-sqlite3's
 *     default (non-safeIntegers) behavior; oversized values stay BigInt.
 *   - inTransaction = sqlite3_get_autocommit(db) === 0.
 *   - pragma(): executes `PRAGMA <source>` via oo1 selectObjects, which covers
 *     BOTH forms: write ("journal_mode = WAL") and read ("foreign_key_check"
 *     / "table_info(x)") — rows come back as plain objects.
 *   - transactions mirror better-sqlite3 lib/methods/transaction.js verbatim:
 *     BEGIN variants + COMMIT/ROLLBACK, savepoint fallback when already inside
 *     a transaction, and the `Transaction function cannot return a promise` guard.
 *
 * Binding parity: null/number/string/bigint bind as-is; Buffer IS a
 * Uint8Array and binds as a BLOB; boolean binds as 0/1. On read, BLOBs come
 * back as Uint8Array from wasm — converted to Buffer to match better-sqlite3.
 * INTEGER columns return Number when within the safe range, else BigInt
 * (same rule as both better-sqlite3 and the wasm build itself).
 *
 * VFS: never hardcoded. Caveats:
 *   - The default 'unix' VFS of this wasm build routes file I/O through
 *     emscripten's in-memory FS — paths never touch the host filesystem in
 *     Node (an absolute host path fails with SQLITE_CANTOPEN). Real DB images
 *     must be passed as `Uint8Array` bytes (sqlite3_deserialize); serialize
 *     back with `capi.sqlite3_js_db_export(db.handle.pointer)`. In the browser,
 *     pass `{ vfs: 'opfs-sahpool' }` for real persistence.
 *   - WAL is not supported on shared-nothing VFSes (opfs-sahpool), where
 *     `PRAGMA journal_mode = WAL` silently degrades to DELETE (see report).
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

// ─── Minimal structural types for the wasm oo1 surface we consume ───────────

/** oo1 Stmt (only the members this shim touches). */
interface WasmStmt {
  readonly parameterCount: number
  readonly columnCount: number
  bind(arg: unknown): WasmStmt
  step(): boolean
  reset(alsoClearBinds?: boolean): WasmStmt
  finalize(): number | undefined
  /** number → value at 0-based column; array → fills it; object → fills it by column name. */
  get(ndx: unknown): unknown
}

/** oo1 DB (only the members this shim touches). */
interface WasmDb {
  readonly filename: string
  readonly pointer: unknown
  prepare(sql: string): WasmStmt
  exec(sql: string): void
  selectObjects(sql: string): Record<string, unknown>[]
  close(): void
  isOpen(): boolean
}

/** The subset of the initialized sqlite3 module used here. */
interface Sqlite3Module {
  oo1: { DB: new (filename: string, flags?: string, vfs?: string | null) => WasmDb }
  capi: {
    sqlite3_changes64(pDb: unknown): bigint
    sqlite3_last_insert_rowid(pDb: unknown): bigint
    sqlite3_get_autocommit(pDb: unknown): number
    sqlite3_deserialize(
      pDb: unknown,
      zSchema: string,
      pData: unknown,
      szDb: number,
      szBuf: number,
      mFlags: number,
    ): number
    SQLITE_DESERIALIZE_READONLY?: number
  }
  wasm: { allocFromTypedArray(src: ArrayBufferView): number }
}

// ─── Public shim types ──────────────────────────────────────────────────────

/** Result of Statement.run() — identical shape to better-sqlite3's. */
export interface SqliteWasmRunResult {
  changes: number
  lastInsertRowid: number | bigint
}

/** better-sqlite3-compatible Statement over one oo1 Stmt. */
export interface SqliteWasmStatement {
  get(...params: unknown[]): unknown
  all(...params: unknown[]): Record<string, unknown>[]
  run(...params: unknown[]): SqliteWasmRunResult
  iterate(...params: unknown[]): IterableIterator<unknown>
  raw(mode?: boolean): SqliteWasmStatement
  bind(...params: unknown[]): SqliteWasmStatement
  reset(): SqliteWasmStatement
  finalize(): void
  readonly sourceSql: string
  readonly database: SqliteWasmDatabase
  readonly readonly: boolean
  readonly busy: boolean
}

/**
 * Transaction function with better-sqlite3's behavior variants attached.
 * Like better-sqlite3's `Transaction`, it is called standalone (`tx(1)`), so
 * it carries no `this` requirement; the caller's `this` is forwarded to `fn`.
 */
export interface SqliteWasmTransactionFn<ArgsT extends unknown[], ResultT> {
  (...args: ArgsT): ResultT
  default: this
  deferred: this
  immediate: this
  exclusive: this
  readonly database: SqliteWasmDatabase
}

/** better-sqlite3-compatible Database over the wasm oo1 DB. */
export interface SqliteWasmDatabase {
  prepare(sql: string): SqliteWasmStatement
  exec(sql: string): void
  pragma(source: string, options?: { simple?: boolean }): unknown
  transaction<ArgsT extends unknown[], ResultT>(
    fn: (...args: ArgsT) => ResultT,
  ): SqliteWasmTransactionFn<ArgsT, ResultT>
  close(): void
  readonly open: boolean
  readonly memory: boolean
  readonly name: string
  readonly inTransaction: boolean
  /** The raw oo1 handle (escape hatch, like $client for drizzle). */
  readonly handle: WasmDb
}

export interface SqliteWasmOpenOptions {
  /** VFS name — e.g. 'opfs-sahpool' in the browser. Default VFS in Node. */
  vfs?: string
  readonly?: boolean
}

// ─── wasm module bootstrap ──────────────────────────────────────────────────

let cachedSqlite3: Sqlite3Module | undefined

/** Initialize the wasm module once; further calls reuse the same instance. */
export async function initSqliteWasm(): Promise<Sqlite3Module> {
  if (!cachedSqlite3) {
    cachedSqlite3 = (await sqlite3InitModule()) as unknown as Sqlite3Module
  }
  return cachedSqlite3
}

/**
 * Sync factory — requires `initSqliteWasm()` to have resolved first.
 * (The wasm init is inherently async; everything after it is fully sync,
 * which is what lets sync better-sqlite3/drizzle code run unchanged.)
 */
export function createSqliteWasmDb(
  source: string | Uint8Array,
  options?: SqliteWasmOpenOptions,
): SqliteWasmDatabase {
  if (!cachedSqlite3) {
    throw new Error(
      'sqlite-wasm not initialized: await initSqliteWasm() before createSqliteWasmDb()',
    )
  }
  return openSqliteWasmDatabase(cachedSqlite3, source, options)
}

/**
 * Factory returned by `initSqliteWasm()` — a sync `createSqliteWasmDb`
 * bound to the initialized module, plus the module itself.
 */
export type SqliteWasmFactory = {
  (source: string | Uint8Array, options?: SqliteWasmOpenOptions): SqliteWasmDatabase
  readonly sqlite3: Sqlite3Module
}

/** One-shot helper: init + open. */
export async function createSqliteWasmDbAsync(
  source: string | Uint8Array,
  options?: SqliteWasmOpenOptions,
): Promise<SqliteWasmDatabase> {
  const sqlite3 = await initSqliteWasm()
  return openSqliteWasmDatabase(sqlite3, source, options)
}

/** Build the async factory form (`initSqliteWasm` returns this shape too). */
export async function initSqliteWasmFactory(): Promise<SqliteWasmFactory> {
  const sqlite3 = await initSqliteWasm()
  const factory = ((source: string | Uint8Array, options?: SqliteWasmOpenOptions) =>
    openSqliteWasmDatabase(sqlite3, source, options)) as SqliteWasmFactory
  Object.defineProperty(factory, 'sqlite3', { value: sqlite3, enumerable: true })
  return factory
}

function openSqliteWasmDatabase(
  sqlite3: Sqlite3Module,
  source: string | Uint8Array,
  options?: SqliteWasmOpenOptions,
): SqliteWasmDatabase {
  let db: WasmDb
  if (typeof source === 'string') {
    // If a nested path is passed in Node/WASM, ensure its parent directory exists
    // in Emscripten's virtual filesystem (MEMFS) if the FS API is exposed.
    const wasmFs = (sqlite3 as unknown as { wasm?: { fs?: { mkdirTree?: (d: string) => void } }; fs?: { mkdirTree?: (d: string) => void } })
    const fsApi = wasmFs.wasm?.fs ?? wasmFs.fs
    if (fsApi && typeof fsApi.mkdirTree === 'function' && source.includes('/') && !source.startsWith(':memory:')) {
      const dir = source.slice(0, source.lastIndexOf('/'))
      if (dir && dir !== '/') {
        try {
          fsApi.mkdirTree(dir)
        } catch {
          /* ignore if directory already exists */
        }
      }
    }
    // flags 'c' = create-if-missing + readwrite (better-sqlite3's default mode)
    db = new sqlite3.oo1.DB(source, options?.readonly ? 'r' : 'c', options?.vfs ?? null)
  } else {
    // Byte source (better-sqlite3's `new Database(buffer)`): deserialize into memory.
    const bytes = source instanceof Uint8Array ? source : new Uint8Array(source)
    const mem = new sqlite3.oo1.DB(':memory:', 'c', options?.vfs ?? null)
    if (bytes.byteLength > 0) {
      // RESIZEABLE lets SQLite grow the in-memory image as it writes (any
      // fixed headroom eventually fails with SQLITE_FULL — e.g. when opening
      // creates indexes or a restore adds rows). It requires the buffer to come
      // from sqlite3_malloc, which allocFromTypedArray uses; FREEONCLOSE hands
      // ownership to SQLite so the memory is released with the connection.
      const FREEONCLOSE = 1
      const RESIZEABLE = 2
      // Plain Uint8Array copy: the allocator rejects subclasses such as Node Buffer.
      const p = sqlite3.wasm.allocFromTypedArray(new Uint8Array(bytes))
      const rc = sqlite3.capi.sqlite3_deserialize(
        mem.pointer,
        'main',
        p,
        bytes.byteLength,
        bytes.byteLength,
        FREEONCLOSE | RESIZEABLE,
      )
      if (rc !== 0) {
        mem.close()
        throw new Error(`sqlite3_deserialize failed with rc=${rc}`)
      }
    }
    // byteLength === 0: an empty SQLite image — the fresh :memory: DB already
    // IS that (deserialize of a zero-size image leaves no usable free pages).
    db = mem
  }
  return new SqliteWasmDb(sqlite3, db)
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** BigInt -> Number when safe (better-sqlite3 default), else keep BigInt. */
function toJsInt(v: bigint | number): number | bigint {
  if (typeof v !== 'bigint') return v
  return v >= BigInt(Number.MIN_SAFE_INTEGER) && v <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(v)
    : v
}

/** BLOB reads come back as Uint8Array — better-sqlite3 returns Buffer. */
function toBufferLike(v: unknown): unknown {
  if (v instanceof Uint8Array && !Buffer.isBuffer(v)) {
    return Buffer.from(v.buffer, v.byteOffset, v.byteLength)
  }
  return v
}

const SAVEPOINT_NAME = '_bs3_shim_sp'

function isPromiseLike(v: unknown): boolean {
  return typeof v === 'object' && v !== null && typeof (v as { then?: unknown }).then === 'function'
}

// ─── Statement ──────────────────────────────────────────────────────────────

class SqliteWasmStmt implements SqliteWasmStatement {
  #raw = false
  readonly #sqlite3: Sqlite3Module
  readonly #owner: SqliteWasmDb
  readonly #stmt: WasmStmt
  readonly #sql: string

  constructor(sqlite3: Sqlite3Module, owner: SqliteWasmDb, stmt: WasmStmt, sql: string) {
    this.#sqlite3 = sqlite3
    this.#owner = owner
    this.#stmt = stmt
    this.#sql = sql
  }

  get sourceSql(): string {
    return this.#sql
  }
  get database(): SqliteWasmDatabase {
    return this.#owner
  }
  get readonly(): boolean {
    return !this.#sql || /^\s*(select|pragma|with)\b/i.test(this.#sql)
  }
  get busy(): boolean {
    return false // single-threaded sync stepping; never mid-iteration outside iterate()
  }

  /** better-sqlite3 raw(mode): arrays instead of objects; returns the statement. */
  raw(mode: boolean = true): this {
    this.#raw = !!mode
    return this
  }

  #bind(params: unknown[]): void {
    if (params.length === 0) return
    const first = params[0]
    const isNamedObject =
      params.length === 1 &&
      first !== null &&
      typeof first === 'object' &&
      !Array.isArray(first) &&
      !(first instanceof Uint8Array)
    if (isNamedObject) this.#stmt.bind(first)
    else this.#stmt.bind(params)
  }

  #readRow(): Record<string, unknown> | unknown[] {
    if (this.#raw) {
      const arr: unknown[] = []
      this.#stmt.get(arr)
      for (let i = 0; i < arr.length; i++) arr[i] = toBufferLike(arr[i])
      return arr
    }
    const obj: Record<string, unknown> = {}
    this.#stmt.get(obj)
    for (const k in obj) obj[k] = toBufferLike(obj[k])
    return obj
  }

  #resetAndBind(params: unknown[]): void {
    if (!this.#owner.isOpen()) throw new Error('The database connection is not open')
    this.#stmt.reset()
    this.#bind(params)
  }

  get(...params: unknown[]): unknown {
    this.#resetAndBind(params)
    try {
      if (this.#stmt.columnCount === 0) {
        // Non-SELECT statement: execute it (better-sqlite3 get() returns undefined).
        this.#stmt.step()
        return undefined
      }
      return this.#stmt.step() ? this.#readRow() : undefined
    } finally {
      this.#stmt.reset()
    }
  }

  all(...params: unknown[]): Record<string, unknown>[] {
    this.#resetAndBind(params)
    const rows: Record<string, unknown>[] = []
    try {
      if (this.#stmt.columnCount === 0) {
        this.#stmt.step() // execute non-SELECT statements like better-sqlite3 all() does
        return rows
      }
      while (this.#stmt.step()) rows.push(this.#readRow() as Record<string, unknown>)
    } finally {
      this.#stmt.reset()
    }
    return rows
  }

  run(...params: unknown[]): SqliteWasmRunResult {
    this.#resetAndBind(params)
    try {
      this.#stmt.step()
    } finally {
      this.#stmt.reset()
    }
    return {
      changes: toJsInt(this.#sqlite3.capi.sqlite3_changes64(this.#owner.pointer())) as number,
      lastInsertRowid: toJsInt(this.#sqlite3.capi.sqlite3_last_insert_rowid(this.#owner.pointer())),
    }
  }

  *iterate(...params: unknown[]): IterableIterator<unknown> {
    this.#resetAndBind(params)
    try {
      while (this.#stmt.step()) yield this.#readRow()
    } finally {
      this.#stmt.reset()
    }
  }

  bind(...params: unknown[]): this {
    this.#resetAndBind(params)
    return this
  }

  reset(): this {
    this.#stmt.reset()
    return this
  }

  finalize(): void {
    this.#owner._forget(this)
    this.#stmt.finalize()
  }
}

// ─── Database ───────────────────────────────────────────────────────────────

class SqliteWasmDb implements SqliteWasmDatabase {
  readonly #sqlite3: Sqlite3Module
  readonly #db: WasmDb
  readonly #stmts = new Set<SqliteWasmStmt>()
  #open = true

  constructor(sqlite3: Sqlite3Module, db: WasmDb) {
    this.#sqlite3 = sqlite3
    this.#db = db
  }

  get open(): boolean {
    return this.#open
  }
  get memory(): boolean {
    const f = this.#db.filename
    return f === '' || f === ':memory:'
  }
  get name(): string {
    return this.#db.filename
  }
  get inTransaction(): boolean {
    return this.#open && this.#sqlite3.capi.sqlite3_get_autocommit(this.#db.pointer) === 0
  }
  get handle(): WasmDb {
    return this.#db
  }

  prepare(sql: string): SqliteWasmStatement {
    if (!this.#open) throw new TypeError('The database connection is not open')
    const stmt = new SqliteWasmStmt(this.#sqlite3, this, this.#db.prepare(sql), sql)
    this.#stmts.add(stmt)
    return stmt
  }

  /** Raw oo1 handle pointer (for capi calls: changes, last_insert_rowid...). */
  pointer(): unknown {
    return this.#db.pointer
  }

  isOpen(): boolean {
    return this.#open && this.#db.isOpen()
  }

  /** Release a statement from the live set (called by Statement.finalize()). */
  _forget(stmt: SqliteWasmStmt): void {
    this.#stmts.delete(stmt)
  }

  exec(sql: string): void {
    if (!this.#open) throw new TypeError('The database connection is not open')
    this.#db.exec(sql)
  }

  /**
   * Read AND write pragmas in one path: `PRAGMA <source>` returns rows for
   * pragmas that produce output (read form AND assignment form) and [] for
   * flag-style pragmas — exactly the rows better-sqlite3's pragma() returns.
   */
  pragma(source: string, options?: { simple?: boolean }): unknown {
    if (typeof source !== 'string') throw new TypeError('Expected first argument to be a string')
    const rows = this.#db.selectObjects(`PRAGMA ${source}`)
    if (options?.simple) {
      const first = rows[0]
      if (first === undefined) return undefined
      return Object.values(first)[0]
    }
    return rows
  }

  /**
   * better-sqlite3 transaction(fn): returns a wrapped fn that BEGINs (deferred
   * by default; .deferred/.immediate/.exclusive variants), COMMITs on success,
   * ROLLBACKs on throw, uses a SAVEPOINT when already inside a transaction,
   * and rejects promise-returning callbacks.
   */
  transaction<ArgsT extends unknown[], ResultT>(
    fn: (...args: ArgsT) => ResultT,
  ): SqliteWasmTransactionFn<ArgsT, ResultT> {
    if (typeof fn !== 'function') throw new TypeError('Expected first argument to be a function')
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- mirrors better-sqlite3's own transaction.js shape
    const db = this

    const makeTx = (begin: string) =>
      function sqliteTransaction(this: unknown, ...args: ArgsT): ResultT {
        if (!db.open) throw new TypeError('The database connection is not open')
        if (db.inTransaction) {
          // Nested: savepoint fallback (mirrors better-sqlite3).
          db.exec(`SAVEPOINT ${SAVEPOINT_NAME}`)
          try {
            const result = fn.apply(this, args)
            if (result && isPromiseLike(result)) {
              throw new TypeError('Transaction function cannot return a promise')
            }
            db.exec(`RELEASE ${SAVEPOINT_NAME}`)
            return result
          } catch (ex) {
            if (db.inTransaction) db.exec(`ROLLBACK TO ${SAVEPOINT_NAME}`)
            if (db.inTransaction) db.exec(`RELEASE ${SAVEPOINT_NAME}`)
            throw ex
          }
        }
        db.exec(begin)
        try {
          const result = fn.apply(this, args)
          if (result && isPromiseLike(result)) {
            throw new TypeError('Transaction function cannot return a promise')
          }
          db.exec('COMMIT')
          return result
        } catch (ex) {
          if (db.inTransaction) db.exec('ROLLBACK')
          throw ex
        }
      }

    const variants = {
      default: makeTx('BEGIN'),
      deferred: makeTx('BEGIN DEFERRED'),
      immediate: makeTx('BEGIN IMMEDIATE'),
      exclusive: makeTx('BEGIN EXCLUSIVE'),
    }
    const props: PropertyDescriptorMap = {
      default: { value: variants.default },
      deferred: { value: variants.deferred },
      immediate: { value: variants.immediate },
      exclusive: { value: variants.exclusive },
      database: { value: db, enumerable: true },
    }
    for (const variant of Object.values(variants)) {
      Object.defineProperties(variant, props)
    }
    return variants.default as unknown as SqliteWasmTransactionFn<ArgsT, ResultT>
  }

  close(): void {
    if (!this.#open) throw new TypeError('The database connection is not open')
    for (const stmt of this.#stmts) {
      try {
        stmt.finalize()
      } catch {
        /* statement may already be finalized */
      }
    }
    this.#stmts.clear()
    this.#db.close()
    this.#open = false
  }
}
