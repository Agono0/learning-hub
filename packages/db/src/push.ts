/**
 * Learning HUB — idempotent schema & migration push (`npm run db:push`).
 *
 * Uses the same runtime DDL (`ensureSchemaTables`, `ensureSchemaIndexes`),
 * versioned migration runner (`runMigrations`), and view generator
 * (`ensureViews`) as `getRawDb()`, avoiding `drizzle-kit push` crashes when
 * SQLite views (`v_true_retention`, `v_daily_reviews`, `v_xp_daily`) or FTS5
 * virtual tables (`fts_search`) already exist in the database.
 */
import { getRawDb, resolveDbPath } from './index'

const sqlite = getRawDb()
const tables = sqlite
  .prepare(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  )
  .get() as { n: number }
const mig = sqlite
  .prepare('SELECT coalesce(max(id), 0) AS version FROM schema_migrations')
  .get() as { version: number }

console.log(
  `[db:push] Schema ready at ${resolveDbPath()} (${tables.n} tables, migration v${mig.version})`,
)
sqlite.close()
