/**
 * Browser-safe schema bootstrap for the hub worker.
 *
 * `packages/db`'s ensureSchema()/ensureViews() only PATCH an existing schema —
 * the tables themselves come from `drizzle-kit push`, a Node CLI that cannot
 * run inside a webview. A fresh Tauri install therefore has no tables, and
 * initDb() would even fail to create the derived views (CREATE VIEW validates
 * its FROM tables in SQLite).
 *
 * This module closes that gap WITHOUT touching packages/db: it regenerates
 * CREATE TABLE/INDEX statements from the drizzle schema at runtime via
 * drizzle-orm's `getTableConfig` (the same source drizzle-kit uses), so the
 * DDL can never drift from `packages/db/src/schema.ts`. Statements are all
 * `IF NOT EXISTS`, making the bootstrap a cheap no-op on an already-pushed
 * database (the worker runs it before initDb every boot).
 *
 * DDL parity with drizzle-kit push (verified against data/learning-hub.db):
 * - type map: Integer/Boolean → integer, Real → real, Blob → blob, else text
 * - boolean defaults render as true/false literals (SQLite ≥3.23)
 * - JSON-mode text defaults render as their JSON string ('[]', '{}')
 * - inline .references() surface through getTableConfig().foreignKeys with
 *   their onDelete/onUpdate actions
 */
import { getTableName, is, Table } from 'drizzle-orm'
import { getTableConfig } from 'drizzle-orm/sqlite-core'
import * as schemaModule from '@learning-hub/db'

/** Anything with exec() — the RawSqliteHandle surface the worker has. */
interface ExecOnly {
  exec(sql: string): void
}

/** Runtime column shape (drizzle 0.45 does not type autoIncrement). */
interface ColumnLike {
  name: string
  columnType: string
  primary: boolean
  notNull: boolean
  default: unknown
  isUnique: boolean
  uniqueType?: string
  autoIncrement?: boolean
}

/** Runtime table config shape (a subset of drizzle's TableConfig). */
interface TableConfigLike {
  name: string
  columns: ColumnLike[]
  primaryKeys?: { name?: string; columns: ColumnLike[] }[]
  uniqueConstraints?: { name?: string; columns: ColumnLike[] }[]
  foreignKeys: {
    reference(): { columns: ColumnLike[]; foreignTable: unknown; foreignColumns: ColumnLike[] }
    onUpdate?: string
    onDelete?: string
  }[]
  indexes: {
    config: { name?: string; columns: ColumnLike[]; unique?: boolean }
  }[]
}

/** drizzle columnType → SQLite storage class (matches drizzle-kit push). */
function sqlType(columnType: string): string {
  if (columnType.includes('Integer') || columnType.includes('Boolean')) return 'integer'
  if (columnType.includes('Real')) return 'real'
  if (columnType.includes('Blob')) return 'blob'
  return 'text'
}

/** Render a column .default() value the way drizzle-kit push would. */
function defaultLiteral(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return `'${text.replace(/'/g, "''")}'`
}

/** Quote an identifier the drizzle-kit way (backticks). */
function q(name: string): string {
  return `\`${name.replace(/`/g, '``')}\``
}

function tableConfig(table: Table): TableConfigLike {
  return getTableConfig(table) as unknown as TableConfigLike
}

/** Column definitions for CREATE TABLE (one line each, constraint suffixes). */
function columnSpecs(cfg: TableConfigLike): string[] {
  return cfg.columns.map((col) => {
    const parts = [q(col.name), sqlType(col.columnType)]
    if (col.primary) {
      // INTEGER PRIMARY KEY is the rowid alias; AUTOINCREMENT exactly when the
      // column declares it (drizzle-kit's rule).
      parts.push('PRIMARY KEY')
      if (col.autoIncrement) parts.push('AUTOINCREMENT')
    }
    if (col.isUnique && col.uniqueType === 'unique') parts.push('UNIQUE')
    if (col.notNull) parts.push('NOT NULL')
    if (col.default !== undefined) parts.push(`DEFAULT ${defaultLiteral(col.default)}`)
    return parts.join(' ')
  })
}

/** One CREATE TABLE per drizzle table (with FK + composite-PK constraints). */
function createTableSql(table: Table): string {
  const cfg = tableConfig(table)
  const constraints: string[] = []

  for (const pk of cfg.primaryKeys ?? []) {
    const cols = pk.columns.map((c) => q(c.name)).join(', ')
    constraints.push(`PRIMARY KEY (${cols})`)
  }
  for (const unique of cfg.uniqueConstraints ?? []) {
    const cols = unique.columns.map((c) => q(c.name)).join(', ')
    constraints.push(`CONSTRAINT ${q(unique.name ?? `${cfg.name}_unique`)} UNIQUE (${cols})`)
  }
  for (const fk of cfg.foreignKeys) {
    const ref = fk.reference()
    const local = ref.columns.map((c) => q(c.name)).join(', ')
    const foreignTable = getTableName(ref.foreignTable as Table)
    const foreign = ref.foreignColumns.map((c) => q(c.name)).join(', ')
    const onUpdate = fk.onUpdate ? ` ON UPDATE ${fk.onUpdate}` : ''
    const onDelete = fk.onDelete ? ` ON DELETE ${fk.onDelete}` : ''
    constraints.push(
      `FOREIGN KEY (${local}) REFERENCES ${q(foreignTable)}(${foreign})${onUpdate}${onDelete}`,
    )
  }

  const body = [...columnSpecs(cfg), ...constraints].join(',\n  ')
  return `CREATE TABLE IF NOT EXISTS ${q(cfg.name)} (\n  ${body}\n)`
}

/** One CREATE INDEX per drizzle index definition (unique flag preserved). */
function createIndexSql(table: Table): string[] {
  const cfg = tableConfig(table)
  return cfg.indexes.map((ix) => {
    const name = ix.config.name ?? `${cfg.name}_idx`
    const cols = ix.config.columns.map((c) => q(c.name)).join(', ')
    const unique = ix.config.unique ? 'UNIQUE ' : ''
    return `CREATE ${unique}INDEX IF NOT EXISTS ${q(name)} ON ${q(cfg.name)} (${cols})`
  })
}

/** The drizzle tables exported by @learning-hub/db (nothing else). */
function schemaTables(): Table[] {
  const tables: Table[] = []
  for (const value of Object.values(schemaModule)) {
    if (typeof value === 'object' && value !== null && is(value, Table)) {
      tables.push(value as unknown as Table)
    }
  }
  return tables
}

/**
 * All DDL statements for the schema, in safe order (tables then indexes;
 * FKs are not validated by CREATE TABLE, so table order does not matter).
 */
export function workerSchemaSql(): string[] {
  const tables = schemaTables()
  const statements: string[] = []
  for (const table of tables) statements.push(createTableSql(table))
  for (const table of tables) statements.push(...createIndexSql(table))
  return statements
}

/**
 * Apply the schema to a raw wasm handle — idempotent (all IF NOT EXISTS).
 * Returns the number of statements executed (useful for tests/first-run logs).
 */
export function ensureWorkerSchema(raw: ExecOnly): number {
  const statements = workerSchemaSql()
  for (const sql of statements) raw.exec(sql)
  return statements.length
}
