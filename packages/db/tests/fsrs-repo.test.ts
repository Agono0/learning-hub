import { beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq, sql } from 'drizzle-orm'
import { FSRS6_DEFAULT_WEIGHTS } from '@learning-hub/core'
import * as schema from '../src/schema'
import { ensureSchemaIndexes, ensureSchemaTables } from '../src/schema-ddl'
import { MIGRATIONS, runMigrations } from '../src/migrations'
import type { RawSqliteHandle } from '../src/index'
import { executeReview } from '../src/review-service'
import {
  getFsrsStatus,
  loadActiveRevlogs,
  optimizeAndPersistFsrs,
  undoCardReview,
} from '../src/repos/fsrs'

function createInMemoryDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const raw = sqlite as unknown as RawSqliteHandle
  ensureSchemaTables(raw)
  runMigrations(raw, MIGRATIONS)
  ensureSchemaIndexes(raw)
  const db = drizzle(sqlite, { schema })
  return { sqlite, db }
}

describe('per-deck FSRS presets, append-only Undo, and FSRS persistence repo', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createInMemoryDb>['db']

  beforeEach(() => {
    const ctx = createInMemoryDb()
    sqlite = ctx.sqlite
    db = ctx.db
    db.insert(schema.userSettings)
      .values({ id: 'default', desiredRetention: 0.9, updatedAt: '2026-01-01T00:00:00.000Z' })
      .run()
  })

  it('applies per-deck desiredRetention overrides when scheduling reviews', async () => {
    const now = new Date('2026-06-01T12:00:00.000Z')
    db.insert(schema.decks)
      .values([
        { id: 1, name: 'High Retention', desiredRetention: 0.95, createdAt: now.toISOString() },
        { id: 2, name: 'Low Retention', desiredRetention: 0.75, createdAt: now.toISOString() },
      ])
      .run()
    db.insert(schema.cards)
      .values([
        {
          id: 101,
          deckId: 1,
          type: 'basic',
          content: { basic: { front: 'Q1', back: 'A1' } },
          due: now.toISOString(),
          stability: 10,
          difficulty: 5,
          reps: 3,
          state: 2,
          lastReview: '2026-05-22T12:00:00.000Z',
          createdAt: now.toISOString(),
        },
        {
          id: 102,
          deckId: 2,
          type: 'basic',
          content: { basic: { front: 'Q2', back: 'A2' } },
          due: now.toISOString(),
          stability: 10,
          difficulty: 5,
          reps: 3,
          state: 2,
          lastReview: '2026-05-22T12:00:00.000Z',
          createdAt: now.toISOString(),
        },
      ])
      .run()

    const highRes = await executeReview(
      { cardId: 101, grade: 3, confidence: 1, timeMs: 2500 },
      { db: db as never, now },
    )
    const lowRes = await executeReview(
      { cardId: 102, grade: 3, confidence: 1, timeMs: 2500 },
      { db: db as never, now },
    )
    expect(lowRes.card.scheduledDays).toBeGreaterThan(highRes.card.scheduledDays)
  })

  it('undos a review strictly via append-only revlog_undos without deleting from revlog', async () => {
    const now = new Date('2026-06-01T12:00:00.000Z')
    db.insert(schema.decks).values({ id: 1, name: 'Deck', createdAt: now.toISOString() }).run()
    db.insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        type: 'basic',
        content: { basic: { front: 'Q', back: 'A' } },
        due: now.toISOString(),
        stability: 5,
        difficulty: 5,
        reps: 2,
        state: 2,
        lastReview: '2026-05-27T12:00:00.000Z',
        createdAt: now.toISOString(),
      })
      .run()

    const reviewed = await executeReview(
      { cardId: 1, grade: 3, confidence: 1, timeMs: 3100 },
      { db: db as never, now },
    )
    expect(db.select().from(schema.revlog).all()).toHaveLength(1)

    const undone = undoCardReview(
      {
        cardId: 1,
        revlogId: reviewed.revlog.id,
        preReview: reviewed.preReview,
      },
      { db: db as never },
    )
    expect(undone.revlogUndone).toBe(true)
    expect(undone.card.reps).toBe(2)
    expect(undone.card.stability).toBe(5)

    // Hard Rule #8: revlog row is STILL in revlog (never deleted)
    expect(db.select().from(schema.revlog).all()).toHaveLength(1)
    expect(db.select().from(schema.revlogUndos).all()).toHaveLength(1)

    // Derived views and active revlog loader exclude the undone review
    expect(loadActiveRevlogs({ db: db as never })).toHaveLength(0)
    const [retView] = db.all<{ total: number }>(sql`SELECT total FROM v_true_retention`)
    expect(Number(retView?.total ?? 0)).toBe(0)
  })

  it('persists custom FSRS-6 weights and reschedules reviewed cards on demand', async () => {
    const now = new Date('2026-06-01T12:00:00.000Z')
    db.insert(schema.decks).values({ id: 1, name: 'Deck', createdAt: now.toISOString() }).run()
    db.insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        type: 'basic',
        content: { basic: { front: 'Q', back: 'A' } },
        due: now.toISOString(),
        state: 0,
        createdAt: now.toISOString(),
      })
      .run()

    await executeReview(
      { cardId: 1, grade: 4, confidence: 1, timeMs: 2000 },
      { db: db as never, now: new Date('2026-05-01T12:00:00.000Z') },
    )
    await executeReview(
      { cardId: 1, grade: 3, confidence: 1, timeMs: 2200 },
      { db: db as never, now: new Date('2026-05-10T12:00:00.000Z') },
    )

    const custom = [...FSRS6_DEFAULT_WEIGHTS]
    custom[3] = 16.0 // boost Easy initial stability

    const res = await optimizeAndPersistFsrs({
      mode: 'set',
      weights: custom,
      desiredRetention: 0.85,
      reschedule: true,
      db: db as never,
    })
    expect(res.rescheduledCards).toBe(1)
    expect(res.weights?.[3]).toBeCloseTo(16.0, 4)

    const status = getFsrsStatus({ db: db as never })
    expect(status.customWeights).toHaveLength(21)
    expect(status.desiredRetention).toBeCloseTo(0.85, 4)

    const updatedCard = db.select().from(schema.cards).where(eq(schema.cards.id, 1)).get()
    expect(updatedCard?.reps).toBe(2)
    sqlite.close()
  })
})
