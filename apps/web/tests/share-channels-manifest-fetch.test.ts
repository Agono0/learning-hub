/**
 * share-channels fetch-manifest must reach the host through the pinned outbound transport, not the
 * bare global fetch. Everything is injected: a stub stands in for the pinned fetch, and the global
 * fetch is replaced by a spy that fails the test if it is ever called. No network.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-sc-fetch-')), 'a.db')

type Handler = { POST: (req: Request) => Promise<Response> }
let route: Handler
let setPinnedFetch: typeof import('@/server/bounded-fetch').setPinnedFetch
let AddressRefusedError: typeof import('@/server/pinned-fetch-node').AddressRefusedError
let globalFetch: ReturnType<typeof vi.fn>

beforeAll(async () => {
  route = await import('../src/server/handlers/share-channels/route')
  ;({ setPinnedFetch } = await import('@/server/bounded-fetch'))
  ;({ AddressRefusedError } = await import('@/server/pinned-fetch-node'))
})
beforeEach(() => {
  globalFetch = vi.fn(async () => {
    throw new Error('the bare global fetch must not be used')
  })
  vi.stubGlobal('fetch', globalFetch)
})
afterEach(() => {
  setPinnedFetch(null)
  vi.unstubAllGlobals()
})

const call = () =>
  route.POST(
    new Request('http://localhost/api/share-channels', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'fetch-manifest',
        hostBaseUrl: 'https://hub.example.com',
        channelId: 'chan-1',
      }),
    }),
  )

describe('share-channels fetch-manifest transport', () => {
  it('goes through the registered pinned fetch and never the global fetch', async () => {
    const seen: string[] = []
    setPinnedFetch(async (url) => {
      seen.push(url)
      return new Response('{}', { status: 404 })
    })
    const res = await call()
    expect(seen).toHaveLength(1)
    expect(new URL(seen[0]!).hostname).toBe('hub.example.com')
    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ code: 'not-found' })
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('reports an address the pinned fetch refuses as a 502 and never falls back to the global fetch', async () => {
    let calls = 0
    setPinnedFetch(async () => {
      calls++
      throw new AddressRefusedError('The host resolves to a private or local address')
    })
    const res = await call()
    expect(res.status).toBe(502)
    expect(await res.json()).toMatchObject({ code: 'network' })
    expect(calls).toBeGreaterThanOrEqual(1) // the transport may retry network errors
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('fails closed on Node when pinning is not registered', async () => {
    setPinnedFetch(null)
    const res = await call()
    expect(res.status).toBe(502)
    expect(JSON.stringify(await res.json())).toMatch(/address pinning is not registered/)
    expect(globalFetch).not.toHaveBeenCalled()
  })
})
