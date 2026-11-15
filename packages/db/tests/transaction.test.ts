import { describe, expect, it } from 'vitest'
import { initDb, type LearningHubDB } from '../src/index'
import { decks } from '../src/schema'
import { withTransaction, writeTransaction } from '../src/transaction'

/** A fresh in-memory database built by the production initDb pipeline. */
async function createTestDb(): Promise<LearningHubDB> {
  const db = await initDb({ path: ':memory:' })
  db.delete(decks).run() // start from zero decks regardless of seeding
  return db
}

const names = (db: LearningHubDB) =>
  db
    .select({ name: decks.name })
    .from(decks)
    .all()
    .map((r) => r.name)

describe('transaction helpers', () => {
  it('commits writes atomically on successful return', async () => {
    const db = await createTestDb()

    const result = withTransaction((tx) => {
      tx.insert(decks).values({ name: 'alpha' }).run()
      tx.insert(decks).values({ name: 'beta' }).run()
      return 42
    }, db)

    expect(result).toBe(42)
    expect(names(db)).toEqual(['alpha', 'beta'])
  })

  it('rolls back all writes if an exception is thrown', async () => {
    const db = await createTestDb()

    expect(() => {
      withTransaction((tx) => {
        tx.insert(decks).values({ name: 'gamma' }).run()
        throw new Error('Simulated failure during transaction')
      }, db)
    }).toThrow('Simulated failure during transaction')

    expect(names(db)).toEqual([])
  })

  it('rolls back the earlier write when a later one violates a constraint', async () => {
    const db = await createTestDb()

    expect(() =>
      withTransaction((tx) => {
        tx.insert(decks).values({ name: 'dup' }).run()
        tx.insert(decks).values({ name: 'dup' }).run() // decks.name is UNIQUE
      }, db),
    ).toThrow()

    expect(names(db)).toEqual([])
  })

  it('writeTransaction behaves as an identical alias for withTransaction', async () => {
    const db = await createTestDb()

    const res = writeTransaction((tx) => {
      tx.insert(decks).values({ name: 'delta' }).run()
      return 'ok'
    }, db)

    expect(res).toBe('ok')
    expect(names(db)).toEqual(['delta'])
  })

  it('supports multiple sequential transactions cleanly', async () => {
    const db = await createTestDb()

    withTransaction((tx) => {
      tx.insert(decks).values({ name: 't1' }).run()
    }, db)
    withTransaction((tx) => {
      tx.insert(decks).values({ name: 't2' }).run()
    }, db)

    expect(names(db)).toEqual(['t1', 't2'])
  })
})
