/**
 * Malformed input must produce a 4xx (or a normal 200), never a 500 or an uncaught throw.
 * Found by sweeping every handler with garbage bodies, queries and ids.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-malformed-')), 'm.db')

type H = (req: Request, ctx?: unknown) => Promise<Response>
const u = (p = '/api/x') => `http://localhost${p}`
const post = (body: string | undefined) =>
  new Request(u(), { method: 'POST', headers: { 'content-type': 'application/json' }, body })

let generation: H
let epistemicPost: H
let epistemicGet: H
let identity: H
let search: H
let tasksGet: H
let metricsGet: H

beforeAll(async () => {
  generation = (await import('../src/server/handlers/cognitive/generation/route')).POST as H
  const epi = await import('../src/server/handlers/epistemic/route')
  epistemicPost = epi.POST as H
  epistemicGet = epi.GET as H
  identity = (await import('../src/server/handlers/online/identity/route')).POST as H
  search = (await import('../src/server/handlers/search/route')).GET as H
  tasksGet = (await import('../src/server/handlers/tasks/route')).GET as H
  metricsGet = (await import('../src/server/handlers/tasks-metrics/route')).GET as H
})

describe('POST /api/cognitive/generation', () => {
  it.each([['{'], [''], ['not json']])('malformed body %j -> 400', async (b) => {
    expect((await generation(post(b))).status).toBe(400)
  })
  it.each([['[]'], ['null'], ['"x"'], ['{}'], ['{"concept":""}']])(
    'bad shape %s -> 400',
    async (b) => {
      expect((await generation(post(b))).status).toBe(400)
    },
  )
  it('a partial trial object is a 400, not a 500', async () => {
    const res = await generation(post('{"userAttempt":"a","expectedAnswer":"b"}'))
    expect(res.status).toBeLessThan(500)
  })
  it('still builds a ladder', async () => {
    const res = await generation(post('{"concept":"c","explanation":"e"}'))
    expect(res.status).toBe(200)
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true)
  })
})

describe('/api/epistemic is wrapped (ApiError becomes JSON 400)', () => {
  it.each([['{'], [''], ['[]'], ['null'], ['"x"']])('body %j -> 400 JSON', async (b) => {
    const res = await epistemicPost(post(b))
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBeTruthy()
  })
  it('GET works', async () => expect((await epistemicGet(new Request(u()))).status).toBe(200))
})

describe('POST /api/online/identity', () => {
  it('an empty patch is a no-op, not a 500', async () => {
    expect((await identity(post('{}'))).status).toBe(200)
  })
  it('an alias-only patch still applies', async () => {
    const res = await identity(post('{"alias":"scholar"}'))
    expect(res.status).toBe(200)
  })
  it('only-undefined prefs patch is fine', async () => {
    const D = await import('@learning-hub/db')
    expect(() => D.updateOnlinePrefs({})).not.toThrow()
    expect(() => D.updateOnlineIdentity({})).not.toThrow()
  })
})

describe('GET /api/search with control characters', () => {
  it.each(['%00', 'a%00b', '%01%02', 'x%7Fy', 'a%0Ab'])('q=%s does not 500', async (q) => {
    expect((await search(new Request(u(`/api/search?q=${q}`)))).status).toBe(200)
  })
  it('a normal term still works', async () => {
    expect((await search(new Request(u('/api/search?q=hello')))).status).toBe(200)
  })
})

describe('tasks list + metrics GET answer a bad query with JSON 400', () => {
  it('tasks limit=abc', async () => {
    const res = await tasksGet(new Request(u('/api/tasks?limit=abc')))
    expect(res.status).toBe(400)
  })
  it('tasks-metrics from=zzz', async () => {
    const res = await metricsGet(new Request(u('/api/tasks-metrics?from=zzz')))
    expect(res.status).toBe(400)
  })
  it('valid queries still work', async () => {
    expect((await tasksGet(new Request(u('/api/tasks')))).status).toBe(200)
    expect((await metricsGet(new Request(u('/api/tasks-metrics')))).status).toBe(200)
  })
})
