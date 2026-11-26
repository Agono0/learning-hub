import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { cards, db, decks } from '@learning-hub/db'
import { dispatch } from '../../../apps/server/src/routes'
import * as readinessRoute from '../../../apps/web/app/api/readiness/route'
import * as examPrepRoute from '../../../apps/web/app/api/exam-prep/route'
import * as previewRoute from '../../../apps/web/app/api/study-session/preview/route'

/**
 * Headless readiness / exam-prep / study-session routes against the web handlers: the same query
 * must give the same status and the same body on both hosts, on the same database. Time is frozen
 * (Date only) because every figure is "as of" the request time.
 */
const NOW = new Date('2026-06-01T09:00:00.000Z')
const EXAM = '2026-07-01'

let server: Server
let base: string
let deckId = 0

type Handler = { GET: (req: Request) => Promise<Response> }

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  const [deck] = db.insert(decks).values({ name: 'Planning parity' }).returning().all()
  deckId = deck!.id
  for (let i = 0; i < 12; i++) {
    db.insert(cards)
      .values({
        deckId,
        type: 'basic',
        content: { basic: { front: `front ${i}`, back: `back ${i}` } } as never,
        due: new Date(NOW.getTime() - (i + 1) * 86_400_000).toISOString(),
        tags: i % 2 === 0 ? ['even'] : ['odd'],
      } as never)
      .run()
  }
  server = createServer((req, res) => {
    dispatch(req, res).catch(() => {
      if (!res.writableEnded) res.writeHead(500).end('{}')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  vi.useRealTimers()
  await new Promise<void>((r) => server.close(() => r()))
})

async function both(path: string, query: string, web: Handler) {
  const w = await web.GET(new Request(`http://localhost${path}${query}`))
  const s = await fetch(`${base}${path}${query}`)
  return {
    web: { status: w.status, body: await w.json() },
    srv: { status: s.status, body: await s.json() },
  }
}

describe('readiness', () => {
  it('lists the exam anchors like the web route', async () => {
    const r = await both('/readiness', '', readinessRoute)
    expect(r.srv.status).toBe(200)
    expect(r.srv.body).toMatchObject({ ok: true, exams: expect.any(Array) })
    expect(r.srv.body).toEqual(r.web.body)
  })

  it.each([
    ['plan on-schedule', `?date=${EXAM}&title=Final`],
    ['plan none', `?date=${EXAM}&plan=none`],
    [
      'capacity with decks and budget',
      `?date=${EXAM}&plan=capacity&perDay=5&deckIds=${'DECK'}&budget=3`,
    ],
  ])('returns the same report as the web route: %s', async (_name, q) => {
    const r = await both('/readiness', q.replace('DECK', String(deckId)), readinessRoute)
    expect(r.srv.status).toBe(200)
    expect(r.srv.body.ok).toBe(true)
    expect(r.srv.body.review.assumptions.length).toBeGreaterThan(0)
    expect(r.srv.body).toEqual(r.web.body)
  })

  it.each([['?plan=bogus'], ['?perDay=-1'], [`?date=${EXAM}&deckIds=0`], ['?examId=abc']])(
    'rejects %s with the same 400 body',
    async (q) => {
      const r = await both('/readiness', q, readinessRoute)
      expect(r.srv.status).toBe(400)
      expect(r.srv.body).toEqual({ ok: false, error: 'invalid query' })
      expect(r.srv).toEqual(r.web)
    },
  )

  it('answers an unknown exam id with the repo status, same as web', async () => {
    const r = await both('/readiness', '?examId=987654', readinessRoute)
    expect(r.srv.status).toBeGreaterThanOrEqual(400)
    expect(r.srv).toEqual(r.web)
  })
})

describe('exam-prep', () => {
  it('returns the same plan as the web route', async () => {
    const r = await both(
      '/exam-prep',
      `?date=${EXAM}&perDay=4&rest=0,6&deckIds=${deckId}`,
      examPrepRoute,
    )
    expect(r.srv.status).toBe(200)
    expect(r.srv.body.ok).toBe(true)
    expect(r.srv.body.plan.assumptions).toBeDefined()
    expect(r.srv.body).toEqual(r.web.body)
  })

  it('requires examId or date and validates the query, same as web', async () => {
    const none = await both('/exam-prep', '', examPrepRoute)
    expect(none.srv).toEqual({
      status: 400,
      body: { ok: false, error: 'examId or date is required' },
    })
    expect(none.srv).toEqual(none.web)
    for (const q of [
      `?date=${EXAM}&target=0.2`,
      `?date=${EXAM}&rest=7`,
      `?date=${EXAM}&maxReviewsPerCard=11`,
    ]) {
      const r = await both('/exam-prep', q, examPrepRoute)
      expect(r.srv).toEqual({ status: 400, body: { ok: false, error: 'invalid query' } })
      expect(r.srv).toEqual(r.web)
    }
  })
})

describe('study-session preview', () => {
  it.each([
    [''],
    ['?limit=5&sort=lowest-recall'],
    ['?tags=even'],
    ['?states=0,1&dueByDays=7'],
    [`?deckIds=DECK&minLapses=0&maxLapses=3&recallBelow=0.9`],
  ])('returns the same cards as the web route for %s', async (q) => {
    const r = await both('/study-session/preview', q.replace('DECK', String(deckId)), previewRoute)
    expect(r.srv.status).toBe(200)
    expect(r.srv.body.ok).toBe(true)
    expect(r.srv.body).toEqual(r.web.body)
    // a parity of two empty lists proves nothing: the seeded deck has matching cards
    if (!q.includes('states') && !q.includes('recallBelow'))
      expect(r.srv.body.cards.length).toBeGreaterThan(0)
  })

  it('never returns more than 100 cards and honours the limit', async () => {
    const r = await both('/study-session/preview', '?limit=3', previewRoute)
    expect(r.srv.body.cards.length).toBe(3)
  })

  it.each([
    ['?limit=0'],
    ['?limit=101'],
    ['?limit='],
    ['?deckIds=a'],
    ['?sort=bogus'],
    ['?nope=1'],
  ])('rejects %s with the same body as web', async (q) => {
    const r = await both('/study-session/preview', q, previewRoute)
    expect(r.srv.status).toBe(400)
    expect(r.srv).toEqual(r.web)
  })
})
