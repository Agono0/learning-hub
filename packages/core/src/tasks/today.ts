/**
 * Tasks — Today membership (S3-65): SP's "Today" is the virtual tag whose
 * members are tasks whose DUE date is today — due date only, nothing else.
 *
 * Not membership: done/not-done (Today keeps completed ones checked — the
 * view filters), won't-do (S3-66 excludes those from counts), priority,
 * tags, planner assignment. One rule, one source of truth; the virtual tag
 * id (`TODAY_VIRTUAL_TAG_ID`, S3-06) wires it into tag filters.
 *
 * Pure: `today` arrives as `YYYY-MM-DD` (callers inject; the UI passes the
 * device-local day). No clock reads.
 */
import type { TaskItem } from './shared'

const DAY_MS = 86_400_000

/** Date part of any due value (`YYYY-MM-DD` date-only or full ISO). */
export function dueDayOf(task: Pick<TaskItem, 'due'>): string | null {
  if (task.due === null) return null
  // Timed dues carry a full ISO — the calendar day is the date part (UTC).
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(task.due)
  return m ? (m[1] ?? null) : null
}

/** The day key for "tomorrow", from an injected today. */
export function tomorrowKey(today: string): string {
  const ms = Date.parse(`${today}T00:00:00.000Z`)
  return new Date(ms + DAY_MS).toISOString().slice(0, 10)
}

/**
 * Today membership: the task's due DAY equals `today`. Exactly SP's rule —
 * a timed task due later today IS in Today; a task due tomorrow is not,
 * no matter how urgent.
 */
export function isTodayTask(task: TaskItem, today: string): boolean {
  return dueDayOf(task) === today
}

/**
 * Overdue: due day strictly BEFORE `today`, still open, and not won't-do.
 * Done tasks are historical fact, not debt; won't-do ones were explicitly
 * written off (S3-66 excludes them everywhere).
 */
export function isOverdueTask(task: TaskItem, today: string): boolean {
  if (task.isDone || task.wonthado) return false
  const day = dueDayOf(task)
  return day !== null && day < today
}

/** Open, not-won't-do tasks due exactly today (the Today list body). */
export function todaysTasks(tasks: TaskItem[], today: string): TaskItem[] {
  return tasks.filter((t) => isTodayTask(t, today) && !t.isDone && !t.wonthado)
}

/** Open overdue tasks, oldest due first (the "from previous days" row). */
export function overdueTasks(tasks: TaskItem[], today: string): TaskItem[] {
  return tasks
    .filter((t) => isOverdueTask(t, today))
    .sort((a, b) => (dueDayOf(a) ?? '').localeCompare(dueDayOf(b) ?? ''))
}

/** Count for the Today chip — open tasks due today, won't-do excluded. */
export function todayCount(tasks: TaskItem[], today: string): number {
  return todaysTasks(tasks, today).length
}
