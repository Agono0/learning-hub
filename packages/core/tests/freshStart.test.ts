import { describe, expect, it } from 'vitest'
import { nextFreshStart, streakBrokeWithinDays } from '../src/freshStart'

/** UTC day helper — the module buckets days in UTC, tests do the same. */
const utc = (iso: string): Date => new Date(iso + 'T12:00:00Z') // noon avoids DST/edge ambiguity

describe('nextFreshStart', () => {
  it('returns the coming Monday from a mid-week day', () => {
    // 2026-11-04 is a Wednesday (see motivation.test.ts)
    expect(nextFreshStart(utc('2026-11-04'))).toEqual({
      date: '2026-11-09',
      label: 'Monday — a good day to reset the streak',
    })
  })

  it('returns the coming Monday from a Sunday', () => {
    expect(nextFreshStart(utc('2026-11-08')).date).toBe('2026-11-09')
  })

  it('returns today when today is Monday', () => {
    expect(nextFreshStart(utc('2026-11-09'))).toEqual({
      date: '2026-11-09',
      label: 'Monday — a good day to reset the streak',
    })
  })

  it('prefers the 1st of the month when it comes before Monday', () => {
    // from Thu 2026-10-29: the 1st (Sun 2026-11-01) precedes Monday 2026-11-02
    expect(nextFreshStart(utc('2026-10-29'))).toEqual({
      date: '2026-11-01',
      label: 'the 1st — a clean slate for the month',
    })
  })

  it('returns today when today is the 1st', () => {
    expect(nextFreshStart(utc('2026-11-01')).date).toBe('2026-11-01')
  })

  it('returns Jan 1 with the new-year label once the year-end Mondays have passed', () => {
    // from Wed 2026-12-30 the next 1st-of-month IS Jan 1, and the year
    // landmark wins that tie — the coming Monday (2027-01-04) is later still
    expect(nextFreshStart(utc('2026-12-30'))).toEqual({
      date: '2027-01-01',
      label: 'January 1 — a whole new year to begin again',
    })
  })

  it('still names the coming Monday from mid-December (before the year-end tie)', () => {
    expect(nextFreshStart(utc('2026-12-15')).date).toBe('2026-12-21')
  })

  it('returns today when today is Jan 1', () => {
    expect(nextFreshStart(utc('2027-01-01'))).toEqual({
      date: '2027-01-01',
      label: 'January 1 — a whole new year to begin again',
    })
  })

  it('on a Monday-that-is-also-the-1st, the month boundary wins', () => {
    // 2026-06-01 is both a Monday and the 1st — the bigger landmark labels it
    expect(nextFreshStart(utc('2026-06-01')).label).toBe('the 1st — a clean slate for the month')
  })

  it('on Jan 1 that is also a Monday, the year boundary wins', () => {
    // 2024-01-01 was a Monday — the new-year label takes precedence
    expect(nextFreshStart(utc('2024-01-01')).label).toBe(
      'January 1 — a whole new year to begin again',
    )
  })

  it('always returns a YYYY-MM-DD date key', () => {
    const out = nextFreshStart(utc('2026-11-05'))
    expect(out.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('streakBrokeWithinDays', () => {
  const today = utc('2026-11-08') // a Sunday

  it('false when the streak never started', () => {
    expect(streakBrokeWithinDays(null, today)).toBe(false)
    expect(streakBrokeWithinDays('', today)).toBe(false)
  })

  it('false while the streak is alive (active today or yesterday)', () => {
    expect(streakBrokeWithinDays('2026-11-08', today)).toBe(false) // today
    expect(streakBrokeWithinDays('2026-11-07', today)).toBe(false) // yesterday — day not over
  })

  it('true when the break is fresh (first missed day within the window)', () => {
    expect(streakBrokeWithinDays('2026-11-06', today)).toBe(true) // broke yesterday
    expect(streakBrokeWithinDays('2026-11-01', today)).toBe(true) // broke 6 days ago
  })

  it('false once the break is older than the window', () => {
    expect(streakBrokeWithinDays('2026-10-31', today)).toBe(false) // broke 7 days ago
    expect(streakBrokeWithinDays('2026-10-05', today)).toBe(false)
  })

  it('honors a custom window', () => {
    expect(streakBrokeWithinDays('2026-10-31', today, 10)).toBe(true)
    expect(streakBrokeWithinDays('2026-11-06', today, 1)).toBe(false)
  })

  it('ignores time-of-day noise in the stored key', () => {
    expect(streakBrokeWithinDays('2026-11-06T21:30:00.000Z', today)).toBe(true)
  })
})
