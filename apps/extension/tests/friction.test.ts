/**
 * Friction capture decision table (F-10): a navigation during an active Max
 * Focus session to a BLOCKED domain produces exactly one friction event; every
 * other case records nothing. The builder mirrors the /api/friction contract
 * (proceeded:false needs no reflection; trigger 'distraction').
 */
import { describe, expect, it } from 'vitest'
import { buildFrictionReport, decideFriction } from '../src/friction'
import type { StoredLock } from '../src/state'

const NOW = Date.parse('2026-11-09T12:00:00.000Z')
const SESSION_END = '2026-11-09T13:00:00.000Z'

const lock = (overrides: Partial<StoredLock> = {}): StoredLock => ({
  active: true,
  endsAt: SESSION_END,
  domains: ['wikipedia.org', 'canvas.instructure.com'],
  ...overrides,
})

describe('friction capture decision table (F-10)', () => {
  it('records a blocked attempt on a blocked domain (exact host)', () => {
    const d = decideFriction(lock(), 'https://youtube.com/watch?v=x', NOW)
    expect(d.record).toBe(true)
    expect(d.payload).toEqual({
      trigger: 'distraction',
      proceeded: false,
      delaySec: 0,
      domain: 'youtube.com',
    })
  })

  it('records a blocked attempt on a subdomain of a non-allowlisted domain', () => {
    const d = decideFriction(lock(), 'https://m.twitter.com/home', NOW)
    expect(d.record).toBe(true)
    expect(d.payload?.domain).toBe('m.twitter.com')
  })

  it('records a blocked attempt on www-stripped www.news.ycombinator.com', () => {
    const d = decideFriction(lock(), 'https://www.news.ycombinator.com/item', NOW)
    expect(d.record).toBe(true)
    expect(d.payload?.domain).toBe('news.ycombinator.com')
  })

  it('ignores navigations when no session is active', () => {
    expect(decideFriction(null, 'https://youtube.com/', NOW).reason).toBe('not-in-session')
    expect(decideFriction({ ...lock(), active: false }, 'https://youtube.com/', NOW).reason).toBe(
      'not-in-session',
    )
  })

  it('ignores navigations after the session expired', () => {
    const late = NOW + 61 * 60 * 1000
    expect(decideFriction(lock(), 'https://youtube.com/', late).reason).toBe('session-expired')
    expect(decideFriction({ ...lock(), endsAt: null }, 'https://youtube.com/', NOW).reason).toBe(
      'session-expired',
    )
  })

  it('ignores allowed domains (the user is permitted to work there)', () => {
    expect(decideFriction(lock(), 'https://wikipedia.org/', NOW).reason).toBe('domain-not-blocked')
    expect(
      decideFriction(lock(), 'https://en.wikipedia.org/wiki/Spaced_repetition', NOW).reason,
    ).toBe('domain-not-blocked')
    expect(decideFriction(lock(), 'https://canvas.instructure.com/courses', NOW).reason).toBe(
      'domain-not-blocked',
    )
    // not-wikipedia.org is NOT on the allowlist
    expect(decideFriction(lock(), 'https://not-wikipedia.org/', NOW).record).toBe(true)
  })

  it('ignores loopback pages and non-http schemes (app connectivity stays friction-free)', () => {
    expect(decideFriction(lock(), 'http://localhost:3000/review', NOW).reason).toBe('loopback-page')
    expect(decideFriction(lock(), 'http://127.0.0.1:47615/v1/lock', NOW).reason).toBe(
      'loopback-page',
    )
    expect(decideFriction(lock(), 'chrome-extension://abc/blocked.html', NOW).reason).toBe(
      'loopback-page',
    )
    expect(decideFriction(lock(), 'not a url', NOW).reason).toBe('loopback-page')
  })

  it('builder shapes the POST /api/friction body per the handler contract', () => {
    const d = decideFriction(lock(), 'https://www.youtube.com/watch', NOW)
    if (!d.record || !d.payload) throw new Error('expected a record decision')
    const req = buildFrictionReport({ ...d, record: true, payload: d.payload })
    expect(req.path).toBe('/api/friction')
    expect(req.body).toEqual({
      trigger: 'distraction',
      proceeded: false,
      delaySec: 0,
      reflection: 'Extension blocked attempt: youtube.com',
    })
  })
})
