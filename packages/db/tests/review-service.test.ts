import { beforeAll, describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../src/schema'
import { initDb, type RawSqliteHandle } from '../src/index'
import {
  executeReview,
  executeBatchReview,
  CardNotFoundError,
  ValidationError,
} from '../src/review-service'

// Hermetic DDL source: the canonical schema bootstrapped in memory through the
// production initDb pipeline. Never open the developer database
// (data/learning-hub.db) from tests — parallel vitest workers opening it
// concurrently race on the WAL sidecar files and intermittently fail with
// SQLITE_IOERR on Windows (zero-mutation invariant, docs/TEST_INFRA.md).
let ddlSource: RawSqliteHandle
beforeAll(async () => {
  ddlSource = (await initDb({ path: ':memory:' })).$client
})

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const ddls = ddlSource
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%' AND sql IS NOT NULL",
    )
    .all('table')
    .map((r: any) => r.sql as string)

  for (const ddl of ddls) {
    sqlite.exec(ddl)
  }

  const db = drizzle(sqlite, { schema })

  // Seed default settings and deck
  db.insert(schema.userSettings)
    .values({
      id: 'default',
      desiredRetention: 0.9,
      theme: 'system',
      updatedAt: new Date().toISOString(),
    })
    .run()

  db.insert(schema.decks)
    .values({
      id: 1,
      name: 'Default Deck',
      createdAt: new Date().toISOString(),
    })
    .run()

  return { sqlite, db }
}

describe('canonical review-service', () => {
  let testDb: ReturnType<typeof createTestDb>['db']

  beforeEach(() => {
    testDb = createTestDb().db
  })

  it('T1: executes review on new card, advancing FSRS state and awarding XP', async () => {
    const now = new Date('2026-11-04T12:00:00.000Z')

    // Create new card (state 0)
    testDb
      .insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        type: 'qa',
        content: { front: 'What is SQLite?', back: 'Embedded database' },
        due: now.toISOString(),
        state: 0,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        createdAt: now.toISOString(),
      })
      .run()

    const result = await executeReview(
      {
        cardId: 1,
        grade: 3, // Good
        confidence: 1, // Confident
        timeMs: 4000,
        today: now,
      },
      { db: testDb as any, now },
    )

    // Card should advance
    expect(result.card.state).toBeGreaterThan(0)
    expect(result.card.reps).toBe(1)
    expect(result.card.stability).toBeGreaterThan(0)
    expect(result.preReview.state).toBe(0)

    // Revlog should be recorded
    expect(result.revlog.rating).toBe(3)
    expect(result.revlog.state).toBe(0) // Anki pre-review state
    expect(result.revlog.confidence).toBe(1)
    expect(result.revlog.retrievability).toBeNull() // New card has no prior stability

    // XP: 2 (review base) + 5 (confidence bonus) = 7 XP
    expect(result.xpEarned).toBe(7)

    // Streak initialized
    expect(result.streak.current).toBe(1)
    expect(result.streak.best).toBe(1)
    expect(result.streak.lastActiveDate).toBe('2026-11-04')

    // Verify DB persistence
    const savedCard = testDb.select().from(schema.cards).where(eq(schema.cards.id, 1)).get()
    expect(savedCard?.reps).toBe(1)
    const savedLogs = testDb.select().from(schema.revlog).where(eq(schema.revlog.cardId, 1)).all()
    expect(savedLogs).toHaveLength(1)
    const savedXp = testDb.select().from(schema.xpEvents).all()
    expect(savedXp).toHaveLength(1)
    expect(savedXp[0]?.amount).toBe(7)
  })

  it('T2: DEF-001 streak preservation: increments existing current and preserves best streak', async () => {
    const now = new Date('2026-11-04T12:00:00.000Z')

    // Pre-seed streak
    testDb
      .insert(schema.streaks)
      .values({
        id: 1,
        current: 10,
        best: 15,
        lastActiveDate: '2026-11-03',
        freezes: 2,
        weekendAmulet: false,
        updatedAt: '2026-11-03T12:00:00.000Z',
      })
      .run()

    testDb
      .insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        type: 'qa',
        content: { front: 'Q', back: 'A' },
        due: now.toISOString(),
        createdAt: now.toISOString(),
      })
      .run()

    const result = await executeReview(
      { cardId: 1, grade: 3, confidence: 1, today: now },
      { db: testDb as any, now },
    )

    // DEF-001 assertion: current is incremented to 11 (NOT reset to 1), best is preserved at 15
    expect(result.streak.current).toBe(11)
    expect(result.streak.best).toBe(15)
    expect(result.streak.freezes).toBe(2)
    expect(result.streak.lastActiveDate).toBe('2026-11-04')

    const dbStreak = testDb.select().from(schema.streaks).get()
    expect(dbStreak?.current).toBe(11)
    expect(dbStreak?.best).toBe(15)
    expect(dbStreak?.freezes).toBe(2)
  })

  it('T2b: consecutive afternoon review does not consume freeze even with freezes = 0', async () => {
    const now = new Date('2026-11-04T16:00:00.000Z')

    // Pre-seed streak with 0 freezes
    testDb
      .insert(schema.streaks)
      .values({
        id: 1,
        current: 10,
        best: 15,
        lastActiveDate: '2026-11-03',
        freezes: 0,
        weekendAmulet: false,
        updatedAt: '2026-11-03T16:00:00.000Z',
      })
      .run()

    testDb
      .insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        type: 'qa',
        content: { front: 'Q', back: 'A' },
        due: now.toISOString(),
        createdAt: now.toISOString(),
      })
      .run()

    const result = await executeReview(
      { cardId: 1, grade: 3, confidence: 1, today: now },
      { db: testDb as any, now },
    )

    // Consecutive afternoon review increments current to 11 and does not reset to 1
    expect(result.streak.current).toBe(11)
    expect(result.streak.best).toBe(15)
    expect(result.streak.freezes).toBe(0)
    expect(result.streak.lastActiveDate).toBe('2026-11-04')
  })

  it('T3: DEF-001 streak broken: resets current to 1 but preserves historical best streak', async () => {
    const now = new Date('2026-11-04T12:00:00.000Z')

    // Pre-seed broken streak (missed 5 days)
    testDb
      .insert(schema.streaks)
      .values({
        id: 1,
        current: 10,
        best: 25,
        lastActiveDate: '2026-10-25',
        freezes: 0,
        weekendAmulet: false,
        updatedAt: '2026-10-25T12:00:00.000Z',
      })
      .run()

    testDb
      .insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        type: 'qa',
        content: { front: 'Q', back: 'A' },
        due: now.toISOString(),
        createdAt: now.toISOString(),
      })
      .run()

    const result = await executeReview(
      { cardId: 1, grade: 3, confidence: 1, today: now },
      { db: testDb as any, now },
    )

    // Current resets to 1, but historical best remains 25
    expect(result.streak.current).toBe(1)
    expect(result.streak.best).toBe(25)
  })

  it('T4: transaction atomicity: rolls back all tables on error', async () => {
    // Attempt review on non-existent card
    await expect(executeReview({ cardId: 9999, grade: 3 }, { db: testDb as any })).rejects.toThrow(
      CardNotFoundError,
    )

    // Verify zero mutations
    const revlogs = testDb.select().from(schema.revlog).all()
    expect(revlogs).toHaveLength(0)
    const xp = testDb.select().from(schema.xpEvents).all()
    expect(xp).toHaveLength(0)
    const streaks = testDb.select().from(schema.streaks).all()
    expect(streaks).toHaveLength(0)
  })

  it('T5: Feature 10 retrievability telemetry: computes forgetting curve on review', async () => {
    const now = new Date('2026-11-04T12:00:00.000Z')
    const lastReview = new Date('2026-10-30T12:00:00.000Z') // 5 days ago

    // Mature card with stability = 5, difficulty = 5
    testDb
      .insert(schema.cards)
      .values({
        id: 2,
        deckId: 1,
        type: 'qa',
        content: { front: 'Q', back: 'A' },
        due: now.toISOString(),
        state: 2, // Review state
        stability: 5.0,
        difficulty: 5.0,
        lastReview: lastReview.toISOString(),
        createdAt: lastReview.toISOString(),
      })
      .run()

    const result = await executeReview(
      { cardId: 2, grade: 3, confidence: 1, today: now },
      { db: testDb as any, now },
    )

    // At elapsedDays = 5 and stability = 5, retrievability target is ~0.9
    expect(result.retrievability).toBeDefined()
    expect(typeof result.retrievability).toBe('number')
    expect(result.retrievability!).toBeGreaterThan(0.8)
    expect(result.retrievability!).toBeLessThanOrEqual(1.0)
    expect(result.retrievability!).toBe(0.9)

    // Verify persisted in revlog
    const log = testDb.select().from(schema.revlog).where(eq(schema.revlog.cardId, 2)).get()
    expect(log?.retrievability).toBe(0.9)
  })

  it('T6: DEF-005 skill mastery & Elo updates when card is linked to skillId', async () => {
    const now = new Date('2026-11-04T12:00:00.000Z')

    testDb
      .insert(schema.skills)
      .values({
        id: 42,
        name: 'Quantum Mechanics',
        createdAt: now.toISOString(),
      })
      .run()

    testDb
      .insert(schema.mastery)
      .values({
        id: 1,
        skillId: 42,
        elo: 1000,
        pKnown: 0.2,
        attempts: 4,
        correct: 3,
        updatedAt: now.toISOString(),
      })
      .run()

    testDb
      .insert(schema.cards)
      .values({
        id: 3,
        deckId: 1,
        skillId: 42,
        type: 'qa',
        content: { front: 'Schrödinger eq', back: 'H psi = E psi' },
        due: now.toISOString(),
        createdAt: now.toISOString(),
      })
      .run()

    const result = await executeReview(
      { cardId: 3, grade: 4, confidence: 1, today: now },
      { db: testDb as any, now },
    )

    // Elo result present
    expect(result.elo).toBeDefined()
    expect(result.elo?.skillId).toBe(42)
    expect(result.elo?.ratingAfter).toBeGreaterThan(1000)
    expect(result.newElo).toBe(result.elo?.ratingAfter)

    // Check DB mastery
    const updatedMastery = testDb
      .select()
      .from(schema.mastery)
      .where(eq(schema.mastery.skillId, 42))
      .get()
    expect(updatedMastery?.attempts).toBe(5)
    expect(updatedMastery?.correct).toBe(4)
    expect(updatedMastery?.elo).toBe(result.elo?.ratingAfter)
    expect(updatedMastery?.pKnown).toBeGreaterThan(0.2)

    // Check Elo events table
    const events = testDb
      .select()
      .from(schema.eloEvents)
      .where(eq(schema.eloEvents.skillId, 42))
      .all()
    expect(events).toHaveLength(1)
  })

  it('T7: executeBatchReview executes multiple cards atomically in a single transaction', async () => {
    const now = new Date('2026-11-04T12:00:00.000Z')

    testDb
      .insert(schema.cards)
      .values({
        id: 10,
        deckId: 1,
        type: 'qa',
        content: { front: 'C10', back: 'A10' },
        due: now.toISOString(),
        createdAt: now.toISOString(),
      })
      .run()

    testDb
      .insert(schema.cards)
      .values({
        id: 11,
        deckId: 1,
        type: 'qa',
        content: { front: 'C11', back: 'A11' },
        due: now.toISOString(),
        createdAt: now.toISOString(),
      })
      .run()

    const results = await executeBatchReview(
      [
        { cardId: 10, grade: 3, confidence: 1 },
        { cardId: 11, grade: 4, confidence: 1 },
      ],
      { db: testDb as any, now },
    )

    expect(results).toHaveLength(2)
    expect(results[0]?.card.id).toBe(10)
    expect(results[1]?.card.id).toBe(11)

    // Revlog IDs must be unique
    expect(results[0]?.revlog.id).not.toBe(results[1]?.revlog.id)

    // Two revlogs in DB
    const allLogs = testDb.select().from(schema.revlog).all()
    expect(allLogs).toHaveLength(2)
  })

  it('T8: executeBatchReview rolls back all cards if any review fails in the batch', async () => {
    const now = new Date('2026-11-04T12:00:00.000Z')

    testDb
      .insert(schema.cards)
      .values({
        id: 20,
        deckId: 1,
        type: 'qa',
        content: { front: 'C20', back: 'A20' },
        due: now.toISOString(),
        createdAt: now.toISOString(),
      })
      .run()

    // Batch contains 1 valid card (20) and 1 non-existent card (999)
    await expect(
      executeBatchReview(
        [
          { cardId: 20, grade: 3, confidence: 1 },
          { cardId: 999, grade: 3, confidence: 1 },
        ],
        { db: testDb as any, now },
      ),
    ).rejects.toThrow(CardNotFoundError)

    // Atomic guarantee: card 20 must NOT have been updated, revlogs must be 0
    const card20 = testDb.select().from(schema.cards).where(eq(schema.cards.id, 20)).get()
    expect(card20?.reps).toBe(0)
    expect(card20?.state).toBe(0)

    const allLogs = testDb.select().from(schema.revlog).all()
    expect(allLogs).toHaveLength(0)
  })

  it('T9: rejects invalid inputs with ValidationError', async () => {
    await expect(executeReview({ cardId: 0, grade: 3 }, { db: testDb as any })).rejects.toThrow(
      ValidationError,
    )

    await expect(
      executeReview({ cardId: 1, grade: 5 as any }, { db: testDb as any }),
    ).rejects.toThrow(ValidationError)
  })
})
