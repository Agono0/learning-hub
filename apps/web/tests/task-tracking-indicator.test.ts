/**
 * Tracked-task indicator (S3-77 UI) — minute math and SSR rendering. The
 * tracked-title half ships as useTrackedTitle (S3-43); this pins the
 * on-surface chip.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import {
  TrackedTaskIndicator,
  spentTodayMs,
  wholeMinutes,
} from '../src/components/tasks/TrackedTaskIndicator'

const TODAY = '2026-11-22'

describe('minute math', () => {
  it('reads only today\u2019s entry from the per-day map', () => {
    expect(spentTodayMs({ '2026-11-21': 500_000, [TODAY]: 120_000 }, TODAY)).toBe(120_000)
    expect(spentTodayMs({}, TODAY)).toBe(0)
  })

  it('rounds to whole minutes (any tracked time counts as 1m)', () => {
    expect(wholeMinutes(30_000)).toBe(1)
    expect(wholeMinutes(90_000)).toBe(2)
    expect(wholeMinutes(0)).toBe(0)
  })
})

describe('rendering', () => {
  it('renders the pulsing chip with spent minutes while tracking', () => {
    const html = renderToString(
      React.createElement(TrackedTaskIndicator, {
        tracking: true,
        timeSpentOnDay: { [TODAY]: 120_000 },
        today: TODAY,
      }),
    ).replace(/<!-- -->/g, '')
    expect(html).toContain('tracking 2m')
    expect(html).toContain('animate-pulse')
  })

  it('renders nothing when not tracking (calm rows)', () => {
    expect(
      renderToString(
        React.createElement(TrackedTaskIndicator, {
          tracking: false,
          timeSpentOnDay: { [TODAY]: 120_000 },
          today: TODAY,
        }),
      ),
    ).toBe('')
  })
})
