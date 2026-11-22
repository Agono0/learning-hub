/**
 * Task indicators (S3-45) — pure budget/deadline math plus SSR rendering of
 * the three shared badges (estimated-vs-spent, priority, deadline) used by
 * every task surface.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import {
  DeadlineBadge,
  EstimateSpentBadge,
  PriorityBadge,
  deadlineDaysLeft,
  deadlineUrgency,
  estimateBudgetTone,
  estimateProgressFraction,
  humanMs,
  spentTotal,
} from '../src/components/tasks/TaskIndicators'

const TODAY = '2026-11-22'
const render = (node: React.ReactElement): string => renderToString(node).replace(/<!-- -->/g, '')

describe('estimate math', () => {
  it('sums the per-day spent map', () => {
    expect(spentTotal({ '2026-11-21': 60_000, '2026-11-22': 30_000 })).toBe(90_000)
    expect(spentTotal({})).toBe(0)
  })

  it('formats human durations', () => {
    expect(humanMs(45 * 60_000)).toBe('45m')
    expect(humanMs(90 * 60_000)).toBe('1h 30m')
    expect(humanMs(120 * 60_000)).toBe('2h')
  })

  it('fractions need a positive estimate', () => {
    expect(estimateProgressFraction(null, 5_000)).toBeNull()
    expect(estimateProgressFraction(0, 5_000)).toBeNull()
    expect(estimateProgressFraction(100_000, 50_000)).toBe(0.5)
    expect(estimateProgressFraction(100_000, -1)).toBe(0) // negative spend clamps
  })

  it('tones: over budget is danger, near budget warns, under stays neutral', () => {
    expect(estimateBudgetTone(100_000, 120_000)).toBe('danger') // over
    expect(estimateBudgetTone(100_000, 85_000)).toBe('warning') // ≥80%
    expect(estimateBudgetTone(100_000, 10_000)).toBe('neutral')
    expect(estimateBudgetTone(null, 60_000)).toBe('neutral') // tracked-only
  })
})

describe('deadline math', () => {
  it('urgency: passed, within 3 days, else none', () => {
    expect(deadlineUrgency('2026-11-20', TODAY)).toBe('passed')
    expect(deadlineUrgency('2026-11-25', TODAY)).toBe('soon') // 3 days out
    expect(deadlineUrgency('2026-11-26', TODAY)).toBe('none')
    expect(deadlineUrgency(null, TODAY)).toBe('none')
  })

  it('counts whole days left', () => {
    expect(deadlineDaysLeft('2026-11-25', TODAY)).toBe(3)
    expect(deadlineDaysLeft('2026-11-20', TODAY)).toBe(-2)
  })
})

describe('badge rendering', () => {
  it('estimate badge shows spent-of-estimate and over-budget tone', () => {
    const html = render(
      React.createElement(EstimateSpentBadge, { estimateMs: 90 * 60_000, spentMs: 120 * 60_000 }),
    )
    expect(html).toContain('2h')
    expect(html).toContain('of 1h 30m')
    expect(html).toContain('bg-rose-600') // danger fill, rose not red
  })

  it('estimate badge renders nothing without estimate and spend (calm rows)', () => {
    expect(render(React.createElement(EstimateSpentBadge, { estimateMs: null, spentMs: 0 }))).toBe(
      '',
    )
  })

  it('priority badge: p1/p2/p3 chips, none renders nothing', () => {
    expect(render(React.createElement(PriorityBadge, { priority: 'high' }))).toContain('p1')
    expect(render(React.createElement(PriorityBadge, { priority: 'medium' }))).toContain('p2')
    expect(render(React.createElement(PriorityBadge, { priority: 'low' }))).toContain('p3')
    expect(render(React.createElement(PriorityBadge, { priority: 'none' }))).toBe('')
  })

  it('deadline badge counts down and flips to passed in the danger hue', () => {
    const soon = render(
      React.createElement(DeadlineBadge, { deadline: '2026-11-25', today: TODAY }),
    )
    expect(soon).toContain('Deadline in 3d')
    const passed = render(
      React.createElement(DeadlineBadge, { deadline: '2026-11-20', today: TODAY }),
    )
    expect(passed).toContain('Deadline passed')
    expect(render(React.createElement(DeadlineBadge, { deadline: null, today: TODAY }))).toBe('')
  })
})
