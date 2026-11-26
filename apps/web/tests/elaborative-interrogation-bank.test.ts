/**
 * Persistent bank route: facts, attempts and queue against a temp SQLite DB.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-ei-bank-')), 'b.db')

type Route = typeof import('../src/server/handlers/elaborative-interrogation/bank/route')
let route: Route

const STATEMENT =
  'Spaced practice improves retention because each retrieval strengthens the memory trace.'
const ANSWER =
  'Each retrieval takes effort, and that effort strengthens the memory so retention lasts, because forgetting makes recall harder and therefore more useful. For example vocabulary after a week.'

const post = (body: unknown) =>
  route.POST(
    new Request('http://localhost/api/elaborative-interrogation/bank', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  )
const get = (qs = '') =>
  route.GET(new Request(`http://localhost/api/elaborative-interrogation/bank${qs}`))

beforeAll(async () => {
  route = await import('../src/server/handlers/elaborative-interrogation/bank/route')
})

describe('EI bank route', () => {
  it('adds a fact, records an attempt, and exposes queue, calibration and history', async () => {
    const created = await post({ action: 'add', statement: STATEMENT, keyTerms: ['retrieval'] })
    expect(created.status).toBe(201)
    const { fact } = await created.json()
    expect(fact.id).toMatch(/^db\d+$/)

    const q0 = await (await get('?today=50')).json()
    expect(q0.queue).toHaveLength(1)

    const res = await post({
      action: 'attempt',
      factId: fact.id,
      answer: ANSWER,
      predicted: 85,
      today: 50,
    })
    expect(res.status).toBe(200)
    const attempt = await res.json()
    expect(attempt.state.attempts).toBe(1)
    expect([1, 2, 3, 4]).toContain(attempt.fsrsRating)

    const after = await (await get('?today=50')).json()
    expect(after.queue).toHaveLength(0)
    expect(after.recent).toHaveLength(1)
    expect(after.calibration.n).toBe(1)
    expect(after.states[0].factId).toBe(fact.id)
  })
  it('imports facts from text', async () => {
    const res = await post({
      action: 'import',
      text: 'Photosynthesis converts sunlight into chemical energy inside the chloroplasts of plant cells.',
    })
    expect(res.status).toBe(201)
    expect((await res.json()).added).toHaveLength(1)
  })
  it('archives and then 404s', async () => {
    const { fact } = await (
      await post({
        action: 'add',
        statement: 'Heat causes metal to expand when atoms vibrate faster.',
      })
    ).json()
    expect((await post({ action: 'archive', factId: fact.id })).status).toBe(200)
    expect((await post({ action: 'archive', factId: fact.id })).status).toBe(404)
    expect((await post({ action: 'attempt', factId: fact.id, answer: 'x', today: 1 })).status).toBe(
      404,
    )
  })
  it('validates input', async () => {
    expect((await post({ action: 'attempt', factId: '12', answer: 'x' })).status).toBe(400)
    expect((await post({ action: 'add', statement: 'short' })).status).toBe(400)
    expect((await get('?limit=500')).status).toBe(400)
  })

  it('does not double facts when the same text is imported twice or added again', async () => {
    const text =
      'Mitochondria produce most of the ATP a cell needs through oxidative phosphorylation.'
    const first = await (await post({ action: 'import', text })).json()
    const second = await post({ action: 'import', text })
    const body = await second.json()
    expect(first.added).toHaveLength(1)
    expect(body.added).toHaveLength(0)
    expect(body.skippedDuplicates).toBe(1)
    const dup = await post({ action: 'add', statement: first.added[0].statement.toUpperCase() })
    expect(dup.status).toBe(200)
    expect((await dup.json()).duplicate).toBe(true)
  })

  it('answers 409 once the bank is full', async () => {
    const { addEiFact, listEiFacts, EI_MAX_ACTIVE_FACTS } = await import('@learning-hub/db')
    for (let i = listEiFacts().length; i < EI_MAX_ACTIVE_FACTS; i++) {
      addEiFact({ statement: `Filler statement ${i} for the capacity check.` })
    }
    const res = await post({ action: 'add', statement: 'A brand new statement over the cap.' })
    expect(res.status).toBe(409)
  })
})
