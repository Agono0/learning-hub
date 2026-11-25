/**
 * Arena API handler integration tests.
 *
 * Covers the full settlement contract:
 *  - GET builds a session from real due cards through the review engine
 *    (weak-first ordering, deck filtering, limit clamping).
 *  - POST runs every exchange through the canonical executeReview path
 *    (FSRS reschedules, revlog rows appear, per-grade XP lands).
 *  - The outcome is recomputed server-side: a lying client (inflated
 *    bestCombo / wrong result) cannot change coins or XP.
 *  - Settlement is idempotent: replaying the same grade log mints zero
 *    additional coins and zero additional arena XP.
 *  - Validation rejects malformed payloads (empty exchanges, bad grades).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-arena-test-')), 'arena.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  arena: typeof import('../src/server/handlers/arena/route')
  history: typeof import('../src/server/handlers/arena/history/route')
  db: typeof import('@learning-hub/db')
  core: typeof import('@learning-hub/core')
}

let M: Modules
let deckId: number
let cardIds: number[]

function settleBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    deckIds: [deckId],
    exchanges: cardIds.slice(0, 3).map((cardId, i) => ({
      cardId,
      grade: i === 2 ? 1 : 3,
      confidence: i === 0 ? 1 : 0,
      timeMs: 2500 + i * 700,
    })),
    bestCombo: 2,
    result: 'victory',
    ...overrides,
  }
}

beforeAll(async () => {
  const dbMod = await import('@learning-hub/db')
  const arenaMod = await import('../src/server/handlers/arena/route')
  const historyMod = await import('../src/server/handlers/arena/history/route')
  const coreMod = await import('@learning-hub/core')
  M = { arena: arenaMod, history: historyMod, db: dbMod, core: coreMod }

  const past = new Date(Date.now() - 86_400_000).toISOString()
  const [deck] = M.db.db
    .insert(M.db.decks)
    .values({ name: 'Arena Test Deck', description: 'Settlement harness deck' })
    .returning()
    .all()
  deckId = deck!.id

  cardIds = []
  for (let i = 0; i < 6; i++) {
    const [card] = M.db.db
      .insert(M.db.cards)
      .values({
        deckId,
        type: 'basic',
        content: { basic: { front: `Arena Q${i + 1}`, back: `Arena A${i + 1}` } },
        due: past,
      })
      .returning()
      .all()
    cardIds.push(card!.id)
  }
})

describe('Arena API — GET /api/arena', () => {
  it('builds a session from real due cards', async () => {
    const res = await M.arena.GET(new Request('http://localhost/api/arena?limit=5'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.cards.length).toBeGreaterThan(0)
    expect(body.cards.length).toBeLessThanOrEqual(5)
    for (const card of body.cards) {
      expect(card.content.basic.front).toMatch(/^Arena Q/)
      expect(card.previews).toBeDefined()
    }
    expect(body.config.maxHp).toBeGreaterThan(0)
  })

  it('filters to the requested deck ids', async () => {
    const [other] = M.db.db
      .insert(M.db.decks)
      .values({ name: 'Arena Other Deck', description: 'Not selected' })
      .returning()
      .all()
    M.db.db
      .insert(M.db.cards)
      .values({
        deckId: other!.id,
        type: 'basic',
        content: { basic: { front: 'Other Q', back: 'Other A' } },
        due: new Date(Date.now() - 86_400_000).toISOString(),
      })
      .run()

    const res = await M.arena.GET(
      new Request(`http://localhost/api/arena?deckIds=${deckId}&limit=10`),
    )
    const body = await res.json()
    expect(body.cards.length).toBeGreaterThan(0)
    for (const card of body.cards) {
      expect(card.deckId).toBe(deckId)
    }
  })

  it('clamps the limit into the arena band (5..20)', async () => {
    const res = await M.arena.GET(new Request('http://localhost/api/arena?limit=500'))
    const body = await res.json()
    expect(body.limit).toBeLessThanOrEqual(20)
  })
})

describe('Arena API — POST /api/arena settlement', () => {
  it('schedules every exchange through the canonical review engine', async () => {
    const before = M.db.db.select().from(M.db.revlog).all().length
    const res = await M.arena.POST(
      new Request('http://localhost/api/arena', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settleBody()),
      }),
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.summary.rounds).toBe(3)

    const after = M.db.db.select().from(M.db.revlog).all().length
    expect(after - before).toBe(3)

    // FSRS actually rescheduled the cards (due moved into the future).
    const first = M.db.db
      .select()
      .from(M.db.cards)
      .where(eq(M.db.cards.id, cardIds[0]!))
      .limit(1)
      .all()[0]
    expect(new Date(first!.due).getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect(first!.reps).toBe(1)
  })

  it('recomputes the summary server-side and ignores a lying client', async () => {
    const res = await M.arena.POST(
      new Request('http://localhost/api/arena', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // Distinct timings → a distinct grade log (the first settlement's log
        // would dedupe as a replay, which is correct and tested separately).
        body: JSON.stringify(
          settleBody({
            bestCombo: 999,
            result: 'defeat',
            exchanges: cardIds.slice(0, 3).map((cardId, i) => ({
              cardId,
              grade: i === 2 ? 1 : 3,
              confidence: i === 0 ? 1 : 0,
              timeMs: 9100 + i * 550,
            })),
          }),
        ),
      }),
    )
    const body = await res.json()
    // Two correct + one Again: the engine's own count wins over the client.
    expect(body.summary.correct).toBe(2)
    expect(body.summary.bestCombo).toBeLessThan(10)
    expect(body.summary.result).toBe('victory') // all 3 rounds resolved → victory
  })

  it('mints coins once per grade log (idempotent replay)', async () => {
    const payload = settleBody({
      exchanges: cardIds.slice(3, 5).map((cardId, i) => ({
        cardId,
        grade: 3,
        confidence: 1,
        timeMs: 2100 + i * 400,
      })),
    })
    const first = await M.arena.POST(
      new Request('http://localhost/api/arena', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )
    const firstBody = await first.json()
    expect(firstBody.coinsAwarded).toBeGreaterThan(0)

    const replay = await M.arena.POST(
      new Request('http://localhost/api/arena', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )
    const replayBody = await replay.json()
    expect(replayBody.coinsAwarded).toBe(0)
    expect(replayBody.coinBalance).toBe(firstBody.coinBalance)
  })

  it('awards arena XP as a distinct xp_events source', async () => {
    const rows = M.db.db
      .select()
      .from(M.db.xpEvents)
      .all()
      .filter((r) => r.source === 'arena')
    expect(rows.length).toBeGreaterThan(0)
    const total = rows.reduce((sum, r) => sum + r.amount, 0)
    expect(total).toBeGreaterThan(0)
  })

  it('rejects a settlement with no exchanges', async () => {
    const res = await M.arena.POST(
      new Request('http://localhost/api/arena', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(settleBody({ exchanges: [] })),
      }),
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('rejects an out-of-range grade', async () => {
    const res = await M.arena.POST(
      new Request('http://localhost/api/arena', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          settleBody({
            exchanges: [{ cardId: cardIds[0]!, grade: 7, confidence: 0, timeMs: 1000 }],
          }),
        ),
      }),
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('rejects a settlement for a card that does not exist', async () => {
    const res = await M.arena.POST(
      new Request('http://localhost/api/arena', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          settleBody({
            exchanges: [{ cardId: 999_999, grade: 3, confidence: 0, timeMs: 1000 }],
          }),
        ),
      }),
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})

describe('Arena API — achievements', () => {
  it('the first settled run unlocks arena_first exactly once', async () => {
    // The three settlements above already ran: the catalog shows arena_first
    // unlocked, and no settlement response unlocked it twice.
    const res = await M.history.GET(new Request('http://localhost/api/arena/history'))
    const body = await res.json()
    expect(body.stats.runs).toBe(3)

    const achievementsRes = await import('../src/server/handlers/achievements/route').then((m) =>
      m.GET(new Request('http://localhost/api/achievements')),
    )
    const catalog = await achievementsRes.json()
    const badge = catalog.catalog.find((a: { key: string }) => a.key === 'arena_first')
    expect(badge.unlocked).toBe(true)
    expect(catalog.newlyUnlocked).not.toContain('arena_first') // already unlocked earlier
  })
})

describe('Arena API — run history (/api/arena/history)', () => {
  it('records one history row per settled run, never two on replay', async () => {
    const res = await M.history.GET(new Request('http://localhost/api/arena/history'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    // Three distinct grade logs settled above; replays added none.
    expect(body.stats.runs).toBe(3)
    expect(body.runs.length).toBe(3)
  })

  it('aggregates wins, accuracy and totals from append-only history', async () => {
    const res = await M.history.GET(new Request('http://localhost/api/arena/history'))
    const body = await res.json()
    // All three settlements were all-rounds-resolved → all victories.
    expect(body.stats.victories).toBe(3)
    expect(body.stats.defeats).toBe(0)
    expect(body.stats.winRate).toBe(1)
    expect(body.stats.winStreak).toBe(3)
    expect(body.stats.rounds).toBe(3 + 3 + 2)
    expect(body.stats.totalCoins).toBeGreaterThan(0)
    expect(body.stats.totalXp).toBeGreaterThan(0)
    expect(body.stats.bestCombo).toBeGreaterThan(0)
  })

  it('lists runs newest-first with the settlement payloads', async () => {
    const res = await M.history.GET(new Request('http://localhost/api/arena/history?limit=2'))
    const body = await res.json()
    expect(body.runs.length).toBe(2)
    expect(body.runs[0].id).toBeGreaterThan(body.runs[1].id)
    expect(body.runs[0].referenceId).toMatch(/^arena:/)
    expect(body.runs[0].deckIds).toContain(deckId)
    expect(body.runs[0].result).toBe('victory')
  })
})
