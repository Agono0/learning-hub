import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  dispatchWebhook,
  parseWebhookSpec,
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
      expect(text).toContain('not delivered: https://hooks.example.com responded')
      for (const secret of ['very-secret-token', 'sig=abc', '/private/path', 'token=xyz']) {
        expect(text, secret).not.toContain(secret)
      }
    },
  )

  it('keeps the existing logs: 2xx silent, 4xx and 5xx logged with the origin, network error logged', async () => {
    let out = logs()
    await dispatchWebhook(target, {}, async () => reply(200).res)
    expect(out()).toBe('')
    vi.restoreAllMocks()
    out = logs()
    await dispatchWebhook(target, {}, async () => reply(503).res)
    expect(out()).toContain('review.completed → https://hooks.example.com responded 503')
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
    expect(text).toContain(
      'not delivered: https://a.example.com responded 307 redirect to elsewhere.example.net:8443',
    )
    expect(text).not.toContain('k=1')
    expect(text).not.toContain('/private/path')
    expect(text).toContain('[digest] https://b.example.com → 200')
    expect(text).toContain('[digest] https://c.example.com → 500')
  })
})

/**
 * Logs name a target by origin only. The URL below carries a secret in userinfo, path, query and
 * fragment; no log line on any path may contain any part of it.
 */
const SECRET_URL =
  'https://hookuser:pa55w0rd-xyz@hooks.example.com:9443/services/T0/B0/very-secret-token?sig=abc123&k=sekret#frag-secret'
const SECRET_PARTS = [
  'hookuser',
  'pa55w0rd-xyz',
  '/services',
  'very-secret-token',
  'abc123',
  'sekret',
  'frag-secret',
  'T0/B0',
]
const secretTarget: WebhookTarget = { event: 'review.completed', url: SECRET_URL }
const expectClean = (text: string) => {
  expect(text).not.toBe('')
  for (const part of SECRET_PARTS) expect(text, part).not.toContain(part)
  expect(text).toContain('https://hooks.example.com:9443')
}
/** An error the way a transport can raise it: message and cause both repeat the URL. */
const leakyError = () =>
  Object.assign(
    new Error(`connect ECONNREFUSED ${SECRET_URL} (path /services/T0/B0/very-secret-token)`),
    {
      cause: new Error(`inner ${SECRET_URL} token=very-secret-token`),
    },
  )

describe('no log line carries any part of a secret-bearing URL', () => {
  const leakyLocation = {
    location: 'https://hookuser:pa55w0rd-xyz@next.example.org/very-secret-token?sig=abc123',
  }
  const cases: [string, () => Promise<Response>][] = [
    ['404', async () => reply(404).res],
    ['503', async () => reply(503).res],
    ['redirect', async () => reply(307, leakyLocation).res],
    [
      'network error',
      async () => {
        throw leakyError()
      },
    ],
  ]

  it.each(cases)('dispatchWebhook %s', async (_name, fetchFn) => {
    const out = logs()
    await dispatchWebhook(secretTarget, {}, fetchFn)
    expectClean(out())
  })

  it.each(cases)('postDigestSummary %s', async (_name, fetchFn) => {
    const out = logs()
    await postDigestSummary([secretTarget], {}, fetchFn)
    expectClean(out())
  })

  it('a 2xx digest line names the origin only', async () => {
    const out = logs()
    await postDigestSummary([secretTarget], {}, async () => reply(200).res)
    expectClean(out())
  })

  it('parseWebhookSpec warnings never echo a URL, even for a malformed or unknown entry', () => {
    const out = logs()
    parseWebhookSpec(
      [
        '=https://h.example.com/very-secret-token?sig=abc123',
        'https://hookuser:pa55w0rd-xyz@h.example.com/very-secret-token?sig=abc123',
        'nosuchevent=https://h.example.com/very-secret-token',
        'review.completed=',
      ].join(','),
    )
    const text = out()
    expect(text).not.toBe('')
    for (const part of ['hookuser', 'pa55w0rd-xyz', 'very-secret-token', 'abc123']) {
      expect(text, part).not.toContain(part)
    }
  })

  it('an unparseable URL is logged as a placeholder, not echoed', async () => {
    const out = logs()
    await dispatchWebhook(
      { event: 'review.completed', url: 'not a url secret-zzz' },
      {},
      async () => {
        throw new Error('bad url not a url secret-zzz')
      },
    )
    const text = out()
    expect(text).toContain('invalid-url')
    expect(text).not.toContain('secret-zzz')
  })
})
