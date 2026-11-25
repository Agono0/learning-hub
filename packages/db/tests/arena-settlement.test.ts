/**
 * Arena settlement integrity — the db-level guarantees behind /api/arena:
 *
 *  - claimArenaSettlement flips open → settling atomically with a fencing
 *    token (settleAttempt), owner-scoped; a second fresh claim reports
 *    in_progress, a stale claim can be reclaimed with a fresh token.
 *  - completeArenaSettlementInTx enforces the fencing token: a stale
 *    claimant's commit matches zero rows, throws, and its whole settlement
 *    transaction (reviews, coins, run record) rolls back.
 *  - releaseArenaClaim is fenced: a stale claimant's release never reopens a
 *    run a newer claim owns.
 *  - executeBatchReview's afterReviews hook runs inside the same atomic
 *    transaction: a failure injection rolls back reviews AND the dependent
 *    settlement writes together (no partial settlement).
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../src/schema'
import { initDb, type RawSqliteHandle } from '../src/index'
import { executeBatchReview } from '../src/review-service'
import {
  ARENA_SETTLING_TTL_MS,
  ArenaSettlementFencedError,
  claimArenaSettlement,
  completeArenaSettlementInTx,
  createArenaSession,
  getArenaSession,
  getArenaStatsByDeck,
  getWeakCardIdsForRun,
  recordArenaRun,
  releaseArenaClaim,
} from '../src/repos/arena'
import { recordCoinTransactionInTx } from '../src/repos/world'
import { withTransaction } from '../src/transaction'

// Hermetic DDL source (see review-service.test.ts — never open the dev db).
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
    .map((r) => (r as { sql: string }).sql)
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
  return { sqlite, db }
}

type TestDb = ReturnType<typeof createTestDb>['db']

function seedCard(db: TestDb, id: number): void {
  db.insert(schema.cards)
    .values({
      id,
      deckId: 1,
      type: 'basic',
      content: { basic: { front: `Q${id}`, back: `A${id}` } },
      due: new Date().toISOString(),
      state: 0,
      stability: 0,
      difficulty: 0,
      reps: 0,
      lapses: 0,
      createdAt: new Date().toISOString(),
    })
    .run()
}

function issueRun(db: TestDb, cardIds: number[]) {
  return createArenaSession(
    { userId: 'default', deckIds: [1], cardIds, archetype: 'warden', boss: false },
    db,
  )
}

describe('arena settlement claims', () => {
  let db: TestDb
  beforeEach(() => {
    db = createTestDb().db
    seedCard(db, 1)
    seedCard(db, 2)
  })

  it('claims an open run with a fencing token; a fresh second claim is in_progress', () => {
    const run = issueRun(db, [1, 2])
    const first = claimArenaSettlement(run.id, { userId: 'default', db })
    expect(first.kind).toBe('claimed')
    if (first.kind !== 'claimed') return
    expect(first.attempt).toBe(1)
    expect(first.run.status).toBe('settling')

    const second = claimArenaSettlement(run.id, { userId: 'default', db })
    expect(second.kind).toBe('in_progress')
  })

  it('owner-scope: a run belonging to another userId reports missing', () => {
    const run = issueRun(db, [1, 2])
    expect(claimArenaSettlement(run.id, { userId: 'intruder', db }).kind).toBe('missing')
    expect(claimArenaSettlement('nonexistent-id', { userId: 'default', db }).kind).toBe('missing')
  })

  it('reclaims a stale claim with a fresh fencing token', () => {
    const run = issueRun(db, [1, 2])
    const stale = claimArenaSettlement(run.id, {
      userId: 'default',
      now: new Date(Date.now() - ARENA_SETTLING_TTL_MS - 60_000),
      db,
    })
    expect(stale.kind).toBe('claimed')

    const reclaimed = claimArenaSettlement(run.id, { userId: 'default', db })
    expect(reclaimed.kind).toBe('claimed')
    if (reclaimed.kind !== 'claimed' || stale.kind !== 'claimed') return
    expect(reclaimed.attempt).toBe(stale.attempt + 1)
  })

  it('fenced release: a stale claimant cannot reopen a run a newer claim owns', () => {
    const run = issueRun(db, [1, 2])
    const stale = claimArenaSettlement(run.id, {
      userId: 'default',
      now: new Date(Date.now() - ARENA_SETTLING_TTL_MS - 60_000),
      db,
    })
    const reclaimed = claimArenaSettlement(run.id, { userId: 'default', db })
    if (stale.kind !== 'claimed' || reclaimed.kind !== 'claimed') throw new Error('setup failed')

    // The stale claimant's belated release must NOT reopen the run.
    releaseArenaClaim(run.id, stale.attempt, db)
    expect(getArenaSession(run.id, db)!.status).toBe('settling')

    // The true owner's release does reopen it.
    releaseArenaClaim(run.id, reclaimed.attempt, db)
    expect(getArenaSession(run.id, db)!.status).toBe('open')
  })

  it('fencing: the stale claimant of a reclaimed run can never commit', () => {
    const run = issueRun(db, [1, 2])
    const stale = claimArenaSettlement(run.id, {
      userId: 'default',
      now: new Date(Date.now() - ARENA_SETTLING_TTL_MS - 60_000),
      db,
    })
    const reclaimed = claimArenaSettlement(run.id, { userId: 'default', db })
    if (stale.kind !== 'claimed' || reclaimed.kind !== 'claimed') throw new Error('setup failed')

    // The stale claimant's settlement transaction throws on the fenced flip…
    expect(() =>
      withTransaction((tx) => {
        recordCoinTransactionInTx(tx, {
          userId: 'default',
          amount: 10,
          reason: 'arena_session',
          referenceId: `arena:${run.id}`,
        })
        completeArenaSettlementInTx(tx, run.id, stale.attempt, [], {})
      }, db),
    ).toThrow(ArenaSettlementFencedError)

    // …and its coin mint rolled back with it.
    const coins = db.select().from(schema.studyCoinLedger).all()
    expect(coins).toHaveLength(0)
    expect(getArenaSession(run.id, db)!.status).toBe('settling')

    // The true owner commits fine.
    withTransaction((tx) => {
      completeArenaSettlementInTx(tx, run.id, reclaimed.attempt, [{ cardId: 1 }], { ok: true })
    }, db)
    const settled = getArenaSession(run.id, db)!
    expect(settled.status).toBe('settled')
    expect(settled.settlementJson).toEqual({ ok: true })
  })
})

describe('executeBatchReview afterReviews hook (atomic settlement)', () => {
  let db: TestDb
  beforeEach(() => {
    db = createTestDb().db
    seedCard(db, 1)
    seedCard(db, 2)
  })

  it('runs inside the same transaction: dependent writes commit with the reviews', async () => {
    const run = issueRun(db, [1, 2])
    const claim = claimArenaSettlement(run.id, { userId: 'default', db })
    if (claim.kind !== 'claimed') throw new Error('setup failed')

    const results = await executeBatchReview(
      [
        { cardId: 1, grade: 3, confidence: 1, timeMs: 1200 },
        { cardId: 2, grade: 4, confidence: 0, timeMs: 800 },
      ],
      {
        db,
        afterReviews: (tx, rs) => {
          expect(rs).toHaveLength(2)
          recordCoinTransactionInTx(tx, {
            userId: 'default',
            amount: 5,
            reason: 'arena_session',
            referenceId: `arena:${run.id}`,
          })
          completeArenaSettlementInTx(tx, run.id, claim.attempt, [{ cardId: 1 }, { cardId: 2 }], {
            ok: true,
          })
        },
      },
    )
    expect(results).toHaveLength(2)
    expect(db.select().from(schema.revlog).all()).toHaveLength(2)
    expect(db.select().from(schema.studyCoinLedger).all()).toHaveLength(1)
    expect(getArenaSession(run.id, db)!.status).toBe('settled')
  })

  it('failure injection: a hook failure rolls back reviews AND settlement writes', async () => {
    const run = issueRun(db, [1, 2])
    const claim = claimArenaSettlement(run.id, { userId: 'default', db })
    if (claim.kind !== 'claimed') throw new Error('setup failed')

    await expect(
      executeBatchReview(
        [
          { cardId: 1, grade: 3, confidence: 1, timeMs: 1200 },
          { cardId: 2, grade: 3, confidence: 1, timeMs: 900 },
        ],
        {
          db,
          afterReviews: (tx) => {
            recordCoinTransactionInTx(tx, {
              userId: 'default',
              amount: 5,
              reason: 'arena_session',
              referenceId: `arena:${run.id}`,
            })
            // Simulated crash mid-settlement (disk error, invariant breach…).
            throw new Error('injected settlement failure')
          },
        },
      ),
    ).rejects.toThrow('injected settlement failure')

    // Nothing survived: no revlog, no coins, no XP, run still 'settling'
    // (the claim is recoverable via the stale-claim path, never half-done).
    expect(db.select().from(schema.revlog).all()).toHaveLength(0)
    expect(db.select().from(schema.studyCoinLedger).all()).toHaveLength(0)
    expect(db.select().from(schema.xpEvents).all()).toHaveLength(0)
    expect(getArenaSession(run.id, db)!.status).toBe('settling')
    const card = db.select().from(schema.cards).where(eq(schema.cards.id, 1)).get()!
    expect(card.reps).toBe(0)
  })

  it('fencing inside the hook: a reclaimed run rolls back the stale settler', async () => {
    const run = issueRun(db, [1, 2])
    const stale = claimArenaSettlement(run.id, {
      userId: 'default',
      now: new Date(Date.now() - ARENA_SETTLING_TTL_MS - 60_000),
      db,
    })
    if (stale.kind !== 'claimed') throw new Error('setup failed')
    // A retry reclaims the run while the stale settler is "still working".
    const reclaimed = claimArenaSettlement(run.id, { userId: 'default', db })
    if (reclaimed.kind !== 'claimed') throw new Error('setup failed')

    await expect(
      executeBatchReview([{ cardId: 1, grade: 3, confidence: 1, timeMs: 1200 }], {
        db,
        afterReviews: (tx) => {
          recordArenaRun(
            {
              deckIds: [1],
              result: 'victory',
              rounds: 1,
              correct: 1,
              accuracy: 1,
              bestCombo: 1,
              crits: 0,
              score: 100,
              coins: 1,
              xp: 5,
              durationMs: 1200,
              referenceId: `arena:${run.id}`,
            },
            tx,
          )
          completeArenaSettlementInTx(tx, run.id, stale.attempt, [], {})
        },
      }),
    ).rejects.toThrow(ArenaSettlementFencedError)

    // The stale settler's review + run record rolled back with the fenced flip.
    expect(db.select().from(schema.revlog).all()).toHaveLength(0)
    expect(db.select().from(schema.arenaRuns).all()).toHaveLength(0)
    const session = getArenaSession(run.id, db)!
    expect(session.status).toBe('settling')
    expect(session.settleAttempt).toBe(reclaimed.attempt)
  })
})

describe('getWeakCardIdsForRun', () => {
  let db: TestDb
  beforeEach(() => {
    db = createTestDb().db
    seedCard(db, 1)
    seedCard(db, 2)
    seedCard(db, 3)
  })

  it('returns the cards graded Again or Hard from a settled run, deduped', () => {
    const run = issueRun(db, [1, 2, 3])
    const claim = claimArenaSettlement(run.id, { userId: 'default', db })
    if (claim.kind !== 'claimed') throw new Error('setup failed')
    const log = [
      { cardId: 1, grade: 1, confidence: 0, timeMs: 900 },
      { cardId: 2, grade: 2, confidence: 1, timeMs: 800 },
      { cardId: 2, grade: 2, confidence: 1, timeMs: 700 },
      { cardId: 3, grade: 4, confidence: 1, timeMs: 600 },
    ]
    withTransaction((tx) => {
      completeArenaSettlementInTx(tx, run.id, claim.attempt, log, { ok: true })
    }, db)
    expect(getWeakCardIdsForRun(run.id, { db })!.sort()).toEqual([1, 2])
  })

  it('is undefined for unknown, foreign or unsettled runs', () => {
    const run = issueRun(db, [1, 2, 3])
    expect(getWeakCardIdsForRun(run.id, { db })).toBeUndefined() // still open
    expect(getWeakCardIdsForRun('nope', { db })).toBeUndefined()

    const claim = claimArenaSettlement(run.id, { userId: 'default', db })
    if (claim.kind !== 'claimed') throw new Error('setup failed')
    withTransaction((tx) => {
      completeArenaSettlementInTx(tx, run.id, claim.attempt, [], { ok: true })
    }, db)
    expect(getWeakCardIdsForRun(run.id, { userId: 'intruder', db })).toBeUndefined()
    expect(getWeakCardIdsForRun(run.id, { db })).toEqual([])
  })
})

describe('getArenaStatsByDeck', () => {
  it('attributes a run to every deck it touched and computes per-deck rates', () => {
    const { db } = createTestDb()
    db.insert(schema.decks)
      .values({ id: 2, name: 'Second Deck', createdAt: new Date().toISOString() })
      .run()

    const run = (
      deckIds: number[],
      result: 'victory' | 'defeat',
      correct: number,
      rounds: number,
      bestCombo: number,
      score: number,
      ref: string,
    ) =>
      recordArenaRun(
        {
          deckIds,
          result,
          rounds,
          correct,
          accuracy: rounds === 0 ? 0 : correct / rounds,
          bestCombo,
          crits: 0,
          score,
          coins: 1,
          xp: 5,
          durationMs: 1000,
          referenceId: ref,
        },
        db,
      )

    run([1], 'victory', 9, 10, 4, 900, 'arena:r1')
    run([2], 'defeat', 3, 10, 2, 300, 'arena:r2')
    run([1, 2], 'victory', 8, 10, 6, 1200, 'arena:r3')

    const stats = getArenaStatsByDeck({ db })
    expect(stats).toHaveLength(2)
    // Most-played first; tied runs → higher win rate first.
    expect(stats[0]!.deckId).toBe(1)
    expect(stats[0]!.runs).toBe(2) // [1] and [1,2]
    expect(stats[0]!.victories).toBe(2)
    expect(stats[0]!.winRate).toBe(1)
    expect(stats[0]!.rounds).toBe(20)
    expect(stats[0]!.correct).toBe(17)
    expect(stats[0]!.accuracy).toBeCloseTo(17 / 20)
    expect(stats[0]!.bestCombo).toBe(6)
    expect(stats[0]!.bestScore).toBe(1200)
    expect(stats[1]!.deckId).toBe(2)
    expect(stats[1]!.runs).toBe(2) // [2] and [1,2]
    expect(stats[1]!.winRate).toBe(0.5)
    expect(stats[1]!.accuracy).toBeCloseTo(11 / 20)
  })

  it('an empty record book yields no per-deck rows', () => {
    const { db } = createTestDb()
    expect(getArenaStatsByDeck({ db })).toEqual([])
  })
})
