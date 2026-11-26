/**
 * Learning HUB — whole-database backup/restore.
 *
 * `backupAll` dumps EVERY schema table into a plain-JSON envelope
 * `{ version, exportedAt, tables: { <name>: rows[] } }`. Rows are the raw
 * SQLite rows (DB column names, booleans as 0/1, JSON columns as their stored
 * TEXT) — the exact bytes that round-trip back through `restoreAll`.
 *
 * `restoreAll` validates the envelope with zod, then truncates and reinserts
 * everything inside ONE transaction (`PRAGMA defer_foreign_keys` keeps FK
 * checks until commit). Rows are inserted with their explicit ids, so
 * append-only event tables (revlog, xp_events, elo_events) keep their ids.
 *
 * Driver-agnostic: consumes the structural RawSqliteHandle, so it works over
 * better-sqlite3 AND the sqlite-wasm shim. A handle argument lets tests target
 * a throwaway connection; the default is the active app DB.
 */
import { getTableName, is, Table } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from './schema'
import { ValidationError } from './review-service'
import { getRawDb, type RawSqliteHandle } from './index'

/** Current backup envelope version (bumped on breaking envelope changes). */
export const BACKUP_VERSION = 1

/** Whole-database backup envelope. */
export interface BackupFile {
  version: number
  exportedAt: string
  tables: Record<string, Record<string, unknown>[]>
}

/** zod schema for a backup envelope (`restoreAll` boundary validation). */
export const backupFileSchema = z.object({
  version: z.number().int(),
  exportedAt: z.string(),
  tables: z.record(
    z.string(),
    z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
  ),
})

/**
 * Device-local tables: they hold this device's credentials or private key and
 * never leave it. Exported as empty, never deleted or overwritten by a restore.
 * `online_identity` holds the ECDSA private key (`priv_key`) and the matching
 * `pub_key`/mode, so the whole row stays together on one device.
 */
export const DEVICE_LOCAL_TABLES: ReadonlySet<string> = new Set([
  'sync_configs',
  'focus_bridge',
  'online_identity',
])

/** Tables defined by the drizzle schema — the restore whitelist. */
export const KNOWN_TABLES: ReadonlySet<string> = new Set(
  Object.values(schema)
    .filter((value) => is(value, Table))
    .map((value) => getTableName(value as Table)),
)

/** All schema tables physically present in the database (excludes sqlite_% and views). */
export function presentTables(database: RawSqliteHandle): string[] {
  return (
    database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  )
    .map((r) => r.name)
    .filter((name) => KNOWN_TABLES.has(name))
}

/** FK dependencies (child → parent table names) among schema tables. */
export function foreignKeyParents(
  database: RawSqliteHandle,
  tables: string[],
): Map<string, Set<string>> {
  const parents = new Map<string, Set<string>>()
  for (const table of tables) {
    const fks = database.pragma(`foreign_key_list("${table}")`) as { table: string }[]
    const deps = new Set<string>()
    for (const fk of fks) {
      if (KNOWN_TABLES.has(fk.table) && fk.table !== table) deps.add(fk.table)
    }
    parents.set(table, deps)
  }
  return parents
}

/** Topological order (parents before children); ties keep alphabetical order. */
export function topologicalOrder(database: RawSqliteHandle, tables: string[]): string[] {
  const parents = foreignKeyParents(database, tables)
  const ordered: string[] = []
  const done = new Set<string>()
  const tableSet = new Set(tables)
  let pending = [...tables].sort()
  while (pending.length > 0) {
    const ready = pending.filter((t) =>
      [...parents.get(t)!].every((p) => done.has(p) || !tableSet.has(p)),
    )
    if (ready.length === 0) {
      // FK cycle — emit the rest alphabetically; defer_foreign_keys covers ordering.
      ordered.push(...pending)
      break
    }
    ordered.push(...ready)
    for (const t of ready) done.add(t)
    pending = pending.filter((t) => !done.has(t))
  }
  return ordered
}

/**
 * Dump every schema table into a backup envelope. Pass a connection to back up
 * a non-default database (tests); defaults to the app database.
 */
export function backupAll(database: RawSqliteHandle = getRawDb()): BackupFile {
  const out: BackupFile = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {},
  }
  for (const name of topologicalOrder(database, presentTables(database))) {
    if (DEVICE_LOCAL_TABLES.has(name)) {
      // Device-local credentials and keys NEVER leave the device in backups or cloud sync
      out.tables[name] = []
      continue
    }
    const rows = database.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[]
    if (name === 'user_settings') {
      // Strip device-local AI API keys and custom auth headers from exported envelopes
      out.tables[name] = rows.map((r) => ({
        ...r,
        ai_api_key: null,
        ai_headers: null,
      }))
    } else {
      out.tables[name] = rows
    }
  }
  return out
}

/** Restore result: how many tables and rows were reinserted. */
export interface RestoreResult {
  tables: number
  rows: number
}

/**
 * Validate a backup envelope and restore it: every schema table is truncated
 * and the backup rows reinserted with their explicit ids, all inside ONE
 * transaction (commit fails and rolls back if the restored data violates FKs).
 * Tables missing from the backup are simply emptied — this is a whole-DB restore.
 */
export function restoreAll(data: unknown, database: RawSqliteHandle = getRawDb()): RestoreResult {
  const parsed = backupFileSchema.safeParse(data)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue ? issue.path.map(String).join('.') : '?'
    throw new ValidationError(
      `invalid backup file at "${path}": ${issue?.message ?? 'unexpected shape'}`,
    )
  }
  const backupTables = parsed.data.tables
  const unknownTables = Object.keys(backupTables).filter((name) => !KNOWN_TABLES.has(name))
  if (unknownTables.length > 0) {
    throw new ValidationError(`backup contains unknown table(s): ${unknownTables.join(', ')}`)
  }

  const present = presentTables(database)
  const presentSet = new Set(present)
  const missingTables = Object.keys(backupTables).filter(
    (name) => backupTables[name]!.length > 0 && !presentSet.has(name),
  )
  if (missingTables.length > 0) {
    throw new ValidationError(
      `backup has rows for table(s) missing from the database schema (run db:push): ${missingTables.join(', ')}`,
    )
  }

  // FK check is deferred to commit, so no intermediate state can fail; the
  // topological order (children truncated first, parents inserted first) keeps
  // the transaction readable and handles FK graphs without deferral support.
  const order = topologicalOrder(database, present)

  const restore = database.transaction(() => {
    database.pragma('defer_foreign_keys = ON')

    // Preserve device-local credentials across destructive restores
    const savedSyncConfigs = presentSet.has('sync_configs')
      ? (database.prepare('SELECT * FROM "sync_configs"').all() as Record<string, unknown>[])
      : []
    const savedLocalSecrets = presentSet.has('user_settings')
      ? (database.prepare('SELECT id, ai_api_key, ai_headers FROM "user_settings"').all() as {
          id: string
          ai_api_key: string | null
          ai_headers: string | null
        }[])
      : []

    for (const table of [...order].reverse()) {
      if (DEVICE_LOCAL_TABLES.has(table)) continue
      database.prepare(`DELETE FROM "${table}"`).run()
    }

    let rowCount = 0
    for (const [table, rows] of Object.entries(backupTables)) {
      // Device-local rows in a backup (an older one may carry the private key, or another
      // device's pairing token) are never imported.
      if (DEVICE_LOCAL_TABLES.has(table) || rows.length === 0) continue
      const columns = (database.pragma(`table_info("${table}")`) as { name: string }[]).map(
        (c) => c.name,
      )
      const columnSet = new Set(columns)
      const insert = database.prepare(
        `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
      )
      for (const row of rows) {
        const extraKey = Object.keys(row).find((k) => !columnSet.has(k))
        if (extraKey !== undefined) {
          throw new ValidationError(`backup row for "${table}" has unknown column "${extraKey}"`)
        }
        insert.run(...columns.map((c) => normalizeBackupValue(row[c] as never)))
        rowCount++
      }
    }

    // Re-attach local AI API keys/headers if the restored row had them stripped
    for (const sec of savedLocalSecrets) {
      if (sec.ai_api_key || sec.ai_headers) {
        database
          .prepare(
            `UPDATE "user_settings"
             SET ai_api_key = coalesce(ai_api_key, ?),
                 ai_headers = coalesce(ai_headers, ?)
             WHERE id = ?`,
          )
          .run(sec.ai_api_key, sec.ai_headers, sec.id)
      }
    }
    void savedSyncConfigs

    return { tables: Object.keys(backupTables).length, rows: rowCount }
  })

  return restore()
}

/** Coerce a validated backup value into something better-sqlite3 can bind. */
export function normalizeBackupValue(
  value: string | number | boolean | null | undefined,
): string | number | null {
  if (value === undefined || value === null) return null
  if (typeof value === 'boolean') return value ? 1 : 0 // SQLite has no boolean type
  return value
}
