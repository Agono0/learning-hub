/**
 * Unit tests for the worklog rollups (S3-88): ISO week and month bucketing,
 * the leaf-only per-task rule (parent rows folded or dropped, never double
 * counted), per-day drill-down maps, and headline totals.
 */
import { describe, expect, it } from 'vitest'
import {
  isoWeekKey,
  monthKey,
  rollupByMonth,
  rollupByTask,
  rollupByWeek,
  totalTracked,
  type TimeLog,
} from '../src/tasks/worklog'

function log(taskId: number, day: string, sessionMs: number): TimeLog {
  return { id: 0, taskId, day, sessionMs, startedAt: null, source: 'manual', createdAt: '' }
}

describe('isoWeekKey / monthKey', () => {
  it('buckets calendar days into Monday-start ISO weeks', () => {
    // 2026-01-01 is a Thursday — ISO week 1 of 2026 (Mon 2025-12-29).
    expect(isoWeekKey('2026-01-01')).toBe('2026-W01')
    expect(isoWeekKey('2026-01-05')).toBe('2026-W02') // Monday
    expect(isoWeekKey('2026-01-04')).toBe('2026-W01') // Sunday, still W01
    // Year boundary: Jan 1 2026 is a Thursday → 2026 has 53 ISO weeks, and
    // the week containing it (Mon 2025-12-29) is 2026-W01, not 2025-W53.
    expect(isoWeekKey('2025-12-29')).toBe('2026-W01')
    expect(isoWeekKey('2026-12-28')).toBe('2026-W53')
    // A known mid-year week: 2026-06-15 (Mon) → W25.
    expect(isoWeekKey('2026-06-15')).toBe('2026-W25')
  })

  it('months are the YYYY-MM prefix', () => {
    expect(monthKey('2026-03-09')).toBe('2026-03')
    expect(monthKey('2025-12-31')).toBe('2025-12')
  })

  it('rejects non-day keys', () => {
    expect(() => isoWeekKey('2026-03')).toThrow(/Not a YYYY-MM-DD/)
  })
})

describe('rollupByWeek / rollupByMonth', () => {
  const logs = [
    log(1, '2026-03-02', 3_600_000),
    log(1, '2026-03-03', 1_800_000),
    log(2, '2026-03-09', 900_000),
    log(2, '2026-03-16', 900_000),
  ]

  it('buckets sessions per week with counts and totals, sorted by key', () => {
    expect(rollupByWeek(logs)).toEqual([
      { key: '2026-W10', sessions: 2, totalMs: 5_400_000 },
      { key: '2026-W11', sessions: 1, totalMs: 900_000 },
      { key: '2026-W12', sessions: 1, totalMs: 900_000 },
    ])
  })

  it('buckets sessions per month', () => {
    expect(rollupByMonth(logs)).toEqual([{ key: '2026-03', sessions: 4, totalMs: 7_200_000 }])
  })

  it('handles empty input as no periods', () => {
    expect(rollupByWeek([])).toEqual([])
    expect(rollupByMonth([])).toEqual([])
  })
})

describe('rollupByTask — the leaf-only rule', () => {
  it('keeps leaf rows as-is and drops parent rows when no mapping is given', () => {
    const logs = [log(10, '2026-03-02', 60_000), log(11, '2026-03-02', 30_000)]
    // Task 10 is a PARENT (has subtasks) — its stray rows are dropped from
    // totals rather than double counted against the children.
    expect(rollupByTask(logs, new Set([10]))).toEqual([
      { taskId: 11, sessions: 1, totalMs: 30_000, perDay: { '2026-03-02': 30_000 } },
    ])
  })

  it('folds parent rows into the caller-mapped child', () => {
    const logs = [log(10, '2026-03-02', 60_000), log(11, '2026-03-02', 30_000)]
    const totals = rollupByTask(logs, new Set([10]), () => 11)
    expect(totals).toEqual([
      { taskId: 11, sessions: 2, totalMs: 90_000, perDay: { '2026-03-02': 90_000 } },
    ])
  })

  it('leaf tasks accumulate per-day maps and sort by total desc', () => {
    const logs = [
      log(21, '2026-03-02', 100_000),
      log(22, '2026-03-03', 500_000),
      log(21, '2026-03-03', 100_000),
    ]
    const totals = rollupByTask(logs, new Set())
    expect(totals.map((t) => t.taskId)).toEqual([22, 21])
    expect(totals[0]!.perDay).toEqual({ '2026-03-03': 500_000 })
    expect(totals[1]!.perDay).toEqual({ '2026-03-02': 100_000, '2026-03-03': 100_000 })
  })

  it('skips rows for deleted tasks is not needed here — totals only cover given rows', () => {
    // Documented behavior: the repo query returns only known tasks; the
    // rollup itself never invents buckets for absent ids.
    expect(rollupByTask([], new Set())).toEqual([])
  })
})

describe('totalTracked — headline number', () => {
  it('sums every row in the window (leaf refinement is table-only)', () => {
    const logs = [log(1, '2026-03-02', 60_000), log(2, '2026-03-03', 30_000)]
    expect(totalTracked(logs)).toBe(90_000)
    expect(totalTracked([])).toBe(0)
  })
})
