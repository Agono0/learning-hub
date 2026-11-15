/**
 * FSRS Optimizer API handler integration test (F-16)
 *
 * Verifies GET FSRS-6 status/weights, POST optimization, parameter setting,
 * and default reset.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-fsrs-test-')), 'fsrs.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = {
  optimize: typeof import('../src/server/handlers/fsrs/optimize/route')
  db: typeof import('@learning-hub/db')
}

let M: Modules

beforeAll(async () => {
  const dbMod = await import('@learning-hub/db')
  const optimizeMod = await import('../src/server/handlers/fsrs/optimize/route')
  M = { optimize: optimizeMod, db: dbMod }
})

describe('FSRS Optimizer API Handler (/api/fsrs/optimize)', () => {
  it('GET /api/fsrs/optimize returns FSRS-6 parameters and status', async () => {
    const res = await M.optimize.GET(new Request('http://localhost/api/fsrs/optimize'))
    expect(res.status).toBe(200)

    const data = (await res.json()) as {
      ok: boolean
      active: { weights: number[] }
      baseline: { weights: number[] }
      desiredRetention: number
    }
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.active.weights)).toBe(true)
    expect(data.active.weights).toHaveLength(21) // FSRS-6 has 21 parameters
    expect(data.baseline.weights).toHaveLength(21)
  })

  it('rejects invalid deckId in query parameters with 400', async () => {
    const res = await M.optimize.GET(new Request('http://localhost/api/fsrs/optimize?deckId=-5'))
    expect(res.status).toBe(400)
  })

  it('rejects mode="set" without weights with 400', async () => {
    const req = new Request('http://localhost/api/fsrs/optimize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'set' }),
    })

    const res = await M.optimize.POST(req)
    expect(res.status).toBe(400)
  })

  it('POST /api/fsrs/optimize handles mode="reset" to restore default parameters', async () => {
    const req = new Request('http://localhost/api/fsrs/optimize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'reset' }),
    })

    const res = await M.optimize.POST(req)
    expect(res.status).toBe(200)

    const data = (await res.json()) as { ok: boolean; status: { active: { weights: number[] } } }
    expect(data.ok).toBe(true)
    expect(data.status.active.weights).toHaveLength(21)
  })
})
