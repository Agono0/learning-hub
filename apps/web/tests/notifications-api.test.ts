/**
 * /api/notifications/prefs + /api/notifications/log against an isolated temp
 * database: the policy round-trips through the pure parser, the ledger is
 * append-only, and the daily-cap counter respects the caller's tz offset.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

process.env.LEARNING_HUB_DB = join(mkdtempSync(join(tmpdir(), 'lh-notification-center-')), 'api.db')

let prefsH: typeof import('@/server/handlers/notifications/prefs/route')
let logH: typeof import('@/server/handlers/notifications/log/route')

beforeAll(async () => {
  prefsH = await import('@/server/handlers/notifications/prefs/route')
  logH = await import('@/server/handlers/notifications/log/route')
})

const put = (body: unknown) => ({
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})
const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

describe('GET /api/notifications/prefs', () => {
  it('returns defaults derived from the catalog + the decision-reason map', async () => {
    const res = await prefsH.GET(new Request('http://localhost/api/notifications/prefs'))
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      ok: boolean
      prefs: Record<string, unknown>
      channels: Record<string, unknown>
      decisionReasons: Record<string, string>
      deliveredToday: number
    }
    expect(data.ok).toBe(true)
    expect(data.prefs.masterEnabled).toBe(true)
    expect(Object.keys(data.channels).length).toBeGreaterThanOrEqual(10)
    expect(data.decisionReasons.suppress_quiet_hours).toContain('Quiet hours')
    expect(data.deliveredToday).toBe(0)
  })

  it('counts delivered-only entries for the client calendar day (tz-aware)', async () => {
    // Compute the client's local-day bounds (UTC+2 ⇒ offset -120) around NOW,
    // then log entries just inside and outside them.
    const { localDayBoundsIso } = await import('@learning-hub/core/notification-center')
    const now = new Date()
    const bounds = localDayBoundsIso(-120, now)
    const inside = new Date(new Date(bounds.dayStartIso).getTime() + 3.6e6).toISOString()
    const suppressedInside = new Date(new Date(bounds.dayStartIso).getTime() + 7.2e6).toISOString()
    const outside = new Date(new Date(bounds.dayStartIso).getTime() - 3.6e6).toISOString()

    await logH.POST(
      new Request(
        'http://localhost/api/notifications/log',
        post({
          channel: 'review_due',
          title: 'Reviews ready',
          body: '5 cards',
          actionUrl: null,
          decision: 'deliver',
          createdAt: inside, // local today early morning → counts
        }),
      ),
    )
    await logH.POST(
      new Request(
        'http://localhost/api/notifications/log',
        post({
          channel: 'break_reminder',
          title: 'Break time',
          body: '',
          actionUrl: null,
          decision: 'suppress_quiet_hours',
          createdAt: suppressedInside, // held → does NOT count
        }),
      ),
    )
    await logH.POST(
      new Request(
        'http://localhost/api/notifications/log',
        post({
          channel: 'streak_saver',
          title: 'Streak at risk',
          body: '',
          actionUrl: null,
          decision: 'deliver',
          createdAt: outside, // yesterday local → does NOT count
        }),
      ),
    )

    const res = await prefsH.GET(
      new Request('http://localhost/api/notifications/prefs?tzOffset=-120'),
    )
    const data = (await res.json()) as { deliveredToday: number }
    expect(data.deliveredToday).toBe(1)
  })
})

describe('PUT /api/notifications/prefs', () => {
  it('round-trips a full policy and re-derives on next GET', async () => {
    const current = (await (
      await prefsH.GET(new Request('http://localhost/api/notifications/prefs'))
    ).json()) as { prefs: Record<string, unknown> }
    const next = {
      ...current.prefs,
      masterEnabled: true,
      dailyCap: 5,
      doNotDisturbUntil: '2026-01-20T08:00:00.000Z',
      quietHours: { enabled: false, start: '23:00', end: '07:00' },
      channels: {
        ...(current.prefs.channels as Record<string, unknown>),
        review_due: { enabled: false, viaOs: false },
        achievement: { enabled: true, viaOs: true },
      },
    }
    const res = await prefsH.PUT(new Request('http://localhost/api/notifications/prefs', put(next)))
    expect(res.status).toBe(200)
    const saved = (await res.json()) as {
      prefs: {
        dailyCap: number
        quietHours: { enabled: boolean }
        channels: Record<string, { enabled: boolean; viaOs: boolean }>
      }
    }
    expect(saved.prefs.dailyCap).toBe(5)
    expect(saved.prefs.quietHours.enabled).toBe(false)
    expect(saved.prefs.channels.review_due).toEqual({ enabled: false, viaOs: false })
    expect(saved.prefs.channels.achievement).toEqual({ enabled: true, viaOs: true })

    const refetched = (await (
      await prefsH.GET(new Request('http://localhost/api/notifications/prefs'))
    ).json()) as { prefs: typeof saved.prefs }
    expect(refetched.prefs).toEqual(saved.prefs)
  })

  it('rejects malformed policies with 400 and a stable envelope', async () => {
    const res = await prefsH.PUT(
      new Request('http://localhost/api/notifications/prefs', put({ dailyCap: 999 })),
    )
    expect(res.status).toBe(400)
    const data = (await res.json()) as { error: string; detail: unknown }
    expect(data.error).toContain('Invalid')
    expect(data.detail).toBeDefined() // zod issues surface as detail
  })
})

describe('/api/notifications/log', () => {
  it('returns newest-first history including suppressed decisions', async () => {
    const res = await logH.GET(new Request('http://localhost/api/notifications/log?limit=10'))
    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      ok: boolean
      entries: Array<{ decision: string; createdAt: string }>
    }
    expect(data.ok).toBe(true)
    expect(data.entries.length).toBeGreaterThanOrEqual(3)
    const times = data.entries.map((e) => e.createdAt)
    expect([...times].sort().reverse()).toEqual(times)
    expect(data.entries.some((e) => e.decision.startsWith('suppress_'))).toBe(true)
  })

  it('validates the ledger entry (400 on unknown channel / bad decision)', async () => {
    const bad = await logH.POST(
      new Request(
        'http://localhost/api/notifications/log',
        post({
          channel: 'not_a_channel',
          title: 'x',
          body: '',
          actionUrl: null,
          decision: 'deliver',
          createdAt: '2026-01-15T10:00:00.000Z',
        }),
      ),
    )
    expect(bad.status).toBe(400)

    const badDecision = await logH.POST(
      new Request(
        'http://localhost/api/notifications/log',
        post({
          channel: 'review_due',
          title: 'x',
          body: '',
          actionUrl: null,
          decision: 'yolo',
          createdAt: '2026-01-15T10:00:00.000Z',
        }),
      ),
    )
    expect(badDecision.status).toBe(400)
  })

  it('ledger is append-only at the API level (no PUT/DELETE exposure)', async () => {
    const mod = await import('@/server/handlers/notifications/log/route')
    expect('PUT' in mod).toBe(false)
    expect('DELETE' in mod).toBe(false)
  })
})
