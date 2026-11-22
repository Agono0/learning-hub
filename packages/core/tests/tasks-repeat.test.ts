/**
 * SP-parity tests for the repeat engine (S3-07): cycle math incl. month/year
 * clamping, interval cadences, skip-date rolls, all three re-anchor modes,
 * endDate cutoffs, projections, and the occurrence matcher.
 */
import { describe, expect, it } from 'vitest'
import {
  addCycle,
  createRepeatCfg,
  isOccurrenceOn,
  nextDueAfter,
  projectOccurrences,
  validateRepeatCfg,
  type RepeatCfg,
} from '../src/tasks/repeat'

const cfg = (overrides: Partial<RepeatCfg> = {}): RepeatCfg => ({
  id: 1,
  title: null,
  cycle: 'd',
  interval: 1,
  startDate: '2026-01-01',
  endDate: null,
  skipDates: [],
  reAnchor: 'scheduled',
  ...overrides,
})

describe('addCycle (clamped date math)', () => {
  it('adds days and weeks', () => {
    expect(addCycle('2026-01-01', 'd', 3)).toBe('2026-01-04')
    expect(addCycle('2026-01-01', 'w', 2)).toBe('2026-01-15')
  })

  it('clamps month-end days (SP: Jan 31 + 1 month = Feb 28)', () => {
    expect(addCycle('2026-01-31', 'm', 1)).toBe('2026-02-28')
    expect(addCycle('2026-01-31', 'm', 2)).toBe('2026-03-31') // un-clamps on a 31-day month
    expect(addCycle('2026-03-31', 'm', 1)).toBe('2026-04-30')
  })

  it('clamps year boundaries (Feb 29 → Feb 28 in common years)', () => {
    expect(addCycle('2024-02-29', 'y', 1)).toBe('2025-02-28')
    expect(addCycle('2024-02-29', 'y', 4)).toBe('2028-02-29') // leap day survives leap years
  })

  it('rolls years across decade boundaries', () => {
    expect(addCycle('2026-12-31', 'y', 10)).toBe('2036-12-31')
  })
})

describe('nextDueAfter — scheduled re-anchor', () => {
  it('every-N-days cadence from the schedule', () => {
    const c = cfg({ cycle: 'd', interval: 3, startDate: '2026-01-01' })
    expect(nextDueAfter(c, '2026-01-01')).toBe('2026-01-04')
    expect(nextDueAfter(c, '2026-01-04')).toBe('2026-01-07')
    expect(nextDueAfter(c, '2026-01-07', null)).toBe('2026-01-10') // null interaction = pure schedule
  })

  it('weekly and monthly cadences', () => {
    expect(
      nextDueAfter(cfg({ cycle: 'w', interval: 2, startDate: '2026-01-05' }), '2026-01-05'),
    ).toBe('2026-01-19')
    expect(
      nextDueAfter(cfg({ cycle: 'm', interval: 1, startDate: '2026-01-31' }), '2026-01-31'),
    ).toBe('2026-02-28')
  })

  it('ignores when the task was completed (scheduled mode)', () => {
    const c = cfg({ cycle: 'd', interval: 3, startDate: '2026-01-01' })
    // completed 5 days late — the schedule does not care
    expect(nextDueAfter(c, '2026-01-04', '2026-01-09')).toBe('2026-01-07')
  })

  it('ends at endDate (inclusive)', () => {
    const c = cfg({ cycle: 'd', interval: 1, startDate: '2026-01-01', endDate: '2026-01-03' })
    expect(nextDueAfter(c, '2026-01-02')).toBe('2026-01-03')
    expect(nextDueAfter(c, '2026-01-03')).toBeNull()
  })
})

describe('nextDueAfter — completion & postponed re-anchor', () => {
  it('completion mode anchors from the completed day (SP: every 3 days from when you did it)', () => {
    const c = cfg({ cycle: 'd', interval: 3, reAnchor: 'completion' })
    expect(nextDueAfter(c, '2026-01-01', '2026-01-06')).toBe('2026-01-09')
    // no interaction → falls back to the schedule anchor
    expect(nextDueAfter(c, '2026-01-01')).toBe('2026-01-04')
  })

  it('postponed mode anchors from the postponement day', () => {
    const c = cfg({ cycle: 'w', interval: 1, reAnchor: 'postponed', startDate: '2026-01-05' })
    expect(nextDueAfter(c, '2026-01-05', '2026-01-08')).toBe('2026-01-15')
  })
})

describe('skip dates', () => {
  it('rolls an occurrence forward past a skip date', () => {
    const c = cfg({ cycle: 'd', interval: 1, startDate: '2026-01-01', skipDates: ['2026-01-04'] })
    expect(nextDueAfter(c, '2026-01-03')).toBe('2026-01-05')
  })

  it('multiple consecutive skips roll until a free day', () => {
    const c = cfg({
      cycle: 'd',
      interval: 1,
      startDate: '2026-01-01',
      skipDates: ['2026-01-04', '2026-01-05', '2026-01-06'],
    })
    expect(nextDueAfter(c, '2026-01-03')).toBe('2026-01-07')
  })

  it('a skip roll still respects endDate', () => {
    const c = cfg({
      cycle: 'd',
      interval: 1,
      startDate: '2026-01-01',
      endDate: '2026-01-04',
      skipDates: ['2026-01-04'],
    })
    expect(nextDueAfter(c, '2026-01-03')).toBeNull()
  })

  it('isOccurrenceOn honors skips (rolled occurrences surface on the free day)', () => {
    const c = cfg({ cycle: 'd', interval: 1, startDate: '2026-01-01', skipDates: ['2026-01-04'] })
    expect(isOccurrenceOn(c, '2026-01-04')).toBe(false)
    expect(isOccurrenceOn(c, '2026-01-05')).toBe(true)
    expect(isOccurrenceOn(c, '2026-01-03')).toBe(true)
    expect(isOccurrenceOn(c, '2025-12-31')).toBe(false) // before start
    expect(isOccurrenceOn(c, '2026-02-01')).toBe(true) // daily-1 keeps going
  })

  it('isOccurrenceOn matches interval-aligned days for sparse cadences', () => {
    const c = cfg({ cycle: 'd', interval: 3, startDate: '2026-01-01' })
    expect(isOccurrenceOn(c, '2026-01-07')).toBe(true)
    expect(isOccurrenceOn(c, '2026-01-08')).toBe(false)
  })
})

describe('projectOccurrences', () => {
  it('projects the next N occurrences with skips and endDate', () => {
    const c = cfg({ cycle: 'd', interval: 2, startDate: '2026-01-01', skipDates: ['2026-01-05'] })
    expect(projectOccurrences(c, '2026-01-01', 4)).toEqual([
      '2026-01-03',
      '2026-01-06', // 01-05 skipped → rolls to 01-06; cursor continues from there
      '2026-01-08',
      '2026-01-10',
    ])
  })

  it('stops at endDate', () => {
    const c = cfg({ cycle: 'w', interval: 1, startDate: '2026-01-05', endDate: '2026-01-19' })
    expect(projectOccurrences(c, '2026-01-05', 5)).toEqual(['2026-01-12', '2026-01-19'])
  })
})

describe('createRepeatCfg / validateRepeatCfg', () => {
  it('normalizes skip dates (dedup + sort) and defaults the title', () => {
    const c = createRepeatCfg({
      cycle: 'w',
      interval: 1,
      startDate: '2026-01-05',
      endDate: null,
      skipDates: ['2026-01-19', '2026-01-12', '2026-01-19'],
      reAnchor: 'scheduled',
    })
    expect(c).toMatchObject({ id: 0, title: null, skipDates: ['2026-01-12', '2026-01-19'] })
  })

  it('blocks endDate before startDate; warns on out-of-window skips', () => {
    const bad = cfg({ startDate: '2026-02-01', endDate: '2026-01-31' })
    expect(validateRepeatCfg(bad).ok).toBe(false)
    expect(validateRepeatCfg(bad).errors).toContain('The repeat ends before it starts.')

    const warned = cfg({ skipDates: ['2025-06-01'] })
    expect(validateRepeatCfg(warned).ok).toBe(true)
    expect(validateRepeatCfg(warned).warnings.length).toBe(1)
  })

  it('rejects malformed dates and intervals via zod', () => {
    expect(() =>
      createRepeatCfg({
        cycle: 'd',
        interval: 0,
        startDate: '2026-01-01',
        endDate: null,
        skipDates: [],
        reAnchor: 'scheduled',
      }),
    ).toThrow()
    expect(() =>
      createRepeatCfg({
        cycle: 'd',
        interval: 1,
        startDate: '01/02/2026',
        endDate: null,
        skipDates: [],
        reAnchor: 'scheduled',
      }),
    ).toThrow()
  })
})
