import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createServer, request, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { dispatch } from '../../../apps/server/src/routes'
import {
  checkRequest,
  isJsonContentType,
  isLoopbackBind,
  readGuardConfig,
  withGuard,
  type GuardConfig,
  type GuardRequest,
} from '../../../apps/server/src/guard'

const base: GuardConfig = { allowedHosts: [], allowedOrigins: [], extensionIds: [] }
const req = (o: Partial<GuardRequest> = {}): GuardRequest => ({
  method: 'POST',
  host: '127.0.0.1:3300',
  origin: null,
  secFetchSite: null,
  authorization: null,
  ...o,
})

describe('server guard: pure decisions', () => {
  it('serves loopback names and IP literals, refuses other hostnames (DNS rebinding)', () => {
    for (const h of ['localhost:3300', '127.0.0.1:3300', '[::1]:3300', '192.168.1.20:3300']) {
      expect(checkRequest(req({ host: h }), base).ok).toBe(true)
    }
    for (const h of ['attacker.test:3300', 'localhost.evil.test', null, 'a b', 'x@127.0.0.1', '']) {
      const v = checkRequest(req({ host: h }), base)
      expect(v).toMatchObject({ ok: false, status: 421 })
    }
  })

  it('serves a configured hostname, optionally pinned to a port', () => {
    const cfg = { ...base, allowedHosts: ['desk.lan', 'pin.lan:4000'] }
    expect(checkRequest(req({ host: 'desk.lan:3300' }), cfg).ok).toBe(true)
    expect(checkRequest(req({ host: 'pin.lan:4000' }), cfg).ok).toBe(true)
    expect(checkRequest(req({ host: 'pin.lan:4001' }), cfg).ok).toBe(false)
  })

  it('refuses cross-origin writes but lets reads through (the browser hides them)', () => {
    const origin = 'https://evil.example'
    expect(checkRequest(req({ origin }), base)).toMatchObject({ ok: false, status: 403 })
    expect(checkRequest(req({ origin, method: 'DELETE' }), base).ok).toBe(false)
    expect(checkRequest(req({ origin, method: 'GET' }), base).ok).toBe(true)
    expect(checkRequest(req({ origin: 'null' }), base).ok).toBe(false)
    expect(checkRequest(req({ secFetchSite: 'cross-site' }), base).ok).toBe(false)
  })

  it('accepts same-origin, native-shell, listed and extension origins', () => {
    expect(checkRequest(req({ origin: 'http://127.0.0.1:3300' }), base).ok).toBe(true)
    for (const o of ['tauri://localhost', 'http://tauri.localhost', 'https://tauri.localhost']) {
      expect(checkRequest(req({ origin: o }), base).ok).toBe(true)
    }
    expect(checkRequest(req({ origin: 'https://phone.lan' }), base).ok).toBe(false)
    const listed = { ...base, allowedOrigins: ['https://phone.lan'] }
    expect(checkRequest(req({ origin: 'https://phone.lan' }), listed).ok).toBe(true)
    const ext = 'chrome-extension://abcdefgh'
    expect(checkRequest(req({ origin: ext }), base).ok).toBe(true)
    const pinned = { ...base, extensionIds: ['zzzz'] }
    expect(checkRequest(req({ origin: ext }), pinned).ok).toBe(false)
    expect(checkRequest(req({ origin: 'chrome-extension://zzzz' }), pinned).ok).toBe(true)
  })

  it('requires the bearer token when one is configured', () => {
    const cfg = { ...base, token: 's3cret-token' }
    expect(checkRequest(req(), cfg)).toMatchObject({ ok: false, status: 401 })
    expect(checkRequest(req({ authorization: 'Bearer wrong' }), cfg).ok).toBe(false)
    expect(checkRequest(req({ authorization: 'Bearer s3cret-token-x' }), cfg).ok).toBe(false)
    expect(checkRequest(req({ authorization: 's3cret-token' }), cfg).ok).toBe(false)
    expect(checkRequest(req({ authorization: 'Bearer s3cret-token' }), cfg).ok).toBe(true)
    // the token does not replace the host check
    expect(
      checkRequest(req({ host: 'attacker.test', authorization: 'Bearer s3cret-token' }), cfg).ok,
    ).toBe(false)
  })

  it('requires JSON on writes that carry a body, unless opted out', () => {
    const body = { hasBody: true }
    expect(checkRequest(req({ ...body, contentType: 'text/plain' }), base)).toMatchObject({
      ok: false,
      status: 415,
    })
    for (const ct of [
      null,
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=x',
    ]) {
      expect(checkRequest(req({ ...body, contentType: ct }), base).ok).toBe(false)
    }
    for (const ct of [
      'application/json',
      'Application/JSON; charset=utf-8',
      'application/ld+json',
    ]) {
      expect(checkRequest(req({ ...body, contentType: ct }), base).ok).toBe(true)
    }
    // no body: nothing to misread, and reads are never checked
    expect(checkRequest(req({ hasBody: false, contentType: null }), base).ok).toBe(true)
    expect(checkRequest(req({ ...body, method: 'GET', contentType: 'text/plain' }), base).ok).toBe(
      true,
    )
    const optOut = { ...base, allowAnyContentType: true }
    expect(checkRequest(req({ ...body, contentType: 'text/plain' }), optOut).ok).toBe(true)
    expect(isJsonContentType('text/json')).toBe(false)
    expect(isJsonContentType('application/jsonp')).toBe(false)
  })

  it('beyond loopback with no token, every request is refused whatever Origin it forges', () => {
    const exposed = { ...base, exposed: true }
    const origins = [
      null,
      'http://127.0.0.1:3300', // same origin as the Host header
      'tauri://localhost',
      'http://tauri.localhost',
      'chrome-extension://abcdef',
    ]
    for (const method of ['GET', 'POST']) {
      for (const origin of origins) {
        expect(checkRequest(req({ method, origin }), exposed), `${method} ${origin}`).toMatchObject(
          {
            ok: false,
            status: 401,
            reason: 'token-not-configured',
          },
        )
      }
    }
    const listed = { ...exposed, allowedOrigins: ['https://x.lan'] }
    expect(checkRequest(req({ origin: 'https://x.lan' }), listed).ok).toBe(false)
  })

  it('beyond loopback, the explicit opt-out or a token restores service; loopback stays open', () => {
    const exposed = { ...base, exposed: true }
    expect(checkRequest(req(), { ...exposed, allowUnauthenticated: true }).ok).toBe(true)
    expect(
      checkRequest(req({ origin: 'tauri://localhost' }), { ...exposed, allowUnauthenticated: true })
        .ok,
    ).toBe(true)
    const withToken = { ...exposed, token: 'tok-123' }
    expect(checkRequest(req(), withToken).ok).toBe(false)
    expect(checkRequest(req({ origin: 'tauri://localhost' }), withToken).ok).toBe(false)
    expect(checkRequest(req({ authorization: 'Bearer tok-123' }), withToken).ok).toBe(true)
    expect(
      checkRequest(req({ authorization: 'Bearer tok-123', origin: 'tauri://localhost' }), withToken)
        .ok,
    ).toBe(true)
    expect(checkRequest(req(), base).ok).toBe(true)
    expect(checkRequest(req(), { ...base, exposed: false }).ok).toBe(true)
  })

  it('GET /healthz is the one route open without a token; /health and other methods are not', () => {
    const exposed = { ...base, exposed: true }
    const tokened = { ...base, exposed: true, token: 'tok-123' }
    for (const cfg of [exposed, tokened, { ...base, token: 'tok-123' }]) {
      expect(checkRequest(req({ method: 'GET', url: '/healthz' }), cfg).ok).toBe(true)
      expect(checkRequest(req({ method: 'GET', url: '/healthz?x=1' }), cfg).ok).toBe(true)
      expect(checkRequest(req({ method: 'GET', url: '/health' }), cfg).ok).toBe(false)
      expect(checkRequest(req({ method: 'GET', url: '/healthz/' }), cfg).ok).toBe(false)
      expect(checkRequest(req({ method: 'GET', url: '/healthzz' }), cfg).ok).toBe(false)
      expect(checkRequest(req({ method: 'GET', url: '/x/healthz' }), cfg).ok).toBe(false)
      expect(checkRequest(req({ method: 'GET', url: '/' }), cfg).ok).toBe(false)
      for (const method of ['HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'get']) {
        expect(checkRequest(req({ method, url: '/healthz' }), cfg).ok, method).toBe(false)
      }
    }
    // the Host check still applies, so a rebinding hostname gets nothing, not even liveness
    expect(
      checkRequest(req({ method: 'GET', url: '/healthz', host: 'attacker.test' }), exposed),
    ).toMatchObject({ ok: false, status: 421 })
  })

  it('matches the Bearer scheme case-insensitively and nothing looser', () => {
    const cfg = { ...base, token: 's3cret-token' }
    for (const scheme of ['Bearer', 'bearer', 'BEARER', 'bEaReR']) {
      expect(checkRequest(req({ authorization: `${scheme} s3cret-token` }), cfg).ok).toBe(true)
    }
    expect(checkRequest(req({ authorization: 'bearer S3CRET-TOKEN' }), cfg).ok).toBe(false)
    expect(checkRequest(req({ authorization: 'Basic s3cret-token' }), cfg).ok).toBe(false)
    expect(checkRequest(req({ authorization: 'bearer  s3cret-token' }), cfg).ok).toBe(false)
  })

  it('reads settings from the environment and classifies bind addresses', () => {
    const cfg = readGuardConfig({
      LEARNING_HUB_ALLOWED_HOSTS: 'a.lan, b.lan',
      LEARNING_HUB_ALLOWED_ORIGINS: 'https://x.lan',
      LEARNING_HUB_EXTENSION_IDS: 'id1',
      LEARNING_HUB_API_TOKEN: ' tok ',
      LEARNING_HUB_ALLOW_UNAUTHENTICATED: '1',
      LEARNING_HUB_ALLOW_ANY_CONTENT_TYPE: 'true',
    })
    expect(cfg).toEqual({
      allowedHosts: ['a.lan', 'b.lan'],
      allowedOrigins: ['https://x.lan'],
      extensionIds: ['id1'],
      token: 'tok',
      allowUnauthenticated: true,
      allowAnyContentType: true,
    })
    expect(readGuardConfig({}).token).toBeUndefined()
    expect(readGuardConfig({ LEARNING_HUB_ALLOW_UNAUTHENTICATED: '0' }).allowUnauthenticated).toBe(
      false,
    )
    for (const h of ['127.0.0.1', 'localhost', '::1', '[::1]', '127.0.0.5']) {
      expect(isLoopbackBind(h)).toBe(true)
    }
    for (const h of ['0.0.0.0', '::', '192.168.1.5', 'desk.lan'])
      expect(isLoopbackBind(h)).toBe(false)
  })
})

interface Reply {
  status: number
  body: string
}

describe('server guard: over a real socket', () => {
  let server: Server
  let port: number
  const cfg: GuardConfig = { ...base }

  const send = (
    method: string,
    path: string,
    headers: Record<string, string>,
    payload?: string,
  ): Promise<Reply> =>
    new Promise((resolve, reject) => {
      const r = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
      })
      r.on('error', reject)
      r.end(payload)
    })

  beforeAll(async () => {
    server = createServer(
      withGuard((rq, rs) => {
        dispatch(rq, rs).catch(() => {
          if (!rs.writableEnded) rs.writeHead(500).end('{}')
        })
      }, cfg),
    )
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()))
    port = (server.address() as AddressInfo).port
  })
  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()))
  })

  const idea = JSON.stringify({ title: 'planted by a web page' })

  it('blocks a foreign-Origin write, JSON or text/plain, and creates nothing', async () => {
    const h = { Host: `127.0.0.1:${port}` }
    const before = JSON.parse((await send('GET', '/ideas', h)).body)
    const origin = 'https://evil.example'
    // a JSON body isolates the Origin check; text/plain is the preflight-free form a page can send
    const json = await send(
      'POST',
      '/ideas',
      { ...h, Origin: origin, 'Content-Type': 'application/json' },
      idea,
    )
    expect(json.status).toBe(403)
    const plain = await send(
      'POST',
      '/ideas',
      { ...h, Origin: origin, 'Content-Type': 'text/plain' },
      idea,
    )
    expect([403, 415]).toContain(plain.status)
    const after = JSON.parse((await send('GET', '/ideas', h)).body)
    expect(after).toEqual(before)
  })

  it('blocks a rebinding Host on reads and writes', async () => {
    const get = await send('GET', '/ideas', { Host: `attacker.test:${port}` })
    expect(get.status).toBe(421)
    expect(get.body).not.toContain('"ideas"')
    const post = await send('POST', '/ideas', { Host: `attacker.test:${port}` }, idea)
    expect(post.status).toBe(421)
  })

  it('refuses a non-JSON write body even with no Origin (415), serves JSON', async () => {
    const h = { Host: `127.0.0.1:${port}` }
    expect(
      (await send('POST', '/ideas', { ...h, 'Content-Type': 'text/plain' }, idea)).status,
    ).toBe(415)
    expect(
      (await send('POST', '/ideas', { ...h, 'Content-Type': 'application/json' }, idea)).status,
    ).toBeLessThan(300)
  })

  it('still serves a plain local client and a native-shell origin', async () => {
    const h = { Host: `127.0.0.1:${port}` }
    expect((await send('GET', '/health', h)).status).toBe(200)
    const native = { ...h, Origin: 'tauri://localhost', 'Content-Type': 'application/json' }
    expect((await send('POST', '/ideas', native, idea)).status).toBeLessThan(300)
  })

  it('exposed with no token: /healthz answers only {"ok":true}, everything else is 401', async () => {
    const saved = { ...cfg }
    Object.assign(cfg, { exposed: true, token: undefined, allowUnauthenticated: false })
    try {
      const h = { Host: `127.0.0.1:${port}` }
      const probe = await send('GET', '/healthz', h)
      expect(probe.status).toBe(200)
      expect(JSON.parse(probe.body)).toEqual({ ok: true })
      expect(Object.keys(JSON.parse(probe.body))).toEqual(['ok'])
      expect((await send('GET', '/health', h)).status).toBe(401)
      expect((await send('GET', '/plugins', h)).status).toBe(401)
      expect((await send('HEAD', '/healthz', h)).status).toBe(401)
      expect(
        (await send('POST', '/healthz', { ...h, 'Content-Type': 'application/json' }, '{}')).status,
      ).toBe(401)
      Object.assign(cfg, { token: 'tok-123' })
      expect((await send('GET', '/healthz', h)).status).toBe(200)
      expect((await send('GET', '/health', h)).status).toBe(401)
      expect((await send('GET', '/health', { ...h, Authorization: 'bearer tok-123' })).status).toBe(
        200,
      )
    } finally {
      for (const k of ['exposed', 'token', 'allowUnauthenticated'] as const) delete cfg[k]
      Object.assign(cfg, saved)
    }
  })

  it('answers 413 for a body over the limit (declared and chunked)', async () => {
    const h = { Host: `127.0.0.1:${port}`, 'Content-Type': 'application/json' }
    const big = JSON.stringify({ title: 'x'.repeat(1024 * 1024 + 10) })
    const declared = await send('POST', '/ideas', h, big)
    expect(declared.status).toBe(413)
    const chunked = await new Promise<Reply>((resolve) => {
      const r = request(
        {
          host: '127.0.0.1',
          port,
          method: 'POST',
          path: '/ideas',
          headers: { ...h, 'Transfer-Encoding': 'chunked' },
        },
        (res) => {
          let body = ''
          res.on('data', (c) => (body += c))
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }))
        },
      )
      r.on('error', () => resolve({ status: -1, body: '' }))
      r.write(big.slice(0, 600 * 1024))
      r.end(big.slice(600 * 1024))
    })
    // a reset after the refusal is acceptable; a 2xx is not
    expect([413, -1]).toContain(chunked.status)
  })
})
