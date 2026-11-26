/**
 * Connect-time pinning (no external network): a loopback test server stands in for the
 * "public" host, with a stubbed resolver that maps a made-up name to it.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http from 'node:http'
import zlib from 'node:zlib'
import type { AddressInfo } from 'node:net'
import { createPinnedLookup, createPinnedNodeFetch } from '../src/server/pinned-fetch-node'
import { boundedFetchText, isPrivateAddress, setPinnedFetch } from '../src/server/bounded-fetch'

let server: http.Server
let port = 0
const seen: { host: string | undefined; url: string | undefined }[] = []

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seen.push({ host: req.headers.host, url: req.url })
    if (req.url === '/gz') {
      res.writeHead(200, { 'content-encoding': 'gzip' })
      res.end(zlib.gzipSync(Buffer.from('a'.repeat(100_000))))
      return
    }
    if (req.url === '/redir') {
      res.writeHead(302, { location: 'https://example.org/next' })
      res.end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain' })
    res.end('hello')
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  port = (server.address() as AddressInfo).port
})
afterAll(() => {
  setPinnedFetch(null)
  server.close()
})

const lookupOf = (answers: { address: string; family: number }[], allowAll = false) =>
  createPinnedLookup({
    resolve: async () => answers,
    isAllowedAddress: allowAll ? () => true : undefined,
  })

function runLookup(l: ReturnType<typeof createPinnedLookup>, all: boolean) {
  return new Promise<{ err: Error | null; address?: unknown; family?: number }>((resolve) => {
    l('example.test', { all }, (err, address, family) => resolve({ err, address, family }))
  })
}

describe('isPrivateAddress', () => {
  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '192.168.5.5',
    '169.254.1.1',
    '::1',
    'fd12::1',
    'fe80::2',
    '::ffff:127.0.0.1',
    '::ffff:a00:1',
  ])('private: %s', (a) => expect(isPrivateAddress(a)).toBe(true))
  it.each(['8.8.8.8', '93.184.216.34', '2606:4700::1111', '::ffff:808:808'])('public: %s', (a) =>
    expect(isPrivateAddress(a)).toBe(false),
  )
})

describe('pinned lookup', () => {
  it('returns every answer when all public, in order, for both call shapes', async () => {
    const answers = [
      { address: '93.184.216.34', family: 4 },
      { address: '2606:4700::1111', family: 6 },
    ]
    const l = lookupOf(answers)
    expect((await runLookup(l, true)).address).toEqual(answers)
    const single = await runLookup(l, false)
    expect(single.address).toBe('93.184.216.34')
    expect(single.family).toBe(4)
  })

  it('refuses when ANY answer is private (mixed, mapped, loopback, link-local)', async () => {
    for (const bad of [
      '127.0.0.1',
      '::1',
      '::ffff:7f00:1',
      '169.254.169.254',
      'fd00::5',
      '10.9.9.9',
    ]) {
      const l = lookupOf([
        { address: '93.184.216.34', family: 4 },
        { address: bad, family: bad.includes(':') ? 6 : 4 },
      ])
      const r = await runLookup(l, true)
      expect(r.err?.message).toMatch(/private or local/)
    }
  })

  it('refuses an empty answer', async () => {
    expect((await runLookup(lookupOf([]), true)).err).toBeTruthy()
  })
})

describe('pinned fetch', () => {
  it('connects to the resolved address and keeps the original Host header', async () => {
    seen.length = 0
    const f = createPinnedNodeFetch({
      resolve: async () => [{ address: '127.0.0.1', family: 4 }],
      isAllowedAddress: () => true, // the stand-in server is loopback
    })
    const res = await f(`http://pinned.test:${port}/path?q=1`)
    expect(await res.text()).toBe('hello')
    expect(seen[0]).toEqual({ host: `pinned.test:${port}`, url: '/path?q=1' })
  })

  it('by default refuses to connect to a name that resolves to loopback, without any request', async () => {
    seen.length = 0
    const f = createPinnedNodeFetch({ resolve: async () => [{ address: '127.0.0.1', family: 4 }] })
    await expect(f(`http://evil.test:${port}/`)).rejects.toThrow(/private or local/)
    expect(seen).toHaveLength(0)
  })

  it('refuses a private IP literal (no DNS involved) without any request', async () => {
    seen.length = 0
    const f = createPinnedNodeFetch()
    await expect(f(`http://127.0.0.1:${port}/`)).rejects.toThrow(/private or local/)
    expect(seen).toHaveLength(0)
  })

  it('does not follow redirects and decompresses as a stream', async () => {
    const f = createPinnedNodeFetch({
      resolve: async () => [{ address: '127.0.0.1', family: 4 }],
      isAllowedAddress: () => true,
    })
    const r = await f(`http://pinned.test:${port}/redir`)
    expect(r.status).toBe(302)
    expect(r.headers.get('location')).toBe('https://example.org/next')
    const g = await f(`http://pinned.test:${port}/gz`)
    expect((await g.text()).length).toBe(100_000)
  })

  it('rejects unsupported methods and a pre-aborted signal', async () => {
    const f = createPinnedNodeFetch({
      resolve: async () => [{ address: '127.0.0.1', family: 4 }],
      isAllowedAddress: () => true,
    })
    await expect(f(`http://pinned.test:${port}/`, { method: 'POST' })).rejects.toThrow(TypeError)
    await expect(
      f(`http://pinned.test:${port}/`, { signal: AbortSignal.abort() }),
    ).rejects.toBeTruthy()
  })

  it('the byte cap applies to the DECOMPRESSED size and a pinned failure never falls back', async () => {
    const pinned = createPinnedNodeFetch({
      resolve: async () => [{ address: '127.0.0.1', family: 4 }],
      isAllowedAddress: () => true,
    })
    setPinnedFetch(pinned)
    // 100 kB inflated from a tiny gzip body exceeds a 10 kB cap.
    await expect(
      boundedFetchText(`http://pinned.test:${port}/gz`, {
        allowHttp: true,
        maxBytes: 10_000,
        timeoutMs: 3000,
      }),
    ).rejects.toMatchObject({ code: 'too-large' })

    let globalCalled = false
    const g = globalThis.fetch
    globalThis.fetch = (async () => {
      globalCalled = true
      return new Response('x')
    }) as typeof fetch
    try {
      setPinnedFetch(
        createPinnedNodeFetch({ resolve: async () => [{ address: '10.0.0.5', family: 4 }] }),
      )
      await expect(
        boundedFetchText('https://public.example.test/x', { maxBytes: 1000, timeoutMs: 3000 }),
      ).rejects.toBeInstanceOf(Error)
      expect(globalCalled).toBe(false)
    } finally {
      globalThis.fetch = g
    }
  })
})
