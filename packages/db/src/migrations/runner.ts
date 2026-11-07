/**
 * Versioned, idempotent schema migrations — one runner for both drivers
 * (better-sqlite3 on Node, sqlite-wasm in the native apps' webview worker).
 *
 * ## Why migrations look like this
 *
 * Tables are CREATED from `schema.ts` by two different tools:
 * - Node: `drizzle-kit push` (CLI), which already includes every column.
 * - Webview: `apps/web/src/hub/schema-ddl.ts` (runtime DDL from the same schema).
 *
 * So a fresh database already has the newest columns, while an existing one
 * does not. Every migration step must therefore be *idempotent* — "add this
 * column IF it is missing", "create this index IF NOT EXISTS" — and the runner
 * records each applied migration in `schema_migrations` so steps run once per
 * database, in order, inside a transaction.
 *
 * ## The one rule
 *
 * `schema.ts` is the source of truth. A migration only brings EXISTING
 * databases up to what `schema.ts` already declares — never invent a column
 * here that the schema does not have.
 */
import type { RawSqliteHandle } from '../index'

/** Helpers handed to every migration step (all idempotent). */
export interface MigrationContext {
  /** The raw connection, for anything the helpers do not cover. */
  raw: RawSqliteHandle
  /** True when the table exists. */
  hasTable(table: string): boolean
  /** True when the column exists on the table (false when the table is missing). */
  hasColumn(table: string, column: string): boolean
  /**
   * `ALTER TABLE … ADD COLUMN` unless the column (or the whole table) is
   * missing/present. `definition` is everything after the column name,
   * e.g. `"TEXT"` or `"INTEGER NOT NULL DEFAULT 0"`. Returns true when added.
   */
  addColumn(table: string, column: string, definition: string): boolean
  /** `CREATE [UNIQUE] INDEX IF NOT EXISTS`, skipped when the table is missing. */
  createIndex(name: string, table: string, columns: string[], opts?: { unique?: boolean }): void
}

/** One versioned migration. `id` is a zero-padded, strictly increasing number. */
export interface Migration {
  id: number
  /** Short kebab-case name, e.g. 'curriculum-slugs'. */
  name: string
  up(ctx: MigrationContext): void
}

/** Result of a run — which migrations were applied just now. */
export interface MigrationReport {
  applied: { id: number; name: string }[]
  /** Highest migration id now recorded in the database. */
  version: number
}

const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`

/** Build the idempotent helper set over one raw connection. */
export function createMigrationContext(raw: RawSqliteHandle): MigrationContext {
  const hasTable = (table: string) =>
    raw.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !==
    undefined

  const hasColumn = (table: string, column: string) => {
    if (!hasTable(table)) return false
    const cols = raw.pragma(`table_info(${quote(table)})`) as { name: string }[]
    return cols.some((c) => c.name === column)
  }

  return {
    raw,
    hasTable,
    hasColumn,
    addColumn(table, column, definition) {
      if (!hasTable(table) || hasColumn(table, column)) return false
      try {
        raw.exec(`ALTER TABLE ${quote(table)} ADD COLUMN ${quote(column)} ${definition};`)
        return true
      } catch (err) {
        // Several processes may race the same one-time migration on a shared
        // file: the loser re-checks and carries on if the winner added it.
        if (hasColumn(table, column)) return false
        throw err
      }
    },
    createIndex(name, table, columns, opts) {
      if (!hasTable(table)) return
      const unique = opts?.unique ? 'UNIQUE ' : ''
      raw.exec(
        `CREATE ${unique}INDEX IF NOT EXISTS ${quote(name)} ON ${quote(table)}(${columns.map(quote).join(', ')});`,
      )
    },
  }
}

/** Fail fast on a malformed registry (duplicate or unordered ids). */
export function assertMigrationOrder(migrations: readonly Migration[]): void {
  for (let i = 1; i < migrations.length; i++) {
    if (migrations[i]!.id <= migrations[i - 1]!.id) {
      throw new Error(
        `migrations must have strictly increasing ids: ${migrations[i - 1]!.id} then ${migrations[i]!.id}`,
      )
    }
  }
}

/**
 * Apply every migration whose id is not yet recorded, in id order. Each
 * migration runs in its own `BEGIN IMMEDIATE` transaction together with its
 * bookkeeping row, so a crash never leaves a half-applied step recorded — and
 * concurrent openers of the same database file (test workers, dev server +
 * CLI) serialize on the write lock instead of racing: the loser waits at BEGIN
 * (busy handler honored), then re-checks and skips the step the winner just
 * recorded. A deferred BEGIN would do the opposite — read a snapshot, then
 * fail its first write with SQLITE_BUSY once the winner commits mid-flight.
 */
export function runMigrations(
  raw: RawSqliteHandle,
  migrations: readonly Migration[],
): MigrationReport {
  assertMigrationOrder(migrations)
  raw.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  );`)

  const done = new Set(
    (raw.prepare('SELECT id FROM schema_migrations').all() as { id: number }[]).map((r) => r.id),
  )
  const ctx = createMigrationContext(raw)
  const recorded = raw.prepare('SELECT 1 FROM schema_migrations WHERE id = ?')
  const record = raw.prepare(
    'INSERT OR IGNORE INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)',
  )
  const applied: MigrationReport['applied'] = []

  for (const migration of migrations) {
    if (done.has(migration.id)) continue
    const appliedNow = raw
      .transaction((): boolean => {
        // Re-check under the write lock: another runner may have applied this
        // exact step while this one waited for it (done was read before that).
        if (recorded.get(migration.id) !== undefined) return false
        migration.up(ctx)
        record.run(migration.id, migration.name, new Date().toISOString())
        return true
      })
      .immediate()
    if (appliedNow) applied.push({ id: migration.id, name: migration.name })
  }

  const version =
    (raw.prepare('SELECT max(id) AS v FROM schema_migrations').get() as { v: number | null }).v ?? 0
  return { applied, version }
}
