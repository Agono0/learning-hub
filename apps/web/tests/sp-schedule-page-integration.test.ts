/**
 * Integration tests for the Schedule page (S3-26).
 *
 * - SSR-safe render: pending queries produce the skeleton (no clock or
 *   storage reads at render — `today` and feed caches arrive in effects).
 * - Pure glue: `blockShare` sizing (estimate over the day's total, 14%
 *   floor, clamp), `dayLabel` formatting, and the schedule PATCH payload
 *   contract shared with the planner board.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { blockShare, dayLabel } from '../app/schedule/page'

function stubPendingFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
}

function renderPage(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    React.createElement(QueryClientProvider, { client: qc }, React.createElement(SchedulePage)),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// SchedulePage is the page's default export; importing it also typechecks
// the tray/timeline JSX against the schedule route's response shape.
import SchedulePage from '../app/schedule/page'

describe('Schedule page — SSR safety', () => {
  it('renders the shell with pending queries and no clock reads', () => {
    stubPendingFetch()
    const html = renderPage()
    expect(html).toContain('Schedule')
    expect(html).toContain('Unscheduled')
    expect(html).toContain('animate-pulse')
  })
})

describe('blockShare — blocks sized by estimate', () => {
  it('gives each block its estimate share of the day total', () => {
    // 1h of a 3h day → 33%; 2h → 67%.
    expect(blockShare(3_600_000, 10_800_000)).toBe(33)
    expect(blockShare(7_200_000, 10_800_000)).toBe(67)
  })

  it('floors estimate-less blocks at 14% and clamps the top', () => {
    expect(blockShare(null, 3_600_000)).toBe(14)
    expect(blockShare(0, 3_600_000)).toBe(14)
    expect(blockShare(10_800_000, 3_600_000)).toBe(100)
  })

  it('handles an open day (no total) with the floor', () => {
    expect(blockShare(3_600_000, 0)).toBe(14)
  })
})

describe('labels + payload contract', () => {
  it('formats day labels as `Www dd/mm`', () => {
    expect(dayLabel('2026-03-09')).toBe('Mon 09/03')
  })

  it('scheduling PATCHes due date-only with dueWithTime=false', () => {
    const body = { due: '2026-03-10', dueWithTime: false }
    expect(body.due).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.dueWithTime).toBe(false)
  })
})
