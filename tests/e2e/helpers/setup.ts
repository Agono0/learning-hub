import { existsSync, mkdirSync, copyFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { afterAll } from 'vitest'

const rootDir = path.resolve(__dirname, '../../..')
const baseDbPath = path.join(rootDir, 'data', 'learning-hub.db')
const testDir = path.join(rootDir, 'data', 'test-dbs')

if (!existsSync(testDir)) {
  mkdirSync(testDir, { recursive: true })
}

// Ensure base DB is clean
try {
  if (existsSync(baseDbPath)) {
    const srcSqlite = new Database(baseDbPath)
    srcSqlite.prepare("DELETE FROM decks WHERE name LIKE '%E2E%'").run()
    srcSqlite.prepare("DELETE FROM cards WHERE tags LIKE '%e2e%'").run()
    srcSqlite.pragma('wal_checkpoint(TRUNCATE)')
    srcSqlite.close()
  }
} catch {
  // ignore
}

// Generate unique isolated DB for this test file
const uniqueId = `file-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const testDbPath = path.join(testDir, `test-${uniqueId}.db`)

if (existsSync(baseDbPath)) {
  copyFileSync(baseDbPath, testDbPath)
}

process.env.LEARNING_HUB_DB = testDbPath
delete (globalThis as unknown as { __learningHubDb?: unknown }).__learningHubDb

export function getActiveDbPath(): string {
  return testDbPath
}

afterAll(() => {
  try {
    const globalDb = (globalThis as unknown as { __learningHubDb?: any }).__learningHubDb
    if (globalDb?.$client?.close) {
      globalDb.$client.close()
    }
  } catch {
    // ignore
  }
  delete (globalThis as unknown as { __learningHubDb?: unknown }).__learningHubDb

  try {
    if (existsSync(testDbPath)) unlinkSync(testDbPath)
    if (existsSync(`${testDbPath}-wal`)) unlinkSync(`${testDbPath}-wal`)
    if (existsSync(`${testDbPath}-shm`)) unlinkSync(`${testDbPath}-shm`)
  } catch {
    // ignore busy locks on Windows
  }
})
