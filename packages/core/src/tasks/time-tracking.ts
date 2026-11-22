/**
 * Tasks — time-tracking core (S3-10): SP's per-task time model.
 *
 * Two layers, both pure:
 * 1. The per-day map on the task (`timeSpentOnDay`, S3-01) — the display
 *    truth: `day → ms worked that day`.
 * 2. The session log (`task_time_logs`, S3-02) — the append-only history:
 *    one row per tracked session with a `source` (manual / focus / idle).
 *
 * This module owns the merge between the two (SP's "merge/conflict" rule):
 * the map is the SUM of session rows per day, so re-deriving after a
 * correction (S3-28) or an out-of-order tick is deterministic — last
 * writer wins by recomputation, never by mutating history (rule 8 spirit).
 *
 * Ticks are quantized to whole seconds (SP rounds ticks); breaks never
 * count (S3-81's guard lives here as `applyTick` refusing break sources).
 */
import type { TaskItem } from './shared'

/** Where a tracked session came from. */
export type TimeLogSource = 'manual' | 'focus' | 'idle'

/** One tracked session (mirrors `task_time_logs`, S3-02). */
export interface TimeLog {
  /** Row id; `0` = unpersisted draft. */
  id: number
  taskId: number
  /** `YYYY-MM-DD` the work counts toward. */
  day: string
  /** Session length in whole seconds × 1000. */
  sessionMs: number
  /** Session start (full ISO); null for manually entered totals. */
  startedAt: string | null
  source: TimeLogSource
  createdAt: string
}

/** The per-day map shape on `task_items`. */
export type TimeSpentOnDay = Record<string, number>

/** Quantization: ticks below this granularity are dropped (SP rounds to 1s). */
export const TICK_MIN_MS = 1_000

/** Upper bound for one session row (8h) — typos in manual entries get caught. */
export const SESSION_MAX_MS = 8 * 3_600_000

/** Date part of any ISO timestamp (UTC calendar day). */
export function dayKeyOf(iso: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso)
  return m ? (m[1] ?? null) : null
}

/** Validate + normalize one session row (drops sub-second, over-cap, junk). */
export function normalizeSession(
  log: Omit<TimeLog, 'id' | 'createdAt'> & { id?: number; createdAt?: string },
): TimeLog | null {
  if (!Number.isFinite(log.sessionMs) || log.sessionMs < TICK_MIN_MS) return null
  if (log.sessionMs > SESSION_MAX_MS) return null
  const day = dayKeyOf(log.startedAt ?? `${log.day}T00:00:00.000Z`) ?? log.day
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  return {
    id: log.id ?? 0,
    taskId: log.taskId,
    day,
    sessionMs: Math.round(log.sessionMs),
    startedAt: log.startedAt ?? null,
    source: log.source,
    createdAt: log.createdAt ?? new Date(0).toISOString(),
  }
}

/** Add ms for one day to a per-day map (pure; zero-length additions no-op). */
export function addTimeToDay(map: TimeSpentOnDay, day: string, ms: number): TimeSpentOnDay {
  if (!Number.isFinite(ms) || ms === 0) return map
  return { ...map, [day]: Math.max(0, (map[day] ?? 0) + ms) }
}

/**
 * Apply one session tick to a task: merge into the per-day map. Break
 * sources never count (`isBreak` — S3-81's guard); invalid sessions are
 * returned unchanged (a tick that quantizes to nothing is a no-op, not an
 * error).
 */
export function applyTick(
  task: TaskItem,
  log: Omit<TimeLog, 'id' | 'createdAt' | 'taskId'> & {
    id?: number
    taskId?: number
    createdAt?: string
  },
  opts: { isBreak?: boolean } = {},
): TaskItem {
  if (opts.isBreak) return task
  const normalized = normalizeSession({ ...log, taskId: log.taskId ?? task.id })
  if (normalized === null) return task
  return {
    ...task,
    timeSpentOnDay: addTimeToDay(task.timeSpentOnDay, normalized.day, normalized.sessionMs),
    updatedAt: task.updatedAt, // time ticks do not bump the task's content timestamp
  }
}

/**
 * THE merge rule: recompute the per-day map from the append-only session
 * log. Deterministic and order-independent — after any correction or
 * out-of-order write, the map is re-derived, never patched by hand.
 */
export function mergeTimeLogs(logs: TimeLog[]): TimeSpentOnDay {
  const map: TimeSpentOnDay = {}
  for (const log of logs) {
    if (log.taskId === undefined) continue
    map[log.day] = (map[log.day] ?? 0) + log.sessionMs
  }
  return map
}

/** Rebuild a task's map from its session rows (the S3-18 handler's write path). */
export function recomputeTaskTime(task: TaskItem, logs: TimeLog[]): TaskItem {
  const own = logs.filter((l) => l.taskId === task.id)
  return { ...task, timeSpentOnDay: mergeTimeLogs(own) }
}

/** Worked ms on one specific day (0 when none). */
export function trackedOnDay(task: Pick<TaskItem, 'timeSpentOnDay'>, day: string): number {
  return task.timeSpentOnDay[day] ?? 0
}

/** Human "worked today" text for the tick indicator (S3-77): `12m`, `1h 5m`. */
export function formatTracked(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}
