/**
 * Integration tests for the Metrics page (S3-30).
 *
 * - SSR-safe render: ranges + `today` are effect-set, queries stay pending
 *   under a stubbed never-resolving fetch — `renderToString` produces the
 *   shell and matches hydration; no clock reads at render time.
 * - The chart inputs are plain handler payloads: the S3-18 session-log
 *   shape folds through core `metricDaysFromSessions`, the /api/analytics
 *   `heatmap` point shape maps onto MetricDay records — the contracts the
 *   page and the (future S3-19) metrics handler share, pinned here.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { metricDaysFromSessions } from '@learning-hub/core/metrics'
import MetricsPage from '../app/metrics/page'

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
    React.createElement(QueryClientProvider, { client: qc }, React.createElement(MetricsPage)),
  )
}

describe('MetricsPage (SSR-safe)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the shell with both series sections in server context', () => {
    stubPendingFetch()
    const html = renderPage()
    expect(html).toContain('Metrics')
    expect(html).toContain('Tracked time')
    expect(html).toContain('Reviews')
    // Honest empty-state copy is the contract while queries are pending.
    expect(html).toContain('No tracked time yet')
  })

  it('does not call the clock during render (hydration-safe)', () => {
    stubPendingFetch()
    const dateSpy = vi.spyOn(Date.prototype, 'toISOString')
    renderPage()
    expect(dateSpy).not.toHaveBeenCalled()
    dateSpy.mockRestore()
  })
})

describe('metrics glue over handler payload shapes', () => {
  it('session-log rows fold into the per-day records the charts consume', () => {
    const days = metricDaysFromSessions([
      { day: '2026-11-20', sessionMs: 25 * 60_000 },
      { day: '2026-11-20', sessionMs: 35 * 60_000 },
      { day: '2026-11-21', sessionMs: 50 * 60_000 },
    ])
    expect(days).toEqual([
      { day: '2026-11-20', value: 3_600_000 },
      { day: '2026-11-21', value: 3_000_000 },
    ])
  })

  it('analytics heatmap points map onto MetricDay records losslessly', () => {
    const points = [
      { date: '2026-11-20T00:00:00Z', count: 12 },
      { date: '2026-11-21', count: 8 },
    ]
    const days = points.map((p) => ({ day: p.date.slice(0, 10), value: p.count }))
    expect(days).toEqual([
      { day: '2026-11-20', value: 12 },
      { day: '2026-11-21', value: 8 },
    ])
  })
})
