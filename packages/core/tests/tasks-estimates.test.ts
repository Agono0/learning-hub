/**
 * Unit tests for time estimates (S3-62): the grammar (single source shared
 * with the short-syntax parser), remaining math, progress percent and the
 * calm formatting.
 */
import { describe, expect, it } from 'vitest'
import { taskItemSchema, type TaskItem } from '../src/tasks'
import {
  estimateProgressPct,
  estimateRemainingMs,
  ESTIMATE_MAX_MS,
  formatEstimate,
  formatEstimateRemaining,
  parseEstimateMs,
  totalTrackedMs,
} from '../src/tasks/estimates'

function task(overrides: Partial<TaskItem> = {}): TaskItem {
  return taskItemSchema.parse({
    id: 1,
    parentId: null,
    projectId: null,
    tagIds: [],
    title: 't',
    notes: null,
    priority: 'none',
    estimateMs: null,
    timeSpentOnDay: {},
    due: null,
    dueWithTime: false,
    deadline: null,
    isDone: false,
    doneAt: null,
    wonthado: false,
    repeatCfgId: null,
    order: 0,
    createdAt: '2026-11-22T00:00:00.000Z',
    updatedAt: '2026-11-22T00:00:00.000Z',
    ...overrides,
  })
}

describe('parseEstimateMs (grammar shared with short-syntax)', () => {
  it('parses the documented chains and rejects junk', () => {
    expect(parseEstimateMs('10m')).toBe(600_000)
    expect(parseEstimateMs('1h')).toBe(3_600_000)
    expect(parseEstimateMs('1h30m')).toBe(5_400_000)
    expect(parseEstimateMs('1H30M')).toBe(5_400_000)
    expect(parseEstimateMs('0m')).toBeNull()
    expect(parseEstimateMs('1w')).toBeNull()
    expect(parseEstimateMs('51h')).toBeNull() // over the cap
    expect(parseEstimateMs('1h3')).toBeNull() // dangling digits
    expect(ESTIMATE_MAX_MS).toBe(180_000_000)
  })
})

describe('remaining math', () => {
  it('sums tracked time across days', () => {
    const t = task({ timeSpentOnDay: { '2026-11-21': 600_000, '2026-11-22': 300_000 } })
    expect(totalTrackedMs(t)).toBe(900_000)
    expect(totalTrackedMs(task())).toBe(0)
  })

  it('remaining = estimate − tracked, floored at 0; null without estimate', () => {
    const t = task({ estimateMs: 3_600_000, timeSpentOnDay: { d1: 1_500_000 } })
    expect(estimateRemainingMs(t)).toBe(2_100_000)
    const over = task({ estimateMs: 1_000_000, timeSpentOnDay: { d1: 1_500_000 } })
    expect(estimateRemainingMs(over)).toBe(0) // over budget floors at zero
    expect(estimateRemainingMs(task())).toBeNull()
  })

  it('progress clamps at 100; zero without estimate', () => {
    expect(
      estimateProgressPct(task({ estimateMs: 1_000_000, timeSpentOnDay: { d: 500_000 } })),
    ).toBe(50)
    expect(estimateProgressPct(task({ estimateMs: 1_000, timeSpentOnDay: { d: 900_000 } }))).toBe(
      100,
    )
    expect(estimateProgressPct(task())).toBe(0)
  })
})

describe('formatEstimate', () => {
  it('formats calm durations', () => {
    expect(formatEstimate(45 * 60_000)).toBe('45m')
    expect(formatEstimate(3_600_000)).toBe('1h')
    expect(formatEstimate(5_400_000)).toBe('1h 30m')
    expect(formatEstimate(7 * 3_600_000 + 15 * 60_000)).toBe('7h 15m')
  })

  it('invalid estimates render as an em dash', () => {
    expect(formatEstimate(null)).toBe('—')
    expect(formatEstimate(0)).toBe('—')
    expect(formatEstimate(-5)).toBe('—')
    expect(formatEstimate(Number.NaN)).toBe('—')
  })

  it('remaining text composes the two helpers', () => {
    const t = task({ estimateMs: 3_600_000, timeSpentOnDay: { d: 600_000 } })
    expect(formatEstimateRemaining(t)).toBe('50m')
  })
})
