import { beforeEach, describe, expect, it, vi } from 'vitest'
import worker from '../src/index'
import {
  CRASH_LIMITS,
  handleCrashTelemetry,
  makeIssueBody,
  makeIssueTitle,
  readBodyCapped,
  redactUrlCredentials,
  resetRateLimits,
  sanitizeCrashReport,
  crashReportSchema,
} from '../src/telemetry'
import { parseJoinParticipant, parseStatsSync } from '../src/validation'

const report = (over: Record<string, unknown> = {}) =>
  crashReportSchema.parse({ errorName: 'E', appVersion: '1', platform: 'web', ...over })

function post(url: string, body: BodyInit, headers: Record<string, string> = {}) {
  return new Request(url, { method: 'POST', body, headers })
}

describe('telemetry hardening', () => {
  beforeEach(() => resetRateLimits())

  it('redacts URL credentials linearly and keeps the host', () => {
    expect(redactUrlCredentials('see https://bob:hunter2@example.com/x ok')).toBe(
      'see https://bob:[REDACTED]@example.com/x ok',
    )
    expect(redactUrlCredentials('https://example.com/a@b:c')).toBe('https://example.com/a@b:c')
    // Many scheme markers and no @ at all: one pass, unchanged.
    const hostile = 'a://'.repeat(20000)
    expect(redactUrlCredentials(hostile)).toBe(hostile)
  })

  it('sanitizes every field, not only message and stack', () => {
    const s = sanitizeCrashReport(
      report({
        errorName: 'Err ghp_abcdefghijklmnopqrstuvwx',
        appVersion: 'password=hunter2',
        deviceAbi: 'Bearer abc.def',
      }),
    )
    expect(s.errorName).toContain('[REDACTED_GH_TOKEN]')
    expect(s.appVersion).toContain('[REDACTED]')
    expect(s.deviceAbi).toContain('[REDACTED]')
  })

  it('neutralizes mentions, backticks, HTML and fence breakouts in issue text', () => {
    const r = report({
      errorName: 'x`@octocat',
      errorMessage: '</code>@team #123 ``` ![i](http://x)',
      stack: 'a\n```\n@victim please\n```',
      component: '`c`',
      breadcrumbs: ['hey @everyone #5', { category: '`c`', message: '@all' }],
    })
    const title = makeIssueTitle(r.errorName, r.errorMessage)
    const body = makeIssueBody(r, 'f'.repeat(64))
    // Mentions inside a code fence do not notify; check everything outside the fence.
    const outside = body.replace(/```[\s\S]*?```/, '')
    expect(title).not.toMatch(/@[a-z]/)
    expect(title).not.toContain('`')
    expect(outside).not.toMatch(/@[a-z]/)
    expect(outside).not.toMatch(/#\d/)
    expect(body).not.toContain('</code>')
    // The only fences are the template's own two.
    expect(body.match(/```/g)?.length).toBe(2)
  })

  it('rejects oversized fields and too many breadcrumbs', () => {
    const big = 'a'.repeat(CRASH_LIMITS.stack + 1)
    expect(
      crashReportSchema.safeParse({ errorName: 'E', appVersion: '1', platform: 'web', stack: big })
        .success,
    ).toBe(false)
    expect(
      crashReportSchema.safeParse({
        errorName: 'E',
        appVersion: '1',
        platform: 'web',
        breadcrumbs: Array(CRASH_LIMITS.breadcrumbs + 1).fill('x'),
      }).success,
    ).toBe(false)
  })

  it('stops at the byte budget plus one bounded source chunk and cancels the stream', async () => {
    const CHUNK = 1024
    const CAP = 4096
    let pulled = 0
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(c) {
          pulled += CHUNK
          c.enqueue(new Uint8Array(CHUNK).fill(120))
          if (pulled > 10 * 1024 * 1024) c.close()
        },
        cancel() {
          cancelled = true
        },
      },
      { highWaterMark: 0 },
    )
    const req = new Request('http://w.local/x', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit)
    expect(await readBodyCapped(req, CAP)).toBeNull()
    expect(cancelled).toBe(true)
    // Budget is CAP; the first read past it is the one that trips the cap. The runtime may
    // have pulled one more chunk ahead, so allow at most two chunks over the budget.
    expect(pulled).toBeGreaterThan(CAP)
    expect(pulled).toBeLessThanOrEqual(CAP + 2 * CHUNK)
  })

  it('accepts a body of exactly the cap and refuses one byte more', async () => {
    const exact = 'a'.repeat(CRASH_LIMITS.bodyBytes)
    expect(await readBodyCapped(post('http://w.local', exact), CRASH_LIMITS.bodyBytes)).toBe(exact)
    expect(
      await readBodyCapped(post('http://w.local', exact + 'a'), CRASH_LIMITS.bodyBytes),
    ).toBeNull()
    expect(CRASH_LIMITS.bodyBytes).toBe(65536)
  })

  it('counts UTF-8 bytes, not characters', async () => {
    const text = '€'.repeat(2000) // 2000 chars, 6000 bytes
    expect(await readBodyCapped(post('http://w.local', text), 5000)).toBeNull()
    expect(await readBodyCapped(post('http://w.local', text), 6000)).toBe(text)
  })

  it('returns 413 for an oversized body (declared and undeclared) without creating issues', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    const env = { GITHUB_ISSUE_TOKEN: 't' }
    const big = JSON.stringify({
      errorName: 'E',
      appVersion: '1',
      platform: 'web',
      stack: 'a'.repeat(200_000),
    })
    const res = await handleCrashTelemetry(post('http://w.local/x', big), env)
    expect(res.status).toBe(413)
    const res2 = await handleCrashTelemetry(
      post('http://w.local/x', big, { 'content-length': '10' }),
      env,
    )
    expect(res2.status).toBe(413)
    expect(f).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('does not echo GitHub error text to the caller', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('SECRET-INTERNAL-DETAIL', { status: 500 })),
    )
    const res = await handleCrashTelemetry(
      post(
        'http://w.local/x',
        JSON.stringify({ errorName: 'E', appVersion: '1', platform: 'web' }),
      ),
      { GITHUB_ISSUE_TOKEN: 't' },
    )
    expect(await res.text()).not.toContain('SECRET-INTERNAL-DETAIL')
    vi.unstubAllGlobals()
  })
})

describe('stats and join validation', () => {
  const ok = { userId: 'usr_abc-1', alias: 'Ada', weeklyXp: 10, streak: 2, level: 3 }

  it('accepts a normal payload', () => {
    expect(parseStatsSync(ok).ok).toBe(true)
  })

  it.each([
    ['null', null],
    ['array', []],
    ['bad id', { ...ok, userId: 'a b' }],
    ['long id', { ...ok, userId: 'a'.repeat(65) }],
    ['alias number', { ...ok, alias: 5 }],
    ['blank alias', { ...ok, alias: '  ' }],
    ['string xp', { ...ok, weeklyXp: '10' }],
    ['float xp', { ...ok, weeklyXp: 1.5 }],
    ['negative xp', { ...ok, weeklyXp: -1 }],
    ['huge xp', { ...ok, weeklyXp: 1e12 }],
    ['NaN streak', { ...ok, streak: Number.NaN }],
    ['level 0', { ...ok, level: 0 }],
  ])('refuses %s instead of clamping', (_n, v) => {
    expect(parseStatsSync(v).ok).toBe(false)
  })

  it('stats/sync returns 400 for invalid and never reaches the DB', async () => {
    const run = vi.fn()
    const env = { DB: { prepare: () => ({ bind: () => ({ run }) }) } } as never
    const res = await worker.fetch(
      post('http://w.local/api/v1/stats/sync', JSON.stringify({ ...ok, weeklyXp: 1e12 })),
      env,
    )
    expect(res.status).toBe(400)
    const bad = await worker.fetch(post('http://w.local/api/v1/stats/sync', '{not json'), env)
    expect(bad.status).toBe(400)
    expect(run).not.toHaveBeenCalled()
  })

  it('returns a generic 500 without internal error text', async () => {
    const env = {
      DB: {
        prepare: () => {
          throw new Error('D1_ERROR: table public_stats has secret column')
        },
      },
    } as never
    const res = await worker.fetch(
      post('http://w.local/api/v1/stats/sync', JSON.stringify(ok)),
      env,
    )
    expect(res.status).toBe(500)
    expect(await res.text()).not.toContain('D1_ERROR')
  })

  it('validates join participants', () => {
    const p = { id: 'usr_1', alias: 'Ada', status: 'studying', streak: 1, cardsReviewed: 2 }
    expect(parseJoinParticipant(p).ok).toBe(true)
    // Status values come from the shared participant schema: studying | break | idle.
    for (const status of ['studying', 'break', 'idle']) {
      expect(parseJoinParticipant({ ...p, status }).ok).toBe(true)
    }
    expect(parseJoinParticipant({ ...p, status: 'away' }).ok).toBe(false)
    for (const bad of [
      null,
      { ...p, id: '<x>' },
      { ...p, alias: 'a'.repeat(201) },
      { ...p, status: 'x' },
      { ...p, streak: -1 },
      { ...p, avatar: 'a'.repeat(17) },
      { ...p, cardsReviewed: 'many' },
    ]) {
      expect(parseJoinParticipant(bad).ok).toBe(false)
    }
  })
})
