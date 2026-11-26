import { describe, expect, it, vi } from 'vitest'
import { makeCards, makeInput } from '../../../packages/core/tests/retention-planner-fixtures'

vi.mock('@learning-hub/db', async () => {
  const actual = await vi
    .importActual<Record<string, unknown>>('@learning-hub/db')
    .catch(() => ({}))
  return {
    ...actual,
    loadRetentionPlannerData: vi.fn(() => ({
      ...makeInput(makeCards(120)),
      cardsTruncated: false,
    })),
  }
})

import { GET, POST } from '@/server/handlers/retention-planner/route'

function post(body: unknown) {
  return POST(
    new Request('http://x/api/retention-planner', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
}

describe('/api/retention-planner', () => {
  it('runs one scenario and returns coverage, timing and a grid', async () => {
    const res = await post({ budgetMinutes: 20, horizonDays: 30 })
    expect(res.status).toBe(200)
    const json = (await res.json()) as {
      result: { status: string; coverage: { simulated: number }; grid: unknown[] }
    }
    expect(json.result.status).toBe('ok')
    expect(json.result.coverage.simulated).toBe(120)
    expect(json.result.grid.length).toBe(6)
  })
  it.each([
    [{ horizonDays: 13 }],
    [{ horizonDays: 400 }],
    [{ budgetMinutes: 0 }],
    [{ budgetMinutes: 1000 }],
    [{ grid: [0.9] }],
    [{ grid: [0.5, 0.9] }],
    [{ grid: [0.9, 0.8] }],
    [{ maxCards: 5001 }],
    [{ maxCalls: 400_001 }],
    [{ deckId: -1 }],
    [{ trials: 3 }],
  ])('rejects out-of-bounds or unknown input %j with 400', async (bad) => {
    const res = await post(bad)
    expect(res.status).toBe(400)
  })
  it('reports its bounds on GET and exposes no write method', async () => {
    const res = await GET(new Request('http://x/api/retention-planner'))
    const json = (await res.json()) as { bounds: { maxCalls: number } }
    expect(json.bounds.maxCalls).toBe(400_000)
    const mod = await import('@/server/handlers/retention-planner/route')
    expect(Object.keys(mod).sort()).toEqual(['GET', 'POST'])
  })
})
