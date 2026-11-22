/**
 * Tasks — time estimates (S3-62): parsing, remaining math, formatting.
 *
 * Single source for the estimate grammar (`10m`, `1h`, `1h30m`, cap 50h) —
 * the short-syntax parser (S3-09) imports and re-exports these, so S3-45's
 * indicators and S3-21's dialogs never re-implement parsing. The remaining
 * math rolls the task's per-day tracked time (S3-10 writes it) against the
 * estimate. Pure, no I/O.
 */
import type { TaskItem } from './index'

/** Upper bound for a single estimate: 50h (SP's practical cap). */
export const ESTIMATE_MAX_MS = 50 * 3_600_000

/**
 * Parse a time-estimate chain (`10m`, `1h`, `1h30m`, `45m`). Returns ms, or
 * null when the text is not an estimate (or violates the 50h cap / is zero).
 */
export function parseEstimateMs(token: string): number | null {
  const m = /^(\d{1,3}h)?(\d{1,3}m)?$/i.exec(token.trim())
  if (!m || (!m[1] && !m[2])) return null
  const hours = m[1] ? Number.parseInt(m[1], 10) : 0
  const minutes = m[2] ? Number.parseInt(m[2], 10) : 0
  const ms = hours * 3_600_000 + minutes * 60_000
  if (ms <= 0 || ms > ESTIMATE_MAX_MS) return null
  return ms
}

/** Total tracked time across all days, in ms (sum of `timeSpentOnDay`). */
export function totalTrackedMs(task: Pick<TaskItem, 'timeSpentOnDay'>): number {
  return Object.values(task.timeSpentOnDay).reduce((a, b) => a + b, 0)
}

/**
 * Remaining time against the estimate: `estimate − tracked`, floored at 0.
 * Null when the task has no estimate (there is nothing to compare against —
 * SP shows "no estimate", not "0 remaining").
 */
export function estimateRemainingMs(task: TaskItem): number | null {
  if (task.estimateMs === null) return null
  return Math.max(0, task.estimateMs - totalTrackedMs(task))
}

/** Estimated-vs-spent progress, 0–100 (0 when there is no estimate). */
export function estimateProgressPct(task: TaskItem): number {
  if (task.estimateMs === null || task.estimateMs <= 0) return 0
  return Math.min(100, Math.round((totalTrackedMs(task) / task.estimateMs) * 100))
}

/**
 * Human estimate text, SP-calm: `45m`, `1h 30m`, `2h`, `7h 15m` — hours
 * whole, minutes remainder; zero collapses to `0m`. Negative/NaN → `—`
 * (an invalid estimate has no honest rendering).
 */
export function formatEstimate(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return '—'
  const totalMinutes = Math.round(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

/** Remaining-time text (`formatEstimate` of `estimateRemainingMs`). */
export function formatEstimateRemaining(task: TaskItem): string {
  return formatEstimate(estimateRemainingMs(task))
}
