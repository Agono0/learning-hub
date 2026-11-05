import { describe, it, expect, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eventBus, type HubEventMap } from '@learning-hub/core'
import * as schema from '../src/schema'
import { getRawDb } from '../src/index'
import { executeBatchReview } from '../src/review-service'

/**
 * Verifies the plugin extension-point contract of the review engine
 * (docs/plugins.md): every committed card publishes `review.completed` and the
 * transaction publishes `review.batch.completed` — on the shared event bus,
 * in card order, with the committed payload.
 */

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  const ddls = getRawDb()
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%' AND sql IS NOT NULL",
    )
    .all('table')
    .map((r) => r.sql as string)
  for (const ddl of ddls) sqlite.exec(ddl)

  const db = drizzle(sqlite, { schema })

  db.insert(schema.userSettings)
    .values({
      id: 'default',
      desiredRetention: 0.9,
      theme: 'system',
      updatedAt: new Date().toISOString(),
    })
    .run()
  db.insert(schema.decks)
    .values({ id: 1, name: 'Default Deck', createdAt: new Date().toISOString() })
    .run()

  const now = new Date('2026-11-04T12:00:00.000Z')
  for (const cardId of [1, 2]) {
    db.insert(schema.cards)
      .values({
        id: cardId,
        deckId: 1,
        type: 'qa',
        content: { front: `Front ${cardId}`, back: `Back ${cardId}` },
        due: now.toISOString(),
        state: 0,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        createdAt: now.toISOString(),
      })
      .run()
  }
  return db
}

describe('review-service → event bus emissions', () => {
  const cleanups: (() => void)[] = []

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
  })

  it('emits review.completed per card and review.batch.completed after the commit', async () => {
    const testDb = createTestDb()
    const completed: HubEventMap['review.completed'][] = []
    const batches: HubEventMap['review.batch.completed'][] = []
    cleanups.push(
      eventBus.on('review.completed', (p) => completed.push({ ...p })),
      eventBus.on('review.batch.completed', (p) => batches.push({ ...p })),
    )

    const now = new Date('2026-11-04T12:00:00.000Z')
    const results = await executeBatchReview(
      [
        { cardId: 1, grade: 3, confidence: 1 },
        { cardId: 2, grade: 4, confidence: 1 },
      ],
      { db: testDb as never, now },
    )

    // per-card events, in card order, with the committed payload
    expect(completed.map((e) => e.cardId)).toEqual([1, 2])
    expect(completed.map((e) => e.grade)).toEqual([3, 4])
    expect(completed.map((e) => e.xpEarned)).toEqual(results.map((r) => r.xpEarned))
    // batch event carries the transaction's card count
    expect(batches).toEqual([{ count: 2 }])
  })

  it('a single-card review emits one card event plus a batch of 1', async () => {
    const testDb = createTestDb()
    const completed: HubEventMap['review.completed'][] = []
    const batches: HubEventMap['review.batch.completed'][] = []
    cleanups.push(
      eventBus.on('review.completed', (p) => completed.push({ ...p })),
      eventBus.on('review.batch.completed', (p) => batches.push({ ...p })),
    )

    await executeBatchReview([{ cardId: 1, grade: 2, confidence: 1 }], {
      db: testDb as never,
      now: new Date('2026-11-04T12:00:00.000Z'),
    })
    expect(completed.map((e) => e.cardId)).toEqual([1])
    expect(batches).toEqual([{ count: 1 }])
  })

  it('emits nothing when the payload list is empty', async () => {
    const completed: HubEventMap['review.completed'][] = []
    const batches: HubEventMap['review.batch.completed'][] = []
    cleanups.push(
      eventBus.on('review.completed', (p) => completed.push({ ...p })),
      eventBus.on('review.batch.completed', (p) => batches.push({ ...p })),
    )
    await executeBatchReview([])
    expect(completed).toEqual([])
    expect(batches).toEqual([])
  })
})
