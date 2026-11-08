/**
 * Streak module tests: dayKey/localDayKey timezone offset (off-by-one-day fix),
 * weekend shift, recordActivity with local buckets, and the shared dateKeyOf.
 * Old (UTC) behavior must remain the default when offsetMinutes is omitted.
 */
import { describe, expect, it } from 'vitest'
import { dateKeyOf, dayKey, isWeekend, localDayKey, recordActivity } from '../src/streaks'

describe('dayKey / localDayKey', () => {
  it('defaults to the UTC bucket (historical behavior unchanged)', () => {
    const d = new Date('2026-11-04T23:30:00Z')
    expect(dayKey(d)).toBe('2026-11-04')
    expect(dayKey(d, 0)).toBe('2026-11-04')
    expect(localDayKey(d)).toBe('2026-11-04')
    expect(dayKey(d)).toBe(d.toISOString().slice(0, 10))
  })

  it('buckets by the local day when given getTimezoneOffset() (DEF: off-by-one-day)', () => {
    // UTC+2 → getTimezoneOffset() = -120: 23:30Z is already Nov 5 locally.
    expect(localDayKey(new Date('2026-11-04T23:30:00Z'), -120)).toBe('2026-11-05')
    expect(dayKey(new Date('2026-11-04T23:30:00Z'), -120)).toBe('2026-11-05')
    // UTC-5 → getTimezoneOffset() = +300: 00:30Z is still Nov 3 locally.
    expect(localDayKey(new Date('2026-11-04T00:30:00Z'), 300)).toBe('2026-11-03')
  })

  it('keeps the day inside the offset window (no off-by-one at ±30min zones)', () => {
    // UTC+5:30 → getTimezoneOffset() = -330: 18:45Z is 00:15 next day locally.
    expect(localDayKey(new Date('2026-11-04T18:45:00Z'), -330)).toBe('2026-11-05')
  })
})

describe('isWeekend with offset', () => {
  it('defaults to the UTC weekday (historical behavior unchanged)', () => {
    // 2026-11-06 is a Friday, 2026-11-07 a Saturday (UTC).
    expect(isWeekend(new Date('2026-11-07T12:00:00Z'))).toBe(true)
    expect(isWeekend(new Date('2026-11-06T22:00:00Z'))).toBe(false)
  })

  it('shifts the weekday check with the same offset as the day bucket', () => {
    // UTC+2 (-120): Friday 22:00Z is already Saturday locally.
    expect(isWeekend(new Date('2026-11-06T22:00:00Z'), -120)).toBe(true)
    // UTC-5 (+300): Monday 02:00Z is still Sunday locally.
    expect(isWeekend(new Date('2026-11-09T02:00:00Z'), 300)).toBe(true)
  })
})

describe('recordActivity with offset', () => {
  const base = { current: 0, best: 0, lastActiveDate: null, freezes: 0, weekendAmulet: false }

  it('counts reviews on the same local day once (offset passed through)', () => {
    // UTC+2 user: 23:30Z Nov 4 = 01:30 local Nov 5; 00:30Z Nov 5 = 02:30 local Nov 5.
    let s = recordActivity(base, new Date('2026-11-04T23:30:00Z'), -120)
    expect(s.lastActiveDate).toBe('2026-11-05')
    s = recordActivity(s, new Date('2026-11-05T00:30:00Z'), -120)
    expect(s.current).toBe(1) // same local day → not counted twice
    expect(s.best).toBe(1)
  })

  it('keeps UTC behavior when the offset is omitted', () => {
    let s = recordActivity(base, new Date('2026-11-04T23:30:00Z'))
    expect(s.lastActiveDate).toBe('2026-11-04')
    s = recordActivity(s, new Date('2026-11-05T00:30:00Z'))
    expect(s.current).toBe(2) // UTC buckets them as two consecutive days
  })

  it('weekend amulet follows the local weekday when an offset is given', () => {
    const amulet = {
      ...base,
      current: 3,
      best: 3,
      lastActiveDate: '2026-11-05',
      weekendAmulet: true,
    }
    // 2026-11-06 is a Friday in UTC, but the UTC+2 local day is Saturday Nov 7.
    const s = recordActivity(amulet, new Date('2026-11-06T22:30:00Z'), -120)
    expect(s.current).toBe(4) // amulet saved the streak on the local Saturday
    expect(s.lastActiveDate).toBe('2026-11-07')
  })
})

describe('dateKeyOf (shared util)', () => {
  it('accepts Date (UTC bucket) and strings (first 10 chars)', () => {
    expect(dateKeyOf(new Date('2026-11-04T23:30:00Z'))).toBe('2026-11-04')
    expect(dateKeyOf('2026-11-05T09:00:00Z')).toBe('2026-11-05')
    expect(dateKeyOf('2026-11-05')).toBe('2026-11-05')
  })

  it('agrees with dayKey for Date inputs', () => {
    const d = new Date('2026-11-04T01:02:03.456Z')
    expect(dateKeyOf(d)).toBe(dayKey(d))
  })
})

describe('liveStreak', async () => {
  const { liveStreak } = await import('../src/streaks')
  const base = { current: 7, best: 7, freezes: 0, weekendAmulet: false }
  const now = new Date('2026-11-11T12:00:00Z') // a Wednesday
  it('keeps the streak through today and yesterday', () => {
    expect(liveStreak({ ...base, lastActiveDate: '2026-11-11' }, now)).toBe(7)
    expect(liveStreak({ ...base, lastActiveDate: '2026-11-10' }, now)).toBe(7)
  })
  it('bridges one missed day only with a freeze', () => {
    expect(liveStreak({ ...base, lastActiveDate: '2026-11-09' }, now)).toBe(0)
    expect(liveStreak({ ...base, freezes: 1, lastActiveDate: '2026-11-09' }, now)).toBe(7)
  })
  it('is 0 for long gaps and empty state', () => {
    expect(liveStreak({ ...base, lastActiveDate: '2026-10-01' }, now)).toBe(0)
    expect(liveStreak({ ...base, lastActiveDate: null }, now)).toBe(0)
    expect(liveStreak({ ...base, current: 0, lastActiveDate: '2026-11-11' }, now)).toBe(0)
  })
})
