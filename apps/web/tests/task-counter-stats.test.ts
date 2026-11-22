/**
 * Counter stats panel (S3-31 UI) — the sparkline window math, streak badges
 * (core counterStreak), the tap affordance, and the honest empty state.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  CounterStatsPanel,
  sparkline,
  sparklineFrom,
  type CounterRow,
} from '../src/components/tasks/CounterStatsPanel'

const TODAY = '2026-11-22'

const counters: CounterRow[] = [
  { id: 1, label: 'Water', color: null, archived: false },
  { id: 2, label: 'Archived one', color: null, archived: true },
]

const day = (offset: number, count = 1): { day: string; count: number } => ({
  day: new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + offset * 86_400_000)
    .toISOString()
    .slice(0, 10),
  count,
})

const panel = (
  logsByCounter: Record<number, { day: string; count: number }[]> = {},
  countersIn: CounterRow[] = counters,
): string =>
  renderToString(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(CounterStatsPanel, {
        counters: countersIn,
        logsByCounter,
        today: TODAY,
      }),
    ),
  ).replace(/<!-- -->/g, '')

describe('sparkline', () => {
  it('returns a 14-day window with normalized fills', () => {
    const bars = sparkline([day(0, 3), day(-1, 1)], TODAY)
    expect(bars).toHaveLength(14)
    expect(bars[13]).toBeCloseTo(0.6) // 3 taps of the 5-tap scale
    expect(bars[12]).toBeCloseTo(0.2)
    expect(bars[0]).toBe(0)
  })

  it('window start is 13 days back', () => {
    expect(sparklineFrom(TODAY)).toBe('2026-11-09')
  })
})

describe('CounterStatsPanel rendering', () => {
  it('renders streak badges and taps over live counters only', () => {
    const html = panel({ 1: [day(0), day(-1), day(-2)] })
    expect(html).toContain('Water')
    expect(html).toContain('3d streak')
    expect(html).toContain('best 3d')
    expect(html).toContain('+1')
    expect(html).not.toContain('Archived one')
  })

  it('shows the honest empty state without counters', () => {
    expect(panel({}, [])).toContain('No counters yet')
  })
})
