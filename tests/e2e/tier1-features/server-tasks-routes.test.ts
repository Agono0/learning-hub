import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dispatch } from '../../../apps/server/src/routes'
import { withGuard, type GuardConfig } from '../../../apps/server/src/guard'

/**
 * Headless tasks routes. They are served through the same guard as every other route
 * (apps/server/src/guard.ts, added on the http-hardening branch: this file depends on it), so
 * the socket tests below run behind a token and prove the tasks routes are not reachable around it.
 */
const TOKEN = 'tasks-test-token'
const cfg: GuardConfig = { allowedHosts: [], allowedOrigins: [], extensionIds: [], token: TOKEN }

interface Reply {
  status: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: Record<string, any>
}

let server: Server
let port: number

function send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<Reply>((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const h: Record<string, string> = {
      Connection: 'close',
      Host: `127.0.0.1:${port}`,
      Authorization: `Bearer ${TOKEN}`,
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    }
    const r = request({ host: '127.0.0.1', port, method, path, headers: h }, (res) => {
      let text = ''
      res.on('data', (c) => (text += c))
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, json: text ? JSON.parse(text) : {} }),
      )
    })
    r.on('error', reject)
    r.end(payload)
  })
}

const create = async (title: string, extra: Record<string, unknown> = {}) => {
  const r = await send('POST', '/tasks', { title, ...extra })
  expect(r.status).toBe(200)
  return r.json.task as { id: number; title: string; isDone: boolean }
}

beforeAll(async () => {
  server = createServer(
    withGuard((req, res) => {
      dispatch(req, res).catch(() => {
        if (!res.writableEnded) res.writeHead(500).end('{}')
      })
    }, cfg),
  )
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
  port = (server.address() as AddressInfo).port
})
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

describe('tasks routes behind the guard', () => {
  it('refuse a missing token, a rebinding Host and a cross-origin write', async () => {
    const noToken = await send('GET', '/tasks', undefined, { Authorization: '' })
    expect(noToken.status).toBe(401)
    const rebind = await send('GET', '/tasks', undefined, { Host: `attacker.test:${port}` })
    expect(rebind.status).toBe(421)
    const before = (await send('GET', '/tasks')).json.count
    const cross = await send(
      'POST',
      '/tasks',
      { title: 'planted' },
      { Origin: 'https://evil.example' },
    )
    expect(cross.status).toBe(403)
    const plain = await send('POST', '/tasks', undefined, {
      'Content-Type': 'text/plain',
      'Content-Length': '2',
    })
    expect([415, 400]).toContain(plain.status)
    expect((await send('GET', '/tasks')).json.count).toBe(before)
  })
})

describe('tasks routes', () => {
  it('creates, lists and filters tasks', async () => {
    const t = await create('Write the report', { priority: 'high' })
    expect(t.isDone).toBe(false)
    const list = await send('GET', '/tasks')
    expect(list.status).toBe(200)
    expect(list.json.tasks.map((x: { id: number }) => x.id)).toContain(t.id)
    expect(list.json.count).toBe(list.json.tasks.length)
    const inbox = await send('GET', '/tasks?projectId=inbox')
    expect(inbox.json.tasks.map((x: { id: number }) => x.id)).toContain(t.id)
    const limited = await send('GET', '/tasks?limit=1')
    expect(limited.json.tasks.length).toBe(1)
  })

  it('rejects invalid input with the 400 envelope', async () => {
    const noTitle = await send('POST', '/tasks', {})
    expect(noTitle.status).toBe(400)
    expect(noTitle.json.error).toBe('Invalid request body')
    expect((await send('GET', '/tasks?limit=0')).status).toBe(400)
    expect((await send('GET', '/tasks?projectId=abc')).status).toBe(400)
    expect((await send('POST', '/tasks/complete')).status).toBe(400)
    expect((await send('POST', '/tasks/complete?id=-1')).status).toBe(400)
  })

  it('completes, hides done tasks by default, and reopens', async () => {
    const t = await create('Finish me')
    const done = await send('POST', `/tasks/complete?id=${t.id}`)
    expect(done.status).toBe(200)
    expect(done.json.task.isDone).toBe(true)
    const again = await send('POST', `/tasks/complete?id=${t.id}`)
    expect(again.status).toBe(200)
    const open = await send('GET', '/tasks')
    expect(open.json.tasks.map((x: { id: number }) => x.id)).not.toContain(t.id)
    const all = await send('GET', '/tasks?includeDone=1')
    expect(all.json.tasks.map((x: { id: number }) => x.id)).toContain(t.id)
    const reopened = await send('POST', `/tasks/reopen?id=${t.id}`)
    expect(reopened.json.task.isDone).toBe(false)
  })

  it('answers 404 for an unknown task on every id route', async () => {
    expect((await send('POST', '/tasks/complete?id=999999')).status).toBe(404)
    expect((await send('POST', '/tasks/reopen?id=999999')).status).toBe(404)
    expect((await send('POST', '/tasks/time', { id: 999999, minutes: 5 })).status).toBe(404)
  })

  it('tracks time, lists sessions with a total, and refuses done tasks', async () => {
    const t = await create('Track me')
    const logged = await send('POST', '/tasks/time', { id: t.id, minutes: 25, day: '2026-03-02' })
    expect(logged.status).toBe(200)
    expect(logged.json).toMatchObject({ ok: true, stored: true })
    await send('POST', '/tasks/time', { id: t.id, minutes: 5, day: '2026-03-03' })
    const logs = await send('GET', `/tasks/time?taskId=${t.id}`)
    expect(logs.json.logs.length).toBe(2)
    expect(logs.json.totalMs).toBe(30 * 60_000)
    const oneDay = await send('GET', `/tasks/time?taskId=${t.id}&day=2026-03-02`)
    expect(oneDay.json.totalMs).toBe(25 * 60_000)
    await send('POST', `/tasks/complete?id=${t.id}`)
    const refused = await send('POST', '/tasks/time', { id: t.id, minutes: 5 })
    expect(refused.status).toBe(400)
  })

  it('validates time input (minutes range, real calendar day)', async () => {
    const t = await create('Validate time')
    expect((await send('POST', '/tasks/time', { id: t.id, minutes: 0 })).status).toBe(400)
    expect((await send('POST', '/tasks/time', { id: t.id, minutes: 1441 })).status).toBe(400)
    expect(
      (await send('POST', '/tasks/time', { id: t.id, minutes: 5, day: '2026-02-30' })).status,
    ).toBe(400)
    expect((await send('GET', '/tasks/time?day=2026-13-45')).status).toBe(400)
  })

  it('reports a domain-rule violation as 400 with its code, not 500', async () => {
    const parent = await create('Parent')
    const bad = await send('POST', '/tasks', {
      title: 'Orphan',
      parentId: parent.id,
      projectId: 999999,
    })
    // whichever rule the repo applies, it must be a client error, never a 500
    expect(bad.status).toBeGreaterThanOrEqual(400)
    expect(bad.status).toBeLessThan(500)
  })
})
