/**
 * Goals if-then tests: the structured implementation-intention fields
 * (ifCondition / thenAction, ≤ 200 chars each — Gollwitzer & Sheeran 2006,
 * d = 0.65) flow through POST /api/goals and PATCH /api/goals/[id] end-to-end
 * into the goals table, driven against an isolated temp SQLite DB
 * (LEARNING_HUB_DB) — no dev data is touched. An EMPTY temp file is enough:
 * ensureSchema() creates every schema.ts table (with the new columns) and runs
 * the migrations on first open (packages/db/src/index.ts).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// single test file → single module registry; the db module reads this at import time
const tempDbFile = join(mkdtempSync(join(tmpdir(), 'lh-goals-ifthen-')), 'goals.db')
process.env.LEARNING_HUB_DB = tempDbFile

type Modules = Record<string, any>
const M: Modules = {}

function post(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function patch(url: string, body: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

/** Route context for the [id] handler — Next passes params as a Promise. */
const ctx = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) })

beforeAll(async () => {
  M.goals = await import('../app/api/goals/route')
  M.goalsId = await import('../app/api/goals/[id]/route')
  M.db = await import('@learning-hub/db')
})

describe('POST /api/goals — structured if-then fields', () => {
  it('persists both halves and echoes them back', async () => {
    const res = await M.goals.POST(
      post('/api/goals', {
        wish: 'Finish the FSRS course',
        ifCondition: "it's 21:00 and I haven't studied",
        thenAction: 'I will do 3 review cards first',
      }),
    )
    expect(res.status).toBe(201)
    const { goal } = await res.json()
    expect(goal.ifCondition).toBe("it's 21:00 and I haven't studied")
    expect(goal.thenAction).toBe('I will do 3 review cards first')
  })

  it('rejects a half longer than 200 characters with a 400', async () => {
    const res = await M.goals.POST(
      post('/api/goals', { wish: 'Learn Go', ifCondition: 'x'.repeat(201) }),
    )
    expect(res.status).toBe(400)
  })

  it('treats blank halves as absent (stored null)', async () => {
    const res = await M.goals.POST(
      post('/api/goals', { wish: 'Read daily', ifCondition: '  ', thenAction: null }),
    )
    expect(res.status).toBe(201)
    const { goal } = await res.json()
    expect(goal.ifCondition).toBeNull()
    expect(goal.thenAction).toBeNull()
  })
})

describe('PATCH /api/goals/[id] — structured if-then fields', () => {
  it('sets, updates and clears each half independently', async () => {
    const created = await (await M.goals.POST(post('/api/goals', { wish: 'Daily journal' }))).json()
    const id = created.goal.id

    const set = await M.goalsId.PATCH(
      patch(`/api/goals/${id}`, { ifCondition: 'coffee is brewing' }),
      ctx(id),
    )
    expect((await set.json()).goal.ifCondition).toBe('coffee is brewing')

    // absent field keeps the stored value
    const untouched = await M.goalsId.PATCH(patch(`/api/goals/${id}`, { progressPct: 10 }), ctx(id))
    const afterUntouched = (await untouched.json()).goal
    expect(afterUntouched.ifCondition).toBe('coffee is brewing')
    expect(afterUntouched.thenAction).toBeNull()

    // sent-and-empty clears the field (→ null), matching the other WOOP parts
    const cleared = await M.goalsId.PATCH(patch(`/api/goals/${id}`, { ifCondition: '' }), ctx(id))
    expect((await cleared.json()).goal.ifCondition).toBeNull()
  })

  it('rejects a >200-char update with a 400', async () => {
    const created = await (await M.goals.POST(post('/api/goals', { wish: 'Daily journal' }))).json()
    const res = await M.goalsId.PATCH(
      patch(`/api/goals/${created.goal.id}`, { thenAction: 'y'.repeat(201) }),
      ctx(created.goal.id),
    )
    expect(res.status).toBe(400)
  })
})
