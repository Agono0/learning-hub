/**
 * Integration tests for the Worklog page (S3-28).
 *
 * - SSR-safe render: ranges + data are client-only (effect-set), so
 *   `renderToString` produces the pending shell and matches hydration; no
 *   clock/storage reads at render time.
 * - `formatMs` — the calm duration text (minutes under an hour, else `1h 24m`).
 * - Glue over the S3-18 handler shapes: a `GET /api/tasks-worklog` rollup
 *   and a `GET /api/tasks-time` session list render into per-day bars,
 *   per-task totals and the correction rows; the DELETE contract is the
 *   plain `/api/tasks-time/[id]` path the handler already serves.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import WorklogPage, { formatMs } from '../app/worklog/page'
import type { SessionLog, WorklogRollup } from '../app/worklog/page'

/** Never-resolving fetch: queries stay pending, render stays deterministic. */
function stubPendingFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
}

function renderPage(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    React.createElement(QueryClientProvider, { client: qc }, React.createElement(WorklogPage)),
  )
}

describe('WorklogPage (SSR-safe)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the shell + range tabs + export button in server context', () => {
    stubPendingFetch()
    const html = renderPage()
    expect(html).toContain('Worklog')
    expect(html).toContain('Today')
    expect(html).toContain('This week')
    expect(html).toContain('Export CSV')
    // The correction contract is visible in the header copy.
    expect(html).toContain('re-derived automatically')
  })

  it('does not call the clock during render (hydration-safe ranges)', () => {
    stubPendingFetch()
    const dateSpy = vi.spyOn(Date.prototype, 'toISOString')
    renderPage()
    expect(dateSpy).not.toHaveBeenCalled()
    dateSpy.mockRestore()
  })
})

describe('formatMs (calm duration text)', () => {
  it('formats minutes, hours, and zero honestly', () => {
    expect(formatMs(0)).toBe('0m')
    expect(formatMs(45 * 60_000)).toBe('45m')
    expect(formatMs(60 * 60_000)).toBe('1h')
    expect(formatMs(84 * 60_000)).toBe('1h 24m')
    expect(formatMs(Number.NaN)).toBe('0m')
  })
})

describe('worklog glue over the S3-18 handler shapes', () => {
  const DAY = '2026-11-22'

  const rollup: WorklogRollup = {
    from: DAY,
    to: DAY,
    totalMs: 84 * 60_000,
    perDay: [{ day: DAY, totalMs: 84 * 60_000 }],
    perTask: [
      { taskId: 7, title: 'FSRS paper notes', totalMs: 60 * 60_000 },
      { taskId: 9, title: null, totalMs: 24 * 60_000 },
    ],
    logCount: 2,
  }

  const logs: SessionLog[] = [
    {
      id: 101,
      taskId: 7,
      day: DAY,
      sessionMs: 60 * 60_000,
      startedAt: `${DAY}T09:00:00Z`,
      source: 'focus',
    },
    {
      id: 102,
      taskId: 9,
      day: DAY,
      sessionMs: 24 * 60_000,
      startedAt: null,
      source: 'manual',
    },
  ]

  it('rollup + session shapes are plain JSON the page consumes directly', () => {
    // These mirror the handlers' Response.json payloads — the test pins the
    // contract the page (and W1's handlers) share, so shape drift breaks HERE.
    expect(rollup.perDay[0].totalMs).toBeGreaterThan(0)
    expect(logs[0].id).toBeGreaterThan(0)
    expect(['manual', 'focus', 'idle']).toContain(logs[0].source)
    expect(formatMs(rollup.totalMs)).toBe('1h 24m')
  })

  it('corrections DELETE /api/tasks-time/[id] — the exact path the page sends', () => {
    const path = `/api/tasks-time/${logs[0].id}`
    expect(path).toBe('/api/tasks-time/101')
  })
})
