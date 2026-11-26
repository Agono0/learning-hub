import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  dispatchWebhook,
  postDigestSummary,
  postJson,
  type WebhookTarget,
} from '../../../apps/server/src/webhooks'

/**
 * Operator webhook and digest POSTs never follow a redirect: every 3xx is logged as non-delivery
 * with the status and the Location HOST only (no full URL), and the body is always cancelled.
 * Everything is injected (fetch is a stub, console is spied), no network.
 */
const URL_SECRET = 'https://hooks.example.com/services/T0/B0/very-secret-token?sig=abc#frag'
const target: WebhookTarget = { event: 'review.completed', url: URL_SECRET }
const LOCATION = 'https://elsewhere.example.net:8443/private/path?token=xyz'

function reply(status: number, headers: Record<string, string> = {}) {
  const state = { cancelled: false }
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      c.enqueue(new Uint8Array(1024))
    },
    cancel() {
      state.cancelled = true
    },
  })
  const nullBody = status === 204 || status === 304
  return { state, res: new Response(nullBody ? null : body, { status, headers }) }
}

afterEach(() => vi.restoreAllMocks())

const logs = () => {
  const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
  return () => [...err.mock.calls, ...warn.mock.calls, ...log.mock.calls].flat().join('\n')
}

describe('postJson', () => {
  it.each([301, 302, 303, 307, 308])(
    'reports %i as a redirect and never follows it',
    async (status) => {
      const { res, state } = reply(status, { location: LOCATION })
      const calls: RequestInit[] = []
      const out = await postJson(
        URL_SECRET,
        { a: 1 },
        {
          timeoutMs: 1000,
          fetchFn: async (_u, init) => {
            calls.push(init!)
            return res
          },
        },
      )
      expect(out).toEqual({ kind: 'redirect', status, locationHost: 'elsewhere.example.net:8443' })
      expect(calls).toHaveLength(1)
      expect(calls[0]!.redirect).toBe('manual')
      expect(calls[0]!.method).toBe('POST')
      expect(state.cancelled).toBe(true)
    },
  )

  it('handles a missing or unparseable Location and a relative one', async () => {
    const run = async (headers: Record<string, string>) =>
      postJson(
        'https://h.example.com/x',
        {},
        {
          timeoutMs: 1000,
          fetchFn: async () => reply(302, headers).res,
        },
      )
    expect(await run({})).toMatchObject({ locationHost: 'none' })
    expect(await run({ location: 'http://[bad' })).toMatchObject({ locationHost: 'unparseable' })
    expect(await run({ location: '/moved' })).toMatchObject({ locationHost: 'h.example.com' })
  })

  it('keeps success and failure semantics for non-3xx and cancels the body', async () => {
    for (const [status, ok] of [
      [200, true],
      [204, true],
      [400, false],
      [404, false],
      [500, false],
      [503, false],
    ] as const) {
      const { res, state } = reply(status)
      const out = await postJson(URL_SECRET, {}, { timeoutMs: 1000, fetchFn: async () => res })
      expect(out, String(status)).toEqual({ kind: 'response', status, ok })
      if (status !== 204) expect(state.cancelled, String(status)).toBe(true)
    }
  })
})

describe('dispatchWebhook', () => {
  it.each([301, 302, 303, 307, 308])(
    '%i is logged as non-delivery without the full URL',
    async (status) => {
      const out = logs()
      await dispatchWebhook(target, { a: 1 }, async () => reply(status, { location: LOCATION }).res)
      const text = out()
      expect(text).toContain(`responded ${status} redirect to elsewhere.example.net:8443`)
      expect(text).toContain('not delivered')
      for (const secret of [
        'very-secret-token',
        'sig=abc',
        '/private/path',
        'token=xyz',
        'hooks.example.com',
      ]) {
        expect(text, secret).not.toContain(secret)
      }
    },
  )

  it('keeps the existing logs: 2xx silent, 4xx and 5xx logged with the URL, network error logged', async () => {
    let out = logs()
    await dispatchWebhook(target, {}, async () => reply(200).res)
    expect(out()).toBe('')
    vi.restoreAllMocks()
    out = logs()
    await dispatchWebhook(target, {}, async () => reply(503).res)
    expect(out()).toContain(`review.completed → ${URL_SECRET} responded 503`)
    vi.restoreAllMocks()
    out = logs()
    await dispatchWebhook(target, {}, async () => {
      throw new Error('boom')
    })
    expect(out()).toContain('delivery failed')
  })
})

describe('postDigestSummary', () => {
  it('logs a redirect as non-delivery, a 2xx and a 5xx as before, and continues to the next target', async () => {
    const out = logs()
    const seen: string[] = []
    const answers = [reply(307, { location: LOCATION }).res, reply(200).res, reply(500).res]
    const targets: WebhookTarget[] = [
      { event: 'review.completed', url: 'https://a.example.com/x?k=1' },
      { event: 'review.completed', url: 'https://b.example.com/y' },
      { event: 'review.completed', url: 'https://c.example.com/z' },
    ]
    await postDigestSummary(targets, { kind: 'weekly-digest' }, async (u) => {
      seen.push(u)
      return answers.shift()!
    })
    expect(seen).toEqual(targets.map((t) => t.url))
    const text = out()
    expect(text).toContain('not delivered: 307 redirect to elsewhere.example.net:8443')
    expect(text).not.toContain('k=1')
    expect(text).not.toContain('/private/path')
    expect(text).toContain('[digest] https://b.example.com/y → 200')
    expect(text).toContain('[digest] https://c.example.com/z → 500')
  })
})
