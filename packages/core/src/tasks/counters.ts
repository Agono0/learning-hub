/**
 * Simple counters (S3-31 core / S3-90) — the pure math over a counter's
 * per-day log: current streak, best streak and tap totals.
 *
 * SP semantics: a counter's streak is the run of CONSECUTIVE days with at
 * least one tap. Today counts toward the current streak only once it has a
 * tap; an untapped today does NOT break the streak yet (the day is still
 * open) — but an untapped YESTERDAY does, because the run can no longer
 * continue. Best streak is the longest run anywhere in the log's history.
 *
 * Pure: rows in (`{ day, count }` — the `simple_counter_logs` shape),
 * numbers out; `today` is injected (no clock reads). Duplicate days are
 * impossible at the storage layer (unique index) but are tolerated here by
 * summing first.
 */

/** One per-day counter log (the storage row's projection). */
export interface CounterLogDay {
  day: string
  count: number
}

/** Streak durations in DAYS. */
export interface CounterStreak {
  /** Consecutive tapped days ending today (or yesterday when today is untapped). */
  current: number
  /** The longest run of consecutive tapped days in the whole log. */
  best: number
  /** Days with at least one tap, ever. */
  totalDays: number
}

const DAY_MS = 86_400_000

/** The day before `day` (day-keys are UTC-normalized). */
function prevDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - DAY_MS).toISOString().slice(0, 10)
}

/** Total taps across all days. */
export function counterTotalTaps(logs: readonly CounterLogDay[]): number {
  return logs.reduce((sum, l) => sum + l.count, 0)
}

/**
 * Streak durations for one counter (S3-90). Zero-count days do not extend a
 * streak; days out of chronological order are handled by set-lookup, not
 * sorting, so the input shape doesn't matter.
 */
export function counterStreak(logs: readonly CounterLogDay[], today: string): CounterStreak {
  const tapped = new Map<string, number>()
  for (const log of logs) {
    tapped.set(log.day, (tapped.get(log.day) ?? 0) + log.count)
  }

  const activeDays = [...tapped.entries()].filter(([, count]) => count > 0).map(([day]) => day)
  const activeSet = new Set(activeDays)

  // Current streak: walk backwards from the newest "anchor". Today anchors
  // when tapped; otherwise yesterday does (today is still open — SP rule).
  let current = 0
  if (activeSet.has(today)) {
    let cursor = today
    while (activeSet.has(cursor)) {
      current += 1
      cursor = prevDay(cursor)
    }
  } else {
    let cursor = prevDay(today)
    while (activeSet.has(cursor)) {
      current += 1
      cursor = prevDay(cursor)
    }
  }

  // Best streak: longest consecutive run over the active days.
  let best = 0
  for (const day of activeDays) {
    if (activeSet.has(prevDay(day))) continue // mid-run — counted from its start
    let run = 0
    let cursor = day
    while (activeSet.has(cursor)) {
      run += 1
      cursor = new Date(Date.parse(`${cursor}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10)
    }
    if (run > best) best = run
  }

  return { current, best, totalDays: activeDays.length }
}

/** Total taps over the given counter (convenience for the counters UI). */
export function counterTotal(logs: readonly CounterLogDay[]): number {
  return counterTotalTaps(logs)
}
