/**
 * Tests for the calendar import feature (S3-27).
 *
 * - Handler `POST /api/calendar/import` invoked directly (it is a pure
 *   Request→Response function): body validation (https-only URL, kind enum),
 *   the fetch seam (stubbed global fetch — the handler is the one network
 *   hop, rule 1), honest 502 on unreachable feeds, and junk feeds resolving
 *   to empty collections (parser totality, rule 5).
 * - Device-local subscription store in `@/lib/calendar-feeds`: defaults,
 *   add/remove/update roundtrips, per-subscription feed cache, corrupted
 *   storage degrading to empty.
 * - SSR-safe render of `CalendarSubscriptions` (renderToString — storage
 *   reads are effect-only, so server markup matches hydration), plus the
 *   S3-42 sweep check that the section is MOUNTED on /planner and
 *   server-visible there.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as importRoute from '../src/server/handlers/calendar/import/route'
import {
  addSubscription,
  loadFeedCache,
  loadSubscriptions,
  putFeedCache,
  removeSubscription,
  updateSubscription,
} from '../src/lib/calendar-feeds'
import { CalendarSubscriptions } from '../src/components/CalendarSubscriptions'
import PlannerPage from '../app/planner/page'

/** Invoke the handler exactly like the App Router would (async-params shape). */
function postImport(body: unknown): Promise<Response> {
  const req = new Request('http://localhost:3000/api/calendar/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
  return importRoute.POST(req, undefined as never)
}

/** Parse a handler Response as the caller's expected JSON shape. */
async function json<T>(res: Response): Promise<T> {
  return (await res.json()) as T
}

const MINIMAL_ICS = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:import-1',
  'DTSTART;VALUE=DATE:20261220',
  'SUMMARY:Philosophy lecture',
  'END:VEVENT',
  'BEGIN:VTODO',
  'UID:import-2',
  'SUMMARY:Essay draft',
  'STATUS:NEEDS-ACTION',
  'PRIORITY:2',
  'END:VTODO',
  'END:VCALENDAR',
  '',
].join('\r\n')

/** Storage + window stub (updates-settings.test.ts pattern). */
function stubWindowStorage() {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { localStorage: storage })
  return store
}

describe('POST /api/calendar/import (handler)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches an https iCal feed and returns parsed events + todos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(MINIMAL_ICS, { status: 200 })),
    )
    const res = await postImport({ url: 'https://cal.example/basic.ics', kind: 'ical' })
    expect(res.status).toBe(200)
    const data = await json<{
      counts: { events: number; todos: number }
      events: Array<{ title: string }>
      todos: Array<{ status: string }>
    }>(res)
    expect(data.counts).toEqual({ events: 1, todos: 1 })
    expect(data.events[0].title).toBe('Philosophy lecture')
    expect(data.todos[0].status).toBe('needs-action')
  })

  it('rejects non-https URLs (calendar feeds are credentials-adjacent)', async () => {
    const res = await postImport({ url: 'http://cal.example/basic.ics' })
    expect(res.status).toBe(400)
  })

  it('rejects invalid bodies (missing url, unknown kind)', async () => {
    for (const body of [
      {},
      { url: 'not-a-url' },
      { url: 'https://ok.example/x.ics', kind: 'gopher' },
    ]) {
      const res = await postImport(body)
      expect(res.status).toBe(400)
    }
  })

  it('maps an unreachable feed to an honest 502 (not a crash)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom')
      }),
    )
    const res = await postImport({ url: 'https://down.example/x.ics' })
    expect(res.status).toBe(502)
    expect((await json<{ error: string }>(res)).error).toContain('could not be reached')
  })

  it('maps a non-ok feed status to the same honest 502', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    )
    const res = await postImport({ url: 'https://gone.example/x.ics' })
    expect(res.status).toBe(502)
  })

  it('a junk feed parses to empty collections (totality, rule 5)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>not a calendar</html>', { status: 200 })),
    )
    const res = await postImport({ url: 'https://weird.example/x.ics' })
    expect(res.status).toBe(200)
    expect((await json<{ counts: { events: number; todos: number } }>(res)).counts).toEqual({
      events: 0,
      todos: 0,
    })
  })
})

describe('device-local subscriptions (@/lib/calendar-feeds)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('empty by default; add/remove/update roundtrips', () => {
    stubWindowStorage()
    expect(loadSubscriptions()).toEqual([])
    const subs = addSubscription({ name: 'Course', url: 'https://cal.example/basic.ics' })
    expect(subs).toHaveLength(1)
    expect(subs[0].visible).toBe(true)
    expect(subs[0].kind).toBe('ical')
    expect(loadSubscriptions()).toEqual(subs)

    const patched = updateSubscription(subs[0].id, { visible: false, color: 'teal' })
    expect(patched[0].visible).toBe(false)
    expect(patched[0].color).toBe('teal')

    expect(removeSubscription(subs[0].id)).toEqual([])
    expect(loadSubscriptions()).toEqual([])
  })

  it('removing a subscription drops its cached snapshot too', () => {
    stubWindowStorage()
    const [sub] = addSubscription({ name: 'Gym', url: 'https://gym.example/feed.ics' })
    putFeedCache({
      subscriptionId: sub.id,
      events: [],
      todos: [],
      fetchedAt: '2026-11-22T00:00:00Z',
    })
    expect(loadFeedCache()).toHaveLength(1)
    removeSubscription(sub.id)
    expect(loadFeedCache()).toEqual([])
  })

  it('corrupted storage degrades to an empty list, never throws', () => {
    const store = stubWindowStorage()
    store.set('lh-calendar-subscriptions', 'not json at all')
    expect(loadSubscriptions()).toEqual([])
    store.set('lh-calendar-subscriptions', JSON.stringify([{ junk: true }]))
    expect(loadSubscriptions()).toEqual([])
  })

  it('unknown-id updates are no-ops', () => {
    stubWindowStorage()
    const subs = addSubscription({ name: 'A', url: 'https://a.example/x.ics' })
    expect(updateSubscription('nope', { visible: false })).toEqual(subs)
  })
})

/**
 * Never-resolving fetch: the planner's queries stay pending, render stays
 * deterministic (S3-42 house pattern).
 */
function stubPendingFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
}

describe('CalendarSubscriptions mounted on /planner (S3-42 sweep)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('the planner page renders the subscriptions section in server context', () => {
    stubPendingFetch()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const html = renderToString(
      React.createElement(QueryClientProvider, { client: qc }, React.createElement(PlannerPage)),
    )
    expect(html).toContain('Study planner')
    // The section is mounted unconditionally (S3-27): its header, the
    // honest empty state, and the add-form labels are all server-visible.
    expect(html).toContain('Calendar subscriptions')
    expect(html).toContain('No calendars yet')
    expect(html).toContain('Feed URL (https)')
    expect(html).toContain('Subscribe')
  })
})

describe('CalendarSubscriptions (SSR-safe)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the section with the honest empty state in server context', () => {
    const html = renderToString(React.createElement(CalendarSubscriptions))
    expect(html).toContain('calendar-subscriptions')
    expect(html).toContain('Calendar subscriptions')
    expect(html).toContain('No calendars yet')
    // Storage reads are effect-only: no subscription markup on the server.
    expect(html).not.toContain('Refresh')
  })
})
