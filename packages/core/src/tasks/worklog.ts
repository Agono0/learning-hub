/**
 * Tasks — worklog rollups (S3-88): week/month aggregation over session
 * logs, with SP's LEAF-ONLY totals rule.
 *
 * SP's worklog shows tracked time per week and per month, and the per-task
 * rollup counts LEAF time only: a parent task's own `time_spent_on_day`
 * map is display glue, while the authoritative history lives in the
 * session log of the task the work actually happened on. When a parent
 * aggregates children (S3-04), summing every row would double count — so
 * {@link rollupByTask} drops any task that is another rollup task's parent
 * from the totals and attributes its rows to the child that earned them.
 *
 * Pure: rows in (core `TimeLog` shape = `task_time_logs` rows), numbers
 * out; the caller maps ids to titles. Weeks are ISO weeks (Monday start,
 * the `en-ISO` convention SP uses), months are calendar months keyed
 * `YYYY-MM`.
 */
import { dayKeyOf, type TimeLog } from './time-tracking'

/** One period bucket: key, session count and total tracked ms. */
export interface WorklogPeriod {
  /** `YYYY-Www` (ISO week) or `YYYY-MM` (month). */
  key: string
  sessions: number
  totalMs: number
}

/** One per-task rollup line: total plus its per-day map (drill-down). */
export interface WorklogTaskTotal {
  taskId: number
  sessions: number
  totalMs: number
  /** `YYYY-MM-DD` → ms, summed over this task's rows. */
  perDay: Record<string, number>
}

/** ISO week key `YYYY-Www` for a calendar day (Monday-start weeks). */
export function isoWeekKey(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day)
  if (!m) throw new RangeError(`Not a YYYY-MM-DD day: ${day}`)
  const y = Number(m[1])
  const month = Number(m[2])
  const d = Number(m[3])
  // UTC anchor so the key is timezone-stable (matches dayKey math elsewhere).
  const date = new Date(Date.UTC(y, month - 1, d))
  const dayNumber = (date.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  date.setUTCDate(date.getUTCDate() - dayNumber) // back to the week's Monday
  const thursday = new Date(date)
  thursday.setUTCDate(thursday.getUTCDate() + 3) // ISO week 1 contains the first Thursday
  const weekYear = thursday.getUTCFullYear()
  const week1 = new Date(Date.UTC(weekYear, 0, 4))
  const week1DayNumber = (week1.getUTCDay() + 6) % 7
  week1.setUTCDate(week1.getUTCDate() - week1DayNumber)
  const week = Math.floor((date.getTime() - week1.getTime()) / (7 * 86_400_000)) + 1
  return `${String(weekYear).padStart(4, '0')}-W${String(week).padStart(2, '0')}`
}

/** Month key `YYYY-MM` for a calendar day. */
export function monthKey(day: string): string {
  return day.slice(0, 7)
}

/** Generic period rollup: bucket rows by a key function, sorted by key. */
function rollupPeriods(logs: TimeLog[], keyOf: (day: string) => string): WorklogPeriod[] {
  const byKey = new Map<string, WorklogPeriod>()
  for (const log of logs) {
    const day = log.day
    const key = keyOf(day)
    const bucket = byKey.get(key) ?? { key, sessions: 0, totalMs: 0 }
    bucket.sessions += 1
    bucket.totalMs += log.sessionMs
    byKey.set(key, bucket)
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Week rollup (ISO weeks, Monday start). Out-of-window rows are the
 * caller's concern (the repo query filters the range).
 */
export function rollupByWeek(logs: TimeLog[]): WorklogPeriod[] {
  return rollupPeriods(logs, isoWeekKey)
}

/** Month rollup (`YYYY-MM` buckets). */
export function rollupByMonth(logs: TimeLog[]): WorklogPeriod[] {
  return rollupPeriods(logs, monthKey)
}

/**
 * Per-task rollup with SP's leaf-only rule: `parentIds` are the tasks that
 * HAVE subtasks (the caller knows the tree). Rows logged directly on a
 * parent stay attributed to the parent ONLY when it is a leaf here —
 * otherwise a parent row is folded into the child bucket by
 * `parentRowTarget` (an explicit mapping the caller derives; when absent,
 * parent rows are DROPPED from totals rather than double counted).
 *
 * Rows referencing unknown tasks are skipped (deleted rows linger in an
 * append-only log).
 */
export function rollupByTask(
  logs: TimeLog[],
  parentIds: ReadonlySet<number>,
  parentRowTarget?: (taskId: number) => number,
): WorklogTaskTotal[] {
  const byTask = new Map<number, WorklogTaskTotal>()
  for (const log of logs) {
    let taskId = log.taskId
    if (parentIds.has(taskId)) {
      if (parentRowTarget === undefined) continue
      taskId = parentRowTarget(taskId)
    }
    const bucket = byTask.get(taskId) ?? { taskId, sessions: 0, totalMs: 0, perDay: {} }
    bucket.sessions += 1
    bucket.totalMs += log.sessionMs
    bucket.perDay[log.day] = (bucket.perDay[log.day] ?? 0) + log.sessionMs
    byTask.set(taskId, bucket)
  }
  return [...byTask.values()].sort((a, b) => b.totalMs - a.totalMs)
}

/**
 * Convenience total for a window: sum of ALL rows (the header number —
 * leaf-only refinements apply to the per-task table, not the headline).
 */
export function totalTracked(logs: TimeLog[]): number {
  return logs.reduce((sum, log) => sum + log.sessionMs, 0)
}

/** Re-exports so hosts need only this module for worklog reads. */
export { dayKeyOf }
export type { TimeLog }
