/**
 * YouTube ingest transport: both fetches are bounded and pinned, the caption URL from the page
 * gets no extra trust, and failures are fixed generic text. Synthetic fetchers only; no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setPinnedFetch } from '../src/server/bounded-fetch'

const createSource = vi.fn((v: Record<string, unknown>) => ({ id: 1, ...v }))
vi.mock('@learning-hub/db', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  createSource: (v: Record<string, unknown>) => createSource(v),
}))

import { POST } from '../src/server/handlers/reading/ingest/route'

const VIDEO = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
const watchPage = (baseUrl: string) =>
  `<html><head><title>Lecture - YouTube</title></head><body><script>var x={"captionTracks":[{"baseUrl":${JSON.stringify(baseUrl)},"languageCode":"en"}]}</script></body></html>`
const captionXml = `<?xml version="1.0"?><transcript><text start="0" dur="2">Hello world, this is a spaced repetition lecture.</text><text start="2" dur="2">Retrieval practice beats rereading.</text></transcript>`

let calls: Array<{ url: string; redirect?: string }>
function install(routes: (url: string) => Response) {
  setPinnedFetch(async (u, init) => {
    calls.push({ url: u, redirect: init?.redirect })
    return routes(u)
  })
}
const post = () =>
  POST(
    new Request('http://localhost/api/reading/ingest', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'youtube', url: VIDEO }),
    }),
  )

beforeEach(() => {
  calls = []
  createSource.mockClear()
})
afterEach(() => setPinnedFetch(null))

describe('youtube ingest transport', () => {
  it('fetches the page and the caption through the pinned transport with manual redirects', async () => {
    const cap = 'https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&lang=en'
    install((u) => new Response(u.includes('timedtext') ? captionXml : watchPage(cap)))
    const res = await post()
    expect(res.status).toBe(200)
    expect(calls.map((c) => c.url)).toEqual([`${VIDEO}&hl=en`, cap])
    expect(calls.every((c) => c.redirect === 'manual')).toBe(true)
    expect(createSource).toHaveBeenCalledOnce()
  })

  it('also accepts other https caption hosts (no host allowlist that could break captions)', async () => {
    const cap = 'https://video.google.com/timedtext?lang=en&v=dQw4w9WgXcQ'
    install((u) => new Response(u.includes('timedtext') ? captionXml : watchPage(cap)))
    expect((await post()).status).toBe(200)
  })

  it.each([
    ['a private address', 'https://10.0.0.5/timedtext'],
    ['loopback', 'https://127.0.0.1/timedtext'],
    ['link-local metadata', 'https://169.254.169.254/latest/meta-data'],
    ['a plain http URL', 'http://www.youtube.com/api/timedtext?v=x'],
    ['credentials in the URL', 'https://user:pw@www.youtube.com/api/timedtext'],
    ['a local name', 'https://printer.local/timedtext'],
  ])('refuses a caption URL naming %s before any request to it', async (_n, cap) => {
    install((u) => new Response(u.includes('watch') ? watchPage(cap) : captionXml))
    const res = await post()
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).toMatch(/refused for safety/)
    expect(text).not.toContain(cap)
    expect(calls).toHaveLength(1) // only the watch page was requested
    expect(createSource).not.toHaveBeenCalled()
  })

  it('refuses a redirect from the caption URL to a private address', async () => {
    const cap = 'https://www.youtube.com/api/timedtext?v=x'
    install((u) =>
      u.includes('watch')
        ? new Response(watchPage(cap))
        : new Response(null, { status: 302, headers: { location: 'https://192.168.1.10/x' } }),
    )
    const res = await post()
    expect(res.status).toBe(502)
    expect(calls.map((c) => c.url)).toEqual([`${VIDEO}&hl=en`, cap])
  })

  it('refuses an oversized watch page and an oversized caption with 413, no partial import', async () => {
    install(() => new Response('x'.repeat(5 * 1024 * 1024 + 1)))
    expect((await post()).status).toBe(413)
    calls = []
    const cap = 'https://www.youtube.com/api/timedtext?v=x'
    install((u) =>
      u.includes('watch')
        ? new Response(watchPage(cap))
        : new Response('y'.repeat(2 * 1024 * 1024 + 1)),
    )
    expect((await post()).status).toBe(413)
    expect(createSource).not.toHaveBeenCalled()
  })

  it('failures are fixed text that never echoes a URL or an error message', async () => {
    setPinnedFetch(async () => {
      throw new Error('connect ECONNREFUSED 10.1.2.3:443 secret-host.internal')
    })
    const res = await post()
    expect(res.status).toBe(502)
    const text = await res.text()
    expect(text).toMatch(/Could not fetch the YouTube page/)
    expect(text).not.toMatch(/ECONNREFUSED|10\.1\.2\.3|secret-host/)
  })

  it('with no pinned transport registered on Node, nothing is fetched (fail closed)', async () => {
    setPinnedFetch(null)
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    const res = await post()
    expect(res.status).toBe(502)
    expect(spy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
