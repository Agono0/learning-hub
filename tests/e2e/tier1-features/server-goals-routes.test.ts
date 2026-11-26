import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dispatch } from '../../../apps/server/src/routes'
import { MAX_IF_THEN_CHARS } from '@learning-hub/core'
import * as goalsRoute from '../../../apps/web/app/api/goals/route'

/** Headless WOOP goals routes against the web handler on the same database. */
let server: Server
let base: string

beforeAll(async () => {
  server = createServer((req, res) => {
    dispatch(req, res).catch(() => {
      if (!res.writableEnded) res.writeHead(500).end('{}')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

const headers = { 'Content-Type': 'application/json' }
const srvPost = async (body: unknown) => {
  const res = await fetch(`${base}/goals`, { method: 'POST', headers, body: JSON.stringify(body) })
  return { status: res.status, body: await res.json() }
}
const webPost = async (body: unknown) => {
  const res = await goalsRoute.POST(
    new Request('http://localhost/api/goals', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: await res.json() }
}
/** Drop the columns that legitimately differ between two rows. */
const content = (g: Record<string, unknown>) => {
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = g
  return rest
}

describe('goals routes', () => {
  it('creates the same goal as the web route and lists it newest first', async () => {
    const input = {
      wish: '  Pass the anatomy exam  ',
      outcome: 'I feel calm',
      obstacle: 'I scroll my phone',
      ifThenPlan: 'If I pick up my phone, then I will put it in another room',
    }
    const s = await srvPost(input)
    const w = await webPost(input)
    expect(s.status).toBe(200)
    expect(s.body.ok).toBe(true)
    expect(w.status).toBe(201)
    expect(content(s.body.goal)).toEqual(content(w.body.goal))
    expect(s.body.goal.wish).toBe('Pass the anatomy exam')
    const list = await (await fetch(`${base}/goals`)).json()
    expect(list.goals[0].id).toBe(w.body.goal.id)
    expect(list.goals.map((g: { id: number }) => g.id)).toContain(s.body.goal.id)
  })

  it('stores blank optional fields as null like the web route', async () => {
    const s = await srvPost({ wish: 'Read daily', outcome: '   ', obstacle: null })
    const w = await webPost({ wish: 'Read daily', outcome: '   ', obstacle: null })
    expect(s.status).toBe(200)
    expect(s.body.goal.outcome).toBeNull()
    expect(content(s.body.goal)).toEqual(content(w.body.goal))
  })

  it.each([
    ['no wish', {}],
    ['blank wish', { wish: '   ' }],
    ['oversize if-condition', { wish: 'x', ifCondition: 'c'.repeat(5000), thenAction: 'do' }],
  ])('rejects %s with the same validation errors as web', async (_n, input) => {
    const before = (await (await fetch(`${base}/goals`)).json()).goals.length
    const s = await srvPost(input)
    const w = await webPost(input)
    expect(s.status).toBe(400)
    expect(w.status).toBe(400)
    expect(s.body.errors?.length ?? 1).toBeGreaterThan(0)
    expect(s.body.error).toBeTruthy()
    // an invalid body must not create a row on either host
    const after = (await (await fetch(`${base}/goals`)).json()).goals.length
    expect(after).toBe(before)
  })

  it('rejects a non-object or wrongly typed body with 400', async () => {
    expect((await srvPost({ wish: 5 })).status).toBe(400)
    expect((await srvPost([])).status).toBe(400)
  })

  it('applies the same length limits as the web route (differential, counts only)', async () => {
    const max = MAX_IF_THEN_CHARS
    const cases: Record<string, unknown>[] = [
      { wish: 'w'.repeat(100_000) },
      { wish: 'Learn the nerves', outcome: 'o'.repeat(100_000), obstacle: 'b'.repeat(100_000) },
      { wish: 'Learn the nerves', ifCondition: 'c'.repeat(max), thenAction: 'a'.repeat(max) },
      { wish: 'Learn the nerves', ifCondition: 'c'.repeat(max + 1), thenAction: 'do it' },
      { wish: 'Learn the nerves', ifCondition: 'when', thenAction: 'a'.repeat(max + 1) },
    ]
    const outcomes: number[] = []
    for (const input of cases) {
      const s = await srvPost(input)
      const w = await webPost(input)
      // the web route answers 201 on create and the server 200 (server convention); errors match
      const sOk = s.status === 200
      const wOk = w.status === 201
      expect(sOk, JSON.stringify(Object.keys(input))).toBe(wOk)
      if (!sOk) {
        expect(s.status).toBe(w.status)
        expect(s.body).toEqual(w.body)
      }
      outcomes.push(s.status)
    }
    // at the limit passes, one over fails: the cases above really exercise both sides
    expect(outcomes).toEqual([200, 200, 200, 400, 400])
  })
})
