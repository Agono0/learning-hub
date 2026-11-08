/**
 * The worker↔main outbound network bridge (AI provider traffic under Tauri):
 * a bridged fetch must behave like fetch — streamed bodies, HTTP errors as
 * responses, transport errors as rejections, AbortSignal honored.
 */
import { describe, expect, it } from 'vitest'
import { createBridgedFetch, type NetBridge } from '@/hub/net-bridge'
import type { HubNetFromWorker, HubNetToWorker } from '@/hub/protocol'
import { remoteFetch, setRemoteFetch } from '../src/server/net'

/** Wire a bridge to a fake "main thread" that answers with `script`. */
function harness(
  script: (
    req: Extract<HubNetFromWorker, { type: 'net-request' }>,
    reply: (m: HubNetToWorker) => void,
  ) => void,
) {
  const sent: HubNetFromWorker[] = []
  const bridge: NetBridge = createBridgedFetch((message) => {
    sent.push(message)
    if (message.type === 'net-request')
      queueMicrotask(() => script(message, (m) => bridge.handle(m)))
  })
  return { bridge, sent }
}

const enc = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer

describe('net bridge', () => {
  it('streams a response body assembled from chunks', async () => {
    const { bridge, sent } = harness((req, reply) => {
      reply({
        type: 'net-head',
        id: req.id,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'text/plain' },
      })
      reply({ type: 'net-chunk', id: req.id, bytes: enc('hel') })
      reply({ type: 'net-chunk', id: req.id, bytes: enc('lo') })
      reply({ type: 'net-end', id: req.id })
    })
    const res = await bridge.fetch('https://api.example.com/v1', {
      method: 'POST',
      headers: { 'x-api-key': 'k' },
      body: JSON.stringify({ a: 1 }),
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/plain')
    expect(await res.text()).toBe('hello')
    const req = sent[0] as Extract<HubNetFromWorker, { type: 'net-request' }>
    expect(req).toMatchObject({
      type: 'net-request',
      url: 'https://api.example.com/v1',
      method: 'POST',
    })
    expect(req.headers['x-api-key']).toBe('k')
    expect(new TextDecoder().decode(req.body)).toBe('{"a":1}')
  })

  it('surfaces HTTP errors as responses (not rejections), like fetch', async () => {
    const { bridge } = harness((req, reply) => {
      reply({ type: 'net-head', id: req.id, status: 401, statusText: 'Unauthorized', headers: {} })
      reply({ type: 'net-chunk', id: req.id, bytes: enc('{"error":"bad key"}') })
      reply({ type: 'net-end', id: req.id })
    })
    const res = await bridge.fetch('https://api.example.com')
    expect(res.ok).toBe(false)
    expect(await res.json()).toEqual({ error: 'bad key' })
  })

  it('rejects with a TypeError on transport failure before headers', async () => {
    const { bridge } = harness((req, reply) =>
      reply({ type: 'net-error', id: req.id, message: 'dns failure' }),
    )
    await expect(bridge.fetch('https://nowhere.invalid')).rejects.toThrow(/dns failure/)
  })

  it('errors the body stream on failure mid-stream', async () => {
    const { bridge } = harness((req, reply) => {
      reply({ type: 'net-head', id: req.id, status: 200, statusText: 'OK', headers: {} })
      reply({ type: 'net-chunk', id: req.id, bytes: enc('partial') })
      reply({ type: 'net-error', id: req.id, message: 'connection reset' })
    })
    const res = await bridge.fetch('https://api.example.com')
    await expect(res.text()).rejects.toThrow(/connection reset/)
  })

  it('honors AbortSignal and tells the host to cancel', async () => {
    const { bridge, sent } = harness(() => {
      /* host never answers */
    })
    const controller = new AbortController()
    const pending = bridge.fetch('https://slow.example.com', { signal: controller.signal })
    await Promise.resolve()
    controller.abort()
    await expect(pending).rejects.toThrow(/Abort/)
    expect(sent.some((m) => m.type === 'net-abort')).toBe(true)
  })
})

// ── Handler-level outbound port (F-07) ─────────────────────────────────────
// On web the port's default impl IS global fetch (pass-through); under the hub
// worker, worker.ts installs the SAME bridged fetch the AI adapters use, so
// online/social calls are webview-CORS-free.

describe('handler remoteFetch port (F-07: native CORS-free bridge)', () => {
  it('passes through to global fetch on the web target (default impl)', async () => {
    // data: URL — no network, proves the default impl is plain fetch.
    const res = await remoteFetch('data:text/plain,hello-port')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('hello-port')
  })

  it('routes through an injected impl — the hub worker installs the native bridge here', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    setRemoteFetch((url, init) => {
      calls.push({ url, init })
      return Promise.resolve(new Response('bridged', { status: 200 }))
    })
    try {
      const res = await remoteFetch('https://worker.example.com/api/v1/rooms/ABCD/info', {
        signal: AbortSignal.timeout(4000),
      })
      expect(await res.text()).toBe('bridged')
      expect(calls).toHaveLength(1)
      expect(calls[0].url).toBe('https://worker.example.com/api/v1/rooms/ABCD/info')
    } finally {
      // Restore the web default (global fetch pass-through).
      setRemoteFetch((url, init) => fetch(url, init))
    }
  })
})
