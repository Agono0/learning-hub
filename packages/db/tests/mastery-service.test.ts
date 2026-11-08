/**
 * Unit tests for the ONE canonical mastery path (rule 7): applySkillResponse
 * drives BKT + Elo for both curriculum practice (via executeReview) and exam
 * submit. The end-to-end behavior freeze lives in
 * apps/web/tests/mastery-golden.test.ts; this suite pins the service's own
 * contract: direction of updates, event rows, exam-K vs review-K semantics,
 * and the no-FSRS-side-effects invariant.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../src/schema'
import { initDb, type RawSqliteHandle } from '../src/index'
import { applySkillResponse } from '../src/mastery-service'
import { withTransaction } from '../src/transaction'

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
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'fts_%' AND sql IS NOT NULL",
    )
    .all()
    .map((r) => (r as { sql: string }).sql)
  for (const ddl of ddls) sqlite.exec(ddl)
  return drizzle(sqlite, { schema })
}

describe('mastery-service (rule 7: one canonical path)', () => {
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    db.insert(schema.skills)
      .values([
        { id: 42, name: 'Skill A' },
        { id: 43, name: 'Skill B' },
      ])
      .run()
  })

  const masteryRow = (skillId: number) =>
    db.select().from(schema.mastery).where(eq(schema.mastery.skillId, skillId)).get()
  const events = (skillId: number) =>
    db.select().from(schema.eloEvents).where(eq(schema.eloEvents.skillId, skillId)).all()

  it('correct answer raises pKnown and Elo; wrong answer lowers both', () => {
    db.insert(schema.mastery)
      .values({ skillId: 42, pKnown: 0.2, attempts: 4, correct: 3, elo: 1000 })
      .run()

    withTransaction((tx) => {
      const up = applySkillResponse(tx, { skillId: 42, outcome: 1, correct: true })
      expect(up.pKnownAfter).toBeGreaterThan(0.2)
      expect(up.ratingAfter).toBeGreaterThan(1000)
      expect(up.attemptsAfter).toBe(5)
      expect(up.correctAfter).toBe(4)
    }, db)
    expect(masteryRow(42)?.pKnown).toBeGreaterThan(0.2)
    expect(masteryRow(42)?.elo).toBeGreaterThan(1000)

    const beforeDown = masteryRow(42)!
    withTransaction((tx) => {
      const down = applySkillResponse(tx, { skillId: 42, outcome: 0, correct: false })
      expect(down.pKnownAfter).toBeLessThan(beforeDown.pKnown)
      expect(down.ratingAfter).toBeLessThan(beforeDown.elo)
    }, db)
    expect(masteryRow(42)?.correct).toBe(4) // wrong answer does not bump correct
    expect(masteryRow(42)?.attempts).toBe(6)
  })

  it('appends exactly one elo_events row per response (rule 8: insert-only)', () => {
    withTransaction((tx) => {
      applySkillResponse(tx, { skillId: 42, outcome: 1, correct: true })
    }, db)
    withTransaction((tx) => {
      applySkillResponse(tx, { skillId: 42, outcome: 0, correct: false })
    }, db)
    const rows = events(42)
    expect(rows).toHaveLength(2)
    expect(rows[0].ratingAfter).toBe(rows[1].ratingBefore) // chained ratings
  })

  it('creates a new mastery row on first response (defaults: pKnown 0.1, elo 1000)', () => {
    const res = withTransaction(
      (tx) => applySkillResponse(tx, { skillId: 43, outcome: 1, correct: true }),
      db,
    )
    const row = masteryRow(43)
    expect(row).toBeDefined()
    expect(row?.attempts).toBe(1)
    expect(row?.correct).toBe(1)
    expect(res.ratingBefore).toBe(1000)
    expect(res.ratingAfter).toBeGreaterThan(1000)
    expect(events(43)).toHaveLength(1)
  })

  it('exam semantics: learnerAttempts defaults to mastery attempts (K = 32/(1+a/400))', () => {
    db.insert(schema.mastery)
      .values({ skillId: 42, pKnown: 0.5, attempts: 4, correct: 4, elo: 1000 })
      .run()
    // outcome 1.0, attempts 4 → kLearner = 32/1.01 → delta = +16/1.01
    const res = withTransaction(
      (tx) => applySkillResponse(tx, { skillId: 42, outcome: 1, correct: true }),
      db,
    )
    expect(res.ratingAfter).toBeCloseTo(1000 + (32 / 1.01) * 0.5, 10)
  })

  it('review semantics: learnerAttempts override (card.reps) drives the K decay', () => {
    db.insert(schema.mastery)
      .values({ skillId: 42, pKnown: 0.5, attempts: 0, correct: 0, elo: 1000 })
      .run()
    // card.reps = 10 → kLearner = 32/1.025; expected delta with outcome 1.0 = k·0.5
    const res = withTransaction(
      (tx) =>
        applySkillResponse(tx, { skillId: 42, outcome: 1, correct: true, learnerAttempts: 10 }),
      db,
    )
    expect(res.ratingAfter).toBeCloseTo(1000 + (32 / 1.025) * 0.5, 10)
  })

  it('never touches FSRS card state (exam answers are not card reviews)', () => {
    const now = '2026-11-08T00:00:00.000Z'
    db.insert(schema.decks).values({ id: 1, name: 'D', createdAt: now }).run()
    db.insert(schema.cards)
      .values({
        id: 1,
        deckId: 1,
        skillId: 42,
        type: 'basic',
        content: { basic: { front: 'a', back: 'b' } },
        due: now,
        createdAt: now,
      })
      .run()
    const before = db.select().from(schema.cards).where(eq(schema.cards.id, 1)).get()
    withTransaction((tx) => applySkillResponse(tx, { skillId: 42, outcome: 1, correct: true }), db)
    const after = db.select().from(schema.cards).where(eq(schema.cards.id, 1)).get()
    expect(after).toEqual(before) // due/stability/difficulty/reps untouched
  })
})
