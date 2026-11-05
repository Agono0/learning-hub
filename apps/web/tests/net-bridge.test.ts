/**
 * The worker↔main outbound network bridge (AI provider traffic under Tauri):
 * a bridged fetch must behave like fetch — streamed bodies, HTTP errors as
 * responses, transport errors as rejections, AbortSignal honored.
 */
import { describe, expect, it } from 'vitest'
import { createBridgedFetch, type NetBridge } from '@/hub/net-bridge'
import type { HubNetFromWorker, HubNetToWorker } from '@/hub/protocol'

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
