/**
 * Streak logic — forgiving by design (Duolingo data: streaks + freezes = 3.6× retention;
 * GitHub's unforgiving streaks create guilt — we avoid that).
 * Pure functions; DB layer applies them.
 */

export interface StreakState {
  current: number
  best: number
  lastActiveDate: string | null // YYYY-MM-DD
  freezes: number
  weekendAmulet: boolean
}

const DAY_MS = 86_400_000

/**
 * Day key of `date` in the user's local day. `offsetMinutes` follows
 * `Date#getTimezoneOffset()` semantics — the value the client passes is
 * `new Date().getTimezoneOffset()`: minutes to ADD to local time to get UTC
 * (negative east of UTC, e.g. -120 for UTC+2, +300 for UTC-5). Default 0 = the
 * UTC bucket, identical to the historical (pre-offset) dayKey behavior.
 */
export function localDayKey(d: Date, offsetMinutes = 0): string {
  return new Date(d.getTime() - offsetMinutes * 60_000).toISOString().slice(0, 10)
}

/**
 * Day bucket for streaks/quests/journal. UTC by default; pass the client's
 * `new Date().getTimezoneOffset()` to bucket by the user's local day instead
 * (see {@link localDayKey}).
 */
export function dayKey(d: Date, offsetMinutes = 0): string {
  return localDayKey(d, offsetMinutes)
}

/**
 * Day key from either a Date (UTC bucket, same as `dayKey(d)`) or a string
 * (first 10 chars — a `'YYYY-MM-DD…'` value is used as-is). Shared util for
 * analytics/motivation/quotes/curriculum; UTC-based to preserve the behavior
 * every call site had before the dedupe.
 */
export function dateKeyOf(date: Date | string): string {
  return typeof date === 'string' ? date.slice(0, 10) : dayKey(date)
}

/**
 * Weekend check (Sat/Sun) in the same shifted day as
 * `dayKey(d, offsetMinutes)` — must agree with the local day bucket, so
 * `isWeekend` takes the same offset the streak logic buckets by.
 */
export function isWeekend(d: Date, offsetMinutes = 0): boolean {
  const day = new Date(d.getTime() - offsetMinutes * 60_000).getUTCDay()
  return day === 0 || day === 6
}

/** Record activity on `today`. Returns the new state. */
export function recordActivity(state: StreakState, today: Date, offsetMinutes = 0): StreakState {
  const key = dayKey(today, offsetMinutes)
  if (state.lastActiveDate && key <= state.lastActiveDate) return state // already counted today or earlier
  const gapDays = state.lastActiveDate
    ? Math.round((Date.parse(key + 'T00:00:00Z') - Date.parse(state.lastActiveDate + 'T00:00:00Z')) / DAY_MS)
    : Infinity
  if (state.lastActiveDate === null || gapDays === 1) {
    const current = state.current + 1
    return { ...state, current, best: Math.max(state.best, current), lastActiveDate: key }
  }
  if (gapDays === 2) {
    // missed exactly one day — try protections in order: freeze → weekend amulet
    if (state.freezes > 0) {
      const current = state.current + 1
      return { ...state, freezes: state.freezes - 1, current, best: Math.max(state.best, current), lastActiveDate: key }
    }
    if (state.weekendAmulet && isWeekend(today, offsetMinutes)) {
      const current = state.current + 1
      return { ...state, current, best: Math.max(state.best, current), lastActiveDate: key }
    }
  }
  // streak broken — fresh start framing (fresh-start effect, not guilt)
  return { ...state, current: 1, best: state.best, lastActiveDate: key }
}

/** Emergency 1-card review still counts: same as recordActivity. */
export const emergencyReview = recordActivity
