/**
 * Focus-mode picker (S3-32 UI / S3-80 / S3-34) — SSR rendering: strategy
 * chips, flowtime/countdown guidance copy, and the honest no-estimate hint.
 * The strategy math is core-tested (tasks-focus-modes.test.ts).
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { strategyFocusMinutes } from '../src/components/tasks/FocusModePicker'
import { FocusModePicker } from '../src/components/tasks/FocusModePicker'

const TODAY = '2026-11-22'

const picker = (
  boundTask: { estimateMs: number | null; timeSpentOnDay: Record<string, number> } | null,
): string =>
  renderToString(
    React.createElement(FocusModePicker, {
      today: TODAY,
      boundTask,
      onApplyMinutes: () => {},
    }),
  ).replace(/<!-- -->/g, '')

describe('strategyFocusMinutes', () => {
  it('maps pomodoro/countdown to their configured focus length', () => {
    expect(strategyFocusMinutes('pomodoro')).toBe(25)
    expect(strategyFocusMinutes('countdown')).toBe(25)
    // flowtime is open-ended — the page keeps its manual input
    expect(strategyFocusMinutes('flowtime')).toBe(25)
  })
})

describe('FocusModePicker rendering', () => {
  it('renders the three strategy chips', () => {
    const html = picker(null)
    expect(html).toContain('Pomodoro 25/5')
    expect(html).toContain('Flowtime')
    expect(html).toContain('Countdown')
  })

  it('pins the pomodoro default (countdown guidance shows only after switching)', () => {
    const html = picker(null)
    expect(html).not.toContain('Bind a task above') // countdown hint is strategy-gated
    expect(html).toContain('aria-pressed="true"') // exactly one chip active
  })
})
