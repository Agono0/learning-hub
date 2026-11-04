/**
 * Learning HUB — database client.
 * better-sqlite3 is in Next 15/16's serverExternalPackages allowlist (no bundler fights).
 * Cache the drizzle instance on globalThis to survive dev hot-reloads.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema'
import { resolveDbPath, resolveImagesDir } from './paths'

/** The drizzle database type used across the app (better-sqlite3 sync driver). */
export type LearningHubDB = ReturnType<typeof createDb>

function createDb() {
  const url = resolveDbPath()
  const dir = dirname(url)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  const sqlite = new Database(url, { timeout: 5000 })
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('wal_autocheckpoint = 1000')
  sqlite.pragma('foreign_keys = ON')
  ensureSchema(sqlite)
  ensureViews(sqlite)
  return drizzle(sqlite, { schema })
}

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
function ensureCascadeForeignKeys(sqlite: Database.Database, tableNames: Set<string>) {
  const hasSeqTable = tableNames.has('sqlite_sequence')

  for (const tableName of CASCADE_FOREIGN_KEY_TABLES) {
    if (!tableNames.has(tableName)) continue

    const tableInfo = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) as { sql: string } | undefined
    if (!tableInfo || !tableInfo.sql) continue

    const originalSql = tableInfo.sql
    if (!originalSql.toUpperCase().includes('FOREIGN KEY')) continue
    if (originalSql.toUpperCase().includes('ON DELETE CASCADE')) continue

    // Query existing indexes for this table before dropping
    const existingIndexes = sqlite.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL"
    ).all(tableName) as { sql: string }[]

    // Capture autoincrement sequence if present
    const seqRow = hasSeqTable
      ? (sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name = ?").get(tableName) as { seq: number } | undefined)
      : undefined

    // Construct new table DDL with ON DELETE cascade
    const tableRegex = new RegExp(`CREATE\\s+TABLE\\s+[\`"]?${tableName}[\`"]?`, 'i')
    let newSql = originalSql.replace(tableRegex, `CREATE TABLE \`${tableName}_new\``)
    newSql = newSql.replace(/ON\s+DELETE\s+NO\s+ACTION/gi, 'ON DELETE cascade')

    const countBefore = (sqlite.prepare(`SELECT count(*) as c FROM \`${tableName}\``).get() as { c: number }).c

    // FK enforcement must be off while the table is rebuilt, but it MUST be
    // restored even when the rebuild throws mid-way — otherwise the connection
    // silently runs without FK checks for its whole lifetime. Capture the
    // prior state and restore it in a finally block, then re-verify.
    const fkBefore = (sqlite.pragma('foreign_keys') as { foreign_keys: number }[])[0]?.foreign_keys === 1
    sqlite.pragma('foreign_keys = OFF')
    try {
      sqlite.transaction(() => {
        sqlite.exec(newSql)
        sqlite.exec(`INSERT INTO \`${tableName}_new\` SELECT * FROM \`${tableName}\`;`)
        sqlite.exec(`DROP TABLE \`${tableName}\`;`)
        sqlite.exec(`ALTER TABLE \`${tableName}_new\` RENAME TO \`${tableName}\`;`)
        if (seqRow && hasSeqTable) {
          sqlite.prepare("INSERT OR REPLACE INTO sqlite_sequence (name, seq) VALUES (?, ?)").run(tableName, seqRow.seq)
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
      throw new Error(`foreign_keys pragma failed to restore after rebuilding ${tableName} (expected ${fkBefore ? 1 : 0}, got ${fkAfter})`)
    }

    const countAfter = (sqlite.prepare(`SELECT count(*) as c FROM \`${tableName}\``).get() as { c: number }).c
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
 * Ensure schema additions (columns, indexes) are applied idempotently to on-disk database.
 */
function ensureSchema(sqlite: Database.Database) {
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
  const tableNames = new Set(tables.map((t) => t.name))
  if (tableNames.has('revlog')) {
    const revlogCols = sqlite.pragma('table_info(revlog)') as { name: string }[]
    if (!revlogCols.some((c) => c.name === 'retrievability')) {
      sqlite.exec('ALTER TABLE revlog ADD COLUMN retrievability REAL;')
    }
  }
  if (tableNames.has('user_settings')) {
    // ai_headers backs the 'custom-endpoint' AI provider (extra HTTP headers as JSON)
    const settingsCols = sqlite.pragma('table_info(user_settings)') as { name: string }[]
    if (!settingsCols.some((c) => c.name === 'ai_headers')) {
      sqlite.exec('ALTER TABLE user_settings ADD COLUMN ai_headers TEXT;')
    }
  }

  // Idempotently migrate foreign keys to ON DELETE CASCADE
  ensureCascadeForeignKeys(sqlite, tableNames)

  if (tableNames.has('cards')) {
    sqlite.exec('CREATE INDEX IF NOT EXISTS cards_suspended_due_idx ON cards(suspended, due);')
  }
  if (tableNames.has('courses')) {
    sqlite.exec('CREATE INDEX IF NOT EXISTS courses_track_idx ON courses(track_id);')
  }
  if (tableNames.has('units')) {
    sqlite.exec('CREATE INDEX IF NOT EXISTS units_course_idx ON units(course_id);')
  }
  if (tableNames.has('lessons')) {
    sqlite.exec('CREATE INDEX IF NOT EXISTS lessons_unit_idx ON lessons(unit_id);')
  }
}

/**
 * Derived stat views (append-only data is never mutated).
 * True retention = successful real reviews (pre-review state Review/Relearning) / total.
 */
function ensureViews(sqlite: Database.Database) {
  sqlite.exec(`CREATE VIEW IF NOT EXISTS v_true_retention AS
    SELECT count(*) AS total,
           sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS retained,
           round(100.0 * sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) / count(*), 1) AS retention_pct
    FROM revlog WHERE state >= 2`)
  sqlite.exec(`CREATE VIEW IF NOT EXISTS v_daily_reviews AS
    SELECT substr(reviewed_at, 1, 10) AS day, count(*) AS reviews,
           sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS correct,
           round(avg(time_ms)) AS avg_time_ms
    FROM revlog GROUP BY substr(reviewed_at, 1, 10)`)
  sqlite.exec(`CREATE VIEW IF NOT EXISTS v_xp_daily AS
    SELECT substr(created_at, 1, 10) AS day, sum(amount) AS xp
    FROM xp_events GROUP BY substr(created_at, 1, 10)`)
}

const g = globalThis as unknown as { __learningHubDb?: LearningHubDB }

/** Shared drizzle client: created once and cached on globalThis across hot reloads. */
export const db: LearningHubDB = g.__learningHubDb ?? createDb()
if (!g.__learningHubDb) g.__learningHubDb = db

/** Escape hatch to the underlying better-sqlite3 connection (raw statements/pragmas). */
export function getRawDb(): Database.Database {
  return (db as unknown as { $client: Database.Database }).$client
}

export { schema, resolveDbPath, resolveImagesDir }
export * from './schema'
export * from './transaction'
export * from './review-service'
export * from './backup'

