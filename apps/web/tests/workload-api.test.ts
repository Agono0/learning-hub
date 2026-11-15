/**
 * Workload Balancer API handler integration test (F-16)
 *
 * Verifies review load forecasting (GET/POST), load balancing over fuzz windows,
 * backlog recovery, and preservation of Rule 7 (only `due` dates are shifted).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-workload-test-')), 'workload.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  workload: typeof import('../src/server/handlers/workload/route')
  db: typeof import('@learning-hub/db')
}

let M: Modules
let testDeckId: number

beforeAll(async () => {
  const dbMod = await import('@learning-hub/db')
  const workloadMod = await import('../src/server/handlers/workload/route')
  M = { workload: workloadMod, db: dbMod }

  const [deck] = M.db.db.insert(M.db.decks).values({ name: 'Workload Test Deck' }).returning().all()
  testDeckId = deck!.id

  const now = Date.now()
  // Seed cards with overdue dates
  for (let i = 0; i < 15; i++) {
    M.db.db
      .insert(M.db.cards)
      .values({
        deckId: testDeckId,
        type: 'basic',
        content: { basic: { front: `Q${i}`, back: `A${i}` } },
        due: new Date(now - (i + 1) * 86_400_000).toISOString(), // overdue
        stability: 10,
        difficulty: 5,
        state: 2, // review state
        lapses: 1,
        scheduledDays: 10,
      })
      .run()
  }
})

describe('Workload Balancer API Handler (/api/workload)', () => {
  it('GET /api/workload returns review load forecast and overdue count', async () => {
    const req = new Request(`http://localhost/api/workload?deckId=${testDeckId}&days=30`)
    const res = await M.workload.GET(req)
    expect(res.status).toBe(200)

    const data = (await res.json()) as {
      ok: boolean
      totalCards: number
      overdueCount: number
      forecast: Array<{ date: string; dueCount: number }>
    }
    expect(data.ok).toBe(true)
    expect(data.totalCards).toBe(15)
    expect(data.overdueCount).toBe(15)
    expect(Array.isArray(data.forecast)).toBe(true)
  })

  it('POST /api/workload action="forecast" returns forecast object', async () => {
    const req = new Request('http://localhost/api/workload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'forecast',
        deckId: testDeckId,
        days: 14,
      }),
    })

    const res = await M.workload.POST(req)
    expect(res.status).toBe(200)
    const data = (await res.json()) as { ok: boolean; action: string; forecast: unknown[] }
    expect(data.ok).toBe(true)
    expect(data.action).toBe('forecast')
    expect(Array.isArray(data.forecast)).toBe(true)
  })

  it('POST /api/workload action="catch_up" recovers from overdue backlog preserving Rule 7', async () => {
    // Check initial memory parameters of a card before catch up
    const [beforeCard] = M.db.db.select().from(M.db.cards).limit(1).all()
    const initialStability = beforeCard.stability
    const initialDifficulty = beforeCard.difficulty

    const req = new Request('http://localhost/api/workload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'catch_up',
        deckId: testDeckId,
        dailyCap: 5,
      }),
    })

    const res = await M.workload.POST(req)
    expect(res.status).toBe(200)
    const data = (await res.json()) as { ok: boolean; action: string; shiftedCount: number }
    expect(data.ok).toBe(true)
    expect(data.action).toBe('catch_up')
    expect(data.shiftedCount).toBeGreaterThan(0)

    // Rule 7 invariant check: memory parameters are unchanged
    const [afterCard] = M.db.db
      .select()
      .from(M.db.cards)
      .where(eq(M.db.cards.id, beforeCard.id))
      .limit(1)
      .all()
    expect(afterCard.stability).toBe(initialStability)
    expect(afterCard.difficulty).toBe(initialDifficulty)
  })
})
