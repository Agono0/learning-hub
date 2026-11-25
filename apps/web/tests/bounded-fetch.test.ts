/**
 * Bounded outbound fetch (synthetic stubs only; no network): scheme, private
 * destinations, redirect handling, byte cap with stream cancellation, timeout.
 * Plus the three handlers that use it.
 */
import { describe, expect, it, vi, afterEach } from 'vitest'
import { assertAllowedUrl, boundedFetchText, BoundedFetchError } from '../src/server/bounded-fetch'
import * as importRoute from '../src/server/handlers/calendar/import/route'
import * as ingestRoute from '../src/server/handlers/reading/ingest/route'
import * as readingRoute from '../src/server/handlers/reading/route'

afterEach(() => vi.unstubAllGlobals())

const ok = (body: string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init })
const redirect = (to: string) => new Response(null, { status: 302, headers: { location: to } })
const base = { maxBytes: 1000, timeoutMs: 2000 }

describe('assertAllowedUrl', () => {
  it.each([
    'http://example.com/a',
    'ftp://example.com/a',
    'file:///etc/passwd',
    'https://user:pw@example.com/',
    'https://localhost/x',
    'https://foo.localhost/x',
    'https://printer.local/x',
    'https://svc.internal/x',
    'https://intranet/x',
    'https://127.0.0.1/x',
    'https://0x7f.1/x',
    'https://2130706433/x',
    'https://10.1.2.3/x',
    'https://172.16.0.9/x',
    'https://172.31.255.1/x',
    'https://192.168.1.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://100.64.0.1/x',
    'https://0.0.0.0/x',
    'https://[::1]/x',
    'https://[fd00::1]/x',
    'https://[fe80::1]/x',
    'https://[::ffff:127.0.0.1]/x',
    'https://[::ffff:7f00:1]/x',
  ])('refuses %s', (u) => {
    expect(() => assertAllowedUrl(u)).toThrow(BoundedFetchError)
  })
  it.each(['https://example.com/a', 'https://172.32.0.1/x', 'https://8.8.8.8/x'])(
    'allows %s',
    (u) => {
      expect(assertAllowedUrl(u).href).toContain('https://')
    },
  )
  it('allows plain http only when asked', () => {
    expect(() => assertAllowedUrl('http://example.com/')).toThrow()
    expect(assertAllowedUrl('http://example.com/', true).protocol).toBe('http:')
  })
})

describe('boundedFetchText', () => {
  it('returns the body and sends redirect: manual', async () => {
    const fetchFn = vi.fn(async (_u: string, _i?: RequestInit) => ok('hello'))
    const r = await boundedFetchText('https://example.com/f', { ...base, fetchFn })
    expect(r).toMatchObject({ ok: true, text: 'hello', bytes: 5 })
    expect(fetchFn.mock.calls[0]![1]).toMatchObject({ redirect: 'manual' })
  })

  it('follows an allowed redirect and refuses one into a private host', async () => {
    const good = vi.fn(async (u: string) =>
      u.endsWith('/a') ? redirect('https://cdn.example.com/b') : ok('final'),
    )
    expect((await boundedFetchText('https://example.com/a', { ...base, fetchFn: good })).text).toBe(
      'final',
    )

    const bad = vi.fn(async () => redirect('https://169.254.169.254/latest/meta-data'))
    await expect(
      boundedFetchText('https://example.com/a', { ...base, fetchFn: bad }),
    ).rejects.toMatchObject({
      code: 'blocked',
    })
    expect(bad).toHaveBeenCalledTimes(1) // the private hop was never requested
  })

  it('refuses an https to http downgrade redirect and a redirect loop', async () => {
    const down = vi.fn(async () => redirect('http://example.com/x'))
    await expect(
      boundedFetchText('https://example.com/a', { ...base, fetchFn: down }),
    ).rejects.toMatchObject({
      code: 'blocked',
    })
    const loop = vi.fn(async () => redirect('https://example.com/a'))
    await expect(
      boundedFetchText('https://example.com/a', { ...base, fetchFn: loop, maxRedirects: 2 }),
    ).rejects.toMatchObject({ code: 'too-many-redirects' })
    expect(loop).toHaveBeenCalledTimes(3)
  })

  it('caps by bytes, not characters, and cancels the stream', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(400))
      },
      cancel() {
        cancelled = true
      },
    })
    const fetchFn = async () => new Response(stream, { status: 200 })
    await expect(
      boundedFetchText('https://example.com/big', { ...base, fetchFn }),
    ).rejects.toMatchObject({
      code: 'too-large',
    })
    expect(cancelled).toBe(true)
    // 3-byte characters: 400 of them are 1200 bytes, over a 1000-byte cap although only 400 characters.
    const multi = async () => ok('€'.repeat(400))
    await expect(
      boundedFetchText('https://example.com/m', { ...base, fetchFn: multi }),
    ).rejects.toMatchObject({
      code: 'too-large',
    })
  })

  it('refuses on a declared content-length without reading the body', async () => {
    const fetchFn = async () => ok('x', { headers: { 'content-length': '999999' } })
    await expect(
      boundedFetchText('https://example.com/c', { ...base, fetchFn }),
    ).rejects.toMatchObject({
      code: 'too-large',
    })
  })

  it('times out a stalled body read', async () => {
    const stalled = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) })
    const fetchFn = async (_u: string, init?: RequestInit) => {
      void init
      return new Response(stalled, { status: 200 })
    }
    await expect(
      boundedFetchText('https://example.com/s', { maxBytes: 1000, timeoutMs: 50, fetchFn }),
    ).rejects.toMatchObject({ code: 'timeout' })
  }, 4000)

  it('reports a non-ok status without a body', async () => {
    const fetchFn = async () => new Response('nope', { status: 404 })
    expect(await boundedFetchText('https://example.com/x', { ...base, fetchFn })).toMatchObject({
      ok: false,
      status: 404,
    })
  })
})

function postJson(route: { POST: (r: Request, c: never) => Promise<Response> }, body: unknown) {
  return route.POST(
    new Request('http://localhost/api/x', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    undefined as never,
  )
}

describe('handlers use the bound', () => {
  it('calendar import refuses private hosts (400) and never calls fetch', async () => {
    const f = vi.fn(async () => ok('BEGIN:VCALENDAR\nEND:VCALENDAR'))
    vi.stubGlobal('fetch', f)
    const res = await postJson(importRoute, { url: 'https://192.168.0.5/cal.ics' })
    expect(res.status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })

  it('calendar import refuses an oversized feed (413)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok('x', { headers: { 'content-length': String(11 * 1024 * 1024) } })),
    )
    const res = await postJson(importRoute, { url: 'https://example.com/cal.ics' })
    expect(res.status).toBe(413)
  })

  it('calendar import does not follow a redirect to a private host', async () => {
    const f = vi.fn(async () => redirect('https://127.0.0.1:8080/secret.ics'))
    vi.stubGlobal('fetch', f)
    const res = await postJson(importRoute, { url: 'https://example.com/cal.ics' })
    expect(res.status).toBe(400)
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('reading ingest url mode refuses a private host and an oversized page', async () => {
    const f = vi.fn(async () => ok('<html></html>'))
    vi.stubGlobal('fetch', f)
    expect(
      (await postJson(ingestRoute, { mode: 'url', url: 'http://169.254.169.254/' })).status,
    ).toBe(400)
    expect(f).not.toHaveBeenCalled()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok('x', { headers: { 'content-length': String(6 * 1024 * 1024) } })),
    )
    expect(
      (await postJson(ingestRoute, { mode: 'url', url: 'https://example.com/a' })).status,
    ).toBe(413)
  })

  it('http is allowed for article ingest only (preserved), never for calendar import', async () => {
    const f = vi.fn(async () => ok('<html><body><p>short</p></body></html>'))
    vi.stubGlobal('fetch', f)
    const art = await postJson(ingestRoute, { mode: 'url', url: 'http://example.com/post' })
    expect(art.status).not.toBe(400) // reached the fetch; a tiny page is a 422 for content, not a refusal
    expect(f).toHaveBeenCalledTimes(1)
    f.mockClear()
    const cal = await postJson(importRoute, { url: 'http://example.com/cal.ics' })
    expect(cal.status).toBe(400)
    expect(f).not.toHaveBeenCalled()
  })

  it('reading upload refuses a declared oversized multipart body (413)', async () => {
    const res = await readingRoute.POST(
      new Request('http://localhost/api/reading', {
        method: 'POST',
        headers: {
          'content-type': 'multipart/form-data; boundary=x',
          'content-length': String(60 * 1024 * 1024),
        },
        body: '--x--',
      }),
      undefined as never,
    )
    expect(res.status).toBe(413)
  })
})
