/**
 * Tasks — work context (S3-43): SP's per-context today-time totals and the
 * tracked window title.
 *
 * Two pure pieces the UI layer consumes:
 *
 * 1. {@link workContextTotals} — per-PROJECT and per-TAG tracked time for
 *    one day (SP's "WorkContext totals"): a task's tracked minutes count
 *    toward its project bucket and toward EVERY tag it carries (SP's
 *    multi-tag attribution). The inbox is the `null` project bucket. This
 *    is the display rollup — the authoritative history stays in the
 *    append-only session log (S3-10).
 *
 * 2. {@link trackedTitle} — the browser-tab title SP shows while tracking:
 *    `12m · Task title` with the current task's today-time, falling back to
 *    `Today 1h 5m` (total across tasks) when nothing is being tracked, and
 *    the app default when the day is empty.
 *
 * No clock reads, no DOM: `day` and the title parts are injected, so tests
 * and the hook stay deterministic. The DOM write lives in the client hook
 * (`apps/web/src/lib/use-tracked-title.ts`).
 */
import { trackedOnDay } from './time-tracking'
import { formatTracked } from './time-tracking'

/** Minimal task shape the totals need (structural — keeps tests light). */
export interface WorkContextTask {
  id: number
  projectId: number | null
  tagIds: readonly number[]
  timeSpentOnDay: Record<string, number>
}

/** The default tab title (restored when there is nothing to show). */
export const DEFAULT_TAB_TITLE = 'Learning HUB'

/** Result of {@link workContextTotals}. */
export interface WorkContextTotals {
  /** Project id → ms tracked that day (`null` key = the inbox). */
  perProject: Map<number | null, number>
  /** Tag id → ms tracked that day (a task counts toward each of its tags). */
  perTag: Map<number, number>
  /** Everything tracked that day, across all tasks. */
  todayTotalMs: number
}

/**
 * Per-context tracked-time totals for `day`: per project (inbox = null
 * key) and per tag (multi-tag tasks contribute to each tag), plus the day
 * total. Tasks are NOT filtered by done/won't-do here — tracked time is
 * historical fact, so completed work still counts (SP parity).
 */
export function workContextTotals(
  tasks: readonly WorkContextTask[],
  day: string,
): WorkContextTotals {
  const perProject = new Map<number | null, number>()
  const perTag = new Map<number, number>()
  let todayTotalMs = 0

  for (const task of tasks) {
    const ms = trackedOnDay(task, day)
    if (ms <= 0) continue
    todayTotalMs += ms

    const projectKey = task.projectId
    perProject.set(projectKey, (perProject.get(projectKey) ?? 0) + ms)

    for (const tagId of task.tagIds) {
      perTag.set(tagId, (perTag.get(tagId) ?? 0) + ms)
    }
  }

  return { perProject, perTag, todayTotalMs }
}

/**
 * The SP tab title for the tracking state:
 * - tracking a task: `12m · Write the spec`;
 * - idle but the day has time: `Today 1h 5m`;
 * - empty day: the app default.
 */
export function trackedTitle(input: {
  /** The task being tracked right now (null = idle). */
  currentTaskTitle: string | null
  /** The current task's tracked ms for today (0 when unknown/idle). */
  currentTaskMs: number
  /** The whole day's tracked ms across tasks. */
  todayTotalMs: number
}): string {
  if (input.currentTaskTitle !== null) {
    return `${formatTracked(input.currentTaskMs)} · ${input.currentTaskTitle}`
  }
  if (input.todayTotalMs > 0) {
    return `Today ${formatTracked(input.todayTotalMs)}`
  }
  return DEFAULT_TAB_TITLE
}
