/**
 * Fresh-start nudges — the "temporal landmark" effect (Dai, Milkman & Riis 2014):
 * people are markedly more likely to start goal pursuit at clean-slate
 * boundaries (a new week, month, or year) than on arbitrary days. This module
 * is pure calendar math: given "now", it names the NEXT landmark and reports
 * whether a broken streak is still young enough for that framing to help.
 * Calm by design — one nudge, no guilt, no push notifications; the dashboard
 * renders it read-only (apps/web/app/page.tsx). Day buckets are UTC, matching
 * `dayKey`/`isFreshStartMoment` in streaks.ts/motivation.ts so server and
 * client agree without sharing state.
 */

/** The next temporal landmark, as a dashboard-renderable pair. */
export interface FreshStartTarget {
  /** ISO day key (YYYY-MM-DD, UTC bucket) of the landmark — may be today. */
  date: string
  /** Calm one-line label; the dashboard prefixes it with "Fresh start:". */
  label: string
}

const DAY_MS = 86_400_000

/** Landmark labels — plain, forward-looking, no streak-shaming. */
const LABELS = {
  'new-year': 'January 1 — a whole new year to begin again',
  'new-month': 'the 1st — a clean slate for the month',
  'new-week': 'Monday — a good day to reset the streak',
} as const

type LandmarkReason = keyof typeof LABELS

/**
 * The next fresh-start moment at or after `from`'s UTC day — the earliest of
 * the next Monday, the next 1st of the month, and the next January 1. When
 * `from` itself is a landmark, it is returned (the actionable fresh start is
 * today). On a tie the bigger boundary wins: Jan 1 beats the 1st, the 1st
 * beats Monday (stable sort, candidates listed most-specific first).
 */
export function nextFreshStart(from: Date): FreshStartTarget {
  const y = from.getUTCFullYear()
  const m = from.getUTCMonth() // 0-based
  const d = from.getUTCDate()
  const daysUntilMonday = (8 - from.getUTCDay()) % 7 // 0 when today is Monday

  const candidates: { at: Date; reason: LandmarkReason }[] = [
    // Next Jan 1 — today when `from` is Jan 1, else Jan 1 of the following year.
    { at: new Date(Date.UTC(m === 0 && d === 1 ? y : y + 1, 0, 1)), reason: 'new-year' },
    // Next 1st of the month — today when `from` is the 1st, else next month's 1st.
    { at: new Date(Date.UTC(y, d === 1 ? m : m + 1, 1)), reason: 'new-month' },
    // Next Monday — today when `from` is Monday.
    { at: new Date(Date.UTC(y, m, d + daysUntilMonday)), reason: 'new-week' },
  ]

  candidates.sort((a, b) => a.at.getTime() - b.at.getTime())
  const winner = candidates[0]!
  return { date: winner.at.toISOString().slice(0, 10), label: LABELS[winner.reason] }
}

/**
 * Whether the learning streak broke recently enough for a fresh-start nudge to
 * still land. A streak is ALIVE while the last active day is today or yesterday
 * (the current day is not over — mirrors `recordActivity`'s gapDays === 1
 * continuation in streaks.ts). Once broken, the break day is the first missed
 * day; it counts as "recent" while that day falls within the last `withinDays`
 * calendar days (default 7, counting today). Pure: reads only the two
 * arguments, so the dashboard can compute it from the streak row it already
 * has. A `null`/blank `lastActiveDate` means the streak never started —
 * nothing broke, no nudge.
 */
export function streakBrokeWithinDays(
  lastActiveDate: string | null | undefined,
  today: Date,
  withinDays = 7,
): boolean {
  if (!lastActiveDate || lastActiveDate.trim() === '') return false
  const lastKey = lastActiveDate.slice(0, 10)
  const todayKey = today.toISOString().slice(0, 10)
  const gapDays = Math.round(
    (Date.parse(todayKey + 'T00:00:00Z') - Date.parse(lastKey + 'T00:00:00Z')) / DAY_MS,
  )
  return gapDays >= 2 && gapDays <= withinDays
}
