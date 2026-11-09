/**
 * Runtime DDL generated from `schema.ts` — so BOTH drivers create any
 * missing table on open, without `drizzle-kit push` (a Node CLI that cannot
 * run in the native apps' webview, and that users forget after updating).
 *
 * CREATE TABLE/INDEX statements are regenerated from the drizzle schema via
 * drizzle-orm's `getTableConfig` (the same source drizzle-kit uses), so the
 * DDL can never drift from `schema.ts`. Everything is `IF NOT EXISTS`:
 * a no-op on an up-to-date database.
 *
 * Tables and indexes are applied separately (see ensureSchema in ./index):
 * tables → migrations (add missing columns) → indexes, because a new index may
 * reference a column that only a migration adds to an existing table.
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
import * as schemaModule from './schema'

/** Anything with exec() — the RawSqliteHandle surface both drivers have. */
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
    if (col.isUnique) parts.push('UNIQUE')
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

/** CREATE TABLE IF NOT EXISTS for every schema table. */
export function schemaTableSql(): string[] {
  return schemaTables().map(createTableSql)
}

/** CREATE [UNIQUE] INDEX IF NOT EXISTS for every schema index. */
export function schemaIndexSql(): string[] {
  return schemaTables().flatMap(createIndexSql)
}

/** Create any missing table (idempotent). Returns statements executed. */
export function ensureSchemaTables(raw: ExecOnly): number {
  const statements = schemaTableSql()
  for (const sql of statements) raw.exec(sql)
  return statements.length
}

/** Create any missing index (idempotent). Run AFTER migrations. */
export function ensureSchemaIndexes(raw: ExecOnly): number {
  const statements = schemaIndexSql()
  for (const sql of statements) raw.exec(sql)
  return statements.length
}
