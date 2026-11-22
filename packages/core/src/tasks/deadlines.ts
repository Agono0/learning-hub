/**
 * Tasks — deadlines (S3-63): deadline-vs-due semantics and past-deadline
 * flagging.
 *
 * SP distinguishes a task's DUE date (when you plan to do it — soft, the
 * Today tag reads it, S3-65) from its DEADLINE (when it must absolutely be
 * done — hard, flagged red when in the past). This module is the single
 * authority for that distinction and for computing urgency badges; S3-45
 * renders them.
 *
 * Pure: `today` comes in as a `YYYY-MM-DD` string (S3-65 owns the real
 * today key; tests inject). No clock reads.
 */
import type { TaskItem } from './index'

/** How urgent the deadline is, for badge rendering (S3-45). */
export type DeadlineUrgency = 'none' | 'past' | 'today' | 'soon' | 'later'

/** Days ahead that still count as "soon" (SP's 3-day deadline warning). */
export const DEADLINE_SOON_DAYS = 3

/** Day number for `YYYY-MM-DD` (UTC-anchored, DST-safe). */
function dayNumber(day: string): number {
  const ms = Date.parse(`${day}T00:00:00.000Z`)
  if (Number.isNaN(ms)) return Number.NaN
  return ms / 86_400_000
}

/**
 * The task's effective deadline day: the explicit `deadline`, or null when
 * none. (Due dates are intentionally NOT used as deadlines — that is the
 * whole point of the distinction; a task due today that slips is fine, a
 * missed deadline is not.)
 */
export function deadlineOf(task: Pick<TaskItem, 'deadline'>): string | null {
  return task.deadline
}

/**
 * Urgency of the deadline relative to `today` (a `YYYY-MM-DD` string):
 * - `past` — deadline day is before today (missed; the badge turns red);
 * - `today` — due exactly today;
 * - `soon` — within {@link DEADLINE_SOON_DAYS} days (inclusive);
 * - `later` — further out;
 * - `none` — no deadline (or an unparseable one, which we refuse to judge).
 */
export function deadlineUrgency(task: Pick<TaskItem, 'deadline'>, today: string): DeadlineUrgency {
  if (task.deadline === null) return 'none'
  const dl = dayNumber(task.deadline)
  const t = dayNumber(today)
  if (Number.isNaN(dl) || Number.isNaN(t)) return 'none'
  if (dl < t) return 'past'
  if (dl === t) return 'today'
  if (dl - t <= DEADLINE_SOON_DAYS) return 'soon'
  return 'later'
}

/**
 * True when the deadline has passed (strictly before `today`). Done tasks
 * are never "overdue" — the flag exists to nag open work; S3-45 gates on
 * `isDone` for the red styling, and this predicate answers the raw question.
 */
export function isPastDeadline(
  task: Pick<TaskItem, 'deadline' | 'isDone'>,
  today: string,
): boolean {
  return !task.isDone && deadlineUrgency(task, today) === 'past'
}

/**
 * Sort tasks by deadline pressure: past first, then today, soon, later,
 * none — stable within groups (input order preserved), so lists never
 * jitter when several tasks share a day.
 */
export function sortByDeadline<T extends Pick<TaskItem, 'deadline' | 'isDone'>>(
  tasks: T[],
  today: string,
): T[] {
  const rank: Record<DeadlineUrgency, number> = { past: 0, today: 1, soon: 2, later: 3, none: 4 }
  return [...tasks]
    .map((task, i) => ({ task, i, r: rank[deadlineUrgency(task, today)] }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.task)
}
