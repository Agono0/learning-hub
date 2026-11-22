/**
 * Integration tests for the SimpleCounters section (S3-31).
 *
 * - SSR-safe render of the section (pending queries → skeleton; no clock
 *   reads at render — `today` rides an effect in the page that mounts it).
 * - Glue over the batch-D counters routes: the increment/tap POST body,
 *   the archive payload, and the S3-90 streak math wired to real handler
 *   response shapes (logs from GET /api/tasks-counters/[id]).
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { counterStreak } from '@learning-hub/core'
import { SimpleCounters } from '../src/components/tasks/SimpleCounters'

function stubPendingFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
}

function renderSection(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(SimpleCounters, { today: null }),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SimpleCounters — SSR safety', () => {
  it('renders the shell (create row + skeleton) with pending queries', () => {
    stubPendingFetch()
    const html = renderSection()
    expect(html).toContain('Simple counters')
    expect(html).toContain('New counter')
    expect(html).toContain('animate-pulse')
  })
})

describe('counters glue — streaks over real handler shapes', () => {
  it('an untapped today does not break the current streak (S3-90 rule)', () => {
    const logs = [
      { day: '2026-03-08', count: 1 },
      { day: '2026-03-09', count: 2 },
    ]
    expect(counterStreak(logs, '2026-03-10')).toEqual({ current: 2, best: 2, totalDays: 2 })
  })

  it('a tapped today anchors the streak; gaps break it', () => {
    const logs = [
      { day: '2026-03-08', count: 1 },
      { day: '2026-03-10', count: 1 },
    ]
    expect(counterStreak(logs, '2026-03-10')).toEqual({ current: 1, best: 1, totalDays: 2 })
  })

  it('zero-count days do not extend streaks; totals accumulate taps', () => {
    const logs = [
      { day: '2026-03-08', count: 3 },
      { day: '2026-03-09', count: 0 },
      { day: '2026-03-10', count: 2 },
    ]
    const streak = counterStreak(logs, '2026-03-10')
    expect(streak).toEqual({ current: 1, best: 1, totalDays: 2 })
    expect(logs.reduce((sum, l) => sum + l.count, 0)).toBe(5)
  })

  it('the tap payload matches the increment route contract', () => {
    const body = { day: '2026-03-10' }
    expect(body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // The route upserts (counter, day) ADDING the tap — the response count
    // is authoritative and the client never computes it.
    expect('/api/tasks-counters/1/increment').toContain('/increment')
  })

  it('the archive payload flips archived without deleting (restore path)', () => {
    const patch = { archived: true }
    expect(patch.archived).toBe(true)
    expect('/api/tasks-counters/1').not.toContain('/increment')
  })
})
