import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { sqliteTable, integer, text } from 'drizzle-orm/sqlite-core'
import { eq } from 'drizzle-orm'
import { withTransaction, writeTransaction } from '../src/transaction'

const testTable = sqliteTable('test_tx', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  val: text('val').notNull(),
})

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(`CREATE TABLE test_tx (id INTEGER PRIMARY KEY AUTOINCREMENT, val TEXT NOT NULL);`)
  return drizzle(sqlite, { schema: { testTable } })
}

describe('transaction helpers', () => {
  it('commits writes atomically on successful return', () => {
    const db = createTestDb()

    const result = withTransaction((tx) => {
      tx.insert(testTable).values({ val: 'alpha' }).run()
      tx.insert(testTable).values({ val: 'beta' }).run()
      return 42
    }, db as any)

    expect(result).toBe(42)
    const rows = db.select().from(testTable).all()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.val)).toEqual(['alpha', 'beta'])
  })

  it('rolls back all writes if an exception is thrown', () => {
    const db = createTestDb()

    expect(() => {
      withTransaction((tx) => {
        tx.insert(testTable).values({ val: 'gamma' }).run()
        throw new Error('Simulated failure during transaction')
      }, db as any)
    }).toThrow('Simulated failure during transaction')

    const rows = db.select().from(testTable).all()
    expect(rows).toHaveLength(0)
  })

  it('writeTransaction behaves as an identical alias for withTransaction', () => {
    const db = createTestDb()

    const res = writeTransaction((tx) => {
      tx.insert(testTable).values({ val: 'delta' }).run()
      return 'ok'
    }, db as any)

    expect(res).toBe('ok')
    const rows = db.select().from(testTable).all()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.val).toBe('delta')
  })

  it('supports multiple sequential transactions cleanly', () => {
    const db = createTestDb()

    withTransaction((tx) => {
      tx.insert(testTable).values({ val: 't1' }).run()
    }, db as any)

    withTransaction((tx) => {
      tx.insert(testTable).values({ val: 't2' }).run()
    }, db as any)

    const rows = db.select().from(testTable).all()
    expect(rows).toHaveLength(2)
  })
})
