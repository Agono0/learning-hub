import { existsSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../../packages/db/src/schema'

export interface TestDbContext {
  db: ReturnType<typeof drizzle<typeof schema>>
  sqlite: Database.Database
  dbPath: string
  cleanup: () => void
}

let activeContext: TestDbContext | null = null

export function getActiveTestDb(): TestDbContext {
  if (!activeContext) {
    activeContext = createIsolatedTestDb('default')
  }
  return activeContext
}

export function createIsolatedTestDb(suiteName: string): TestDbContext {
  const rootDir = path.resolve(__dirname, '../../..')
  const baseDbPath = path.join(rootDir, 'data', 'learning-hub.db')
  const testDir = path.join(rootDir, 'data', 'test-dbs')
  
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true })
  }

  // Ensure source DB is checkpointed before copy
  try {
    if (existsSync(baseDbPath)) {
      const srcSqlite = new Database(baseDbPath)
      srcSqlite.pragma('wal_checkpoint(TRUNCATE)')
      srcSqlite.close()
    }
  } catch {
    // ignore if busy or already closed
  }

  const uniqueId = `${suiteName.replace(/[^a-zA-Z0-9_-]/g, '_')}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const testDbPath = path.join(testDir, `test-${uniqueId}.db`)

  if (existsSync(baseDbPath)) {
    copyFileSync(baseDbPath, testDbPath)
  }

  process.env.LEARNING_HUB_DB = testDbPath
  delete (globalThis as unknown as { __learningHubDb?: unknown }).__learningHubDb

  const sqlite = new Database(testDbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  // Ensure views exist
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

  const testDb = drizzle(sqlite, { schema })
  // Cache so any @learning-hub/db imports in route handlers use this exact db instance
  ;(globalThis as unknown as { __learningHubDb?: unknown }).__learningHubDb = testDb

  const ctx: TestDbContext = {
    db: testDb,
    sqlite,
    dbPath: testDbPath,
    cleanup: () => {
      try {
        sqlite.close()
      } catch {
        // ignore
      }
      delete (globalThis as unknown as { __learningHubDb?: unknown }).__learningHubDb
      // Attempt to remove files, ignore EBUSY on Windows if locks take time to release
      try {
        if (existsSync(testDbPath)) unlinkSync(testDbPath)
        const walPath = `${testDbPath}-wal`
        if (existsSync(walPath)) unlinkSync(walPath)
        const shmPath = `${testDbPath}-shm`
        if (existsSync(shmPath)) unlinkSync(shmPath)
      } catch {
        // file cleanup can be deferred
      }
    },
  }

  activeContext = ctx
  return ctx
}
