/**
 * Tracking-reminder dialog (S3-51) — the untracked-set math (counters not
 * logged today, metric keys missing from the day row) and SSR of the dialog
 * (rows + taps, all-clear state). The tap wire path is the counters
 * increment handler's contract.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  TrackingReminderDialog,
  filterUntracked,
  untrackedMetricKeys,
} from '../src/components/tasks/TrackingReminderDialog'

const TODAY = '2026-11-22'

const counters = [
  { id: 1, label: 'Water' },
  { id: 2, label: 'Push-ups' },
  { id: 3, label: 'Reading' },
]

const dialog = (props: {
  counters?: typeof counters
  metricKeys?: string[]
  dayMetrics?: Record<string, number>
}): string =>
  renderToString(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(TrackingReminderDialog, {
        open: true,
        onClose: () => {},
        day: TODAY,
        counters: props.counters ?? counters,
        metricKeys: props.metricKeys,
        dayMetrics: props.dayMetrics,
      }),
    ),
  ).replace(/<!-- -->/g, '')

describe('filterUntracked', () => {
  it('drops counters already logged today', () => {
    expect(filterUntracked(counters, new Set([2])).map((c) => c.id)).toEqual([1, 3])
    expect(filterUntracked(counters, new Set([1, 2, 3]))).toEqual([])
  })
})

describe('untrackedMetricKeys', () => {
  it('keeps keys the day row is missing', () => {
    expect(untrackedMetricKeys(['focus_ms', 'water'], { focus_ms: 100 })).toEqual(['water'])
    expect(untrackedMetricKeys(['focus_ms'], { focus_ms: 0 })).toEqual([]) // present ≠ missing
  })
})

describe('TrackingReminderDialog rendering', () => {
  it('lists untracked counters with a tap action', () => {
    const html = dialog({})
    expect(html).toContain('Not tracked yet today')
    expect(html).toContain('Water')
    expect(html).toContain('Push-ups')
    expect(html).toContain('+1 tap')
  })

  it('lists missing metric keys', () => {
    expect(dialog({ metricKeys: ['focus_ms'], dayMetrics: {} }).length).toBeGreaterThan(0)
    const html = dialog({ counters: [], metricKeys: ['focus_ms'], dayMetrics: {} })
    expect(html).toContain('Metrics')
    expect(html).toContain('focus_ms')
    expect(html).toContain('Not today')
  })

  it('shows the honest all-clear when everything is logged', () => {
    const html = dialog({ counters: [], metricKeys: [], dayMetrics: {} })
    expect(html).toContain('Nothing to chase')
  })
})
