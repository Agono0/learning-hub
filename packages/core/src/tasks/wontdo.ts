/**
 * Tasks — won't-do state (S3-66): SP's explicit "I'm not doing this".
 *
 * A won't-do task is written off, not deleted: it leaves every count and
 * list (Today, overdue, project totals) while keeping its history for the
 * archive/trash (S3-11/S3-12) and for a later change of heart
 * (`reopenTask` in S3-03 clears it).
 *
 * This module is the count-exclusion authority so callers cannot
 * accidentally count won't-do tasks.
 */
import type { TaskItem } from './index'

/** True when the task is written off (excluded from all counts). */
export function isWontDo(task: Pick<TaskItem, 'wonthado'>): boolean {
  return task.wonthado
}

/**
 * Mark (or un-mark) a task as won't-do — immutable copy, `updatedAt`
 * bumped. Completing a won't-do task is blocked in S3-03
 * (`completeTask` throws), so the state machine stays coherent:
 * open ↔ won't-do ↔ open, never won't-do → done directly.
 */
export function setWontDo(task: TaskItem, wontDo: boolean, now: string): TaskItem {
  if (task.wonthado === wontDo) return task
  if (wontDo && task.isDone) {
    // Kept unreachable by bulkApply/S3-03, but guarded here too — a done
    // task has nothing to write off.
    return task
  }
  return { ...task, wonthado: wontDo, updatedAt: now }
}

/**
 * Count-exclusion filter: drop won't-do (and optionally done) tasks from a
 * list before counting or summing. Order preserved. This is the ONLY way
 * views should build counts — a won't-do task must never inflate a number.
 */
export function withoutWontDo<T extends Pick<TaskItem, 'wonthado' | 'isDone'>>(
  tasks: T[],
  opts: { excludeDone?: boolean } = {},
): T[] {
  return tasks.filter((t) => !t.wonthado && (!opts.excludeDone || !t.isDone))
}

/**
 * Won't-do-aware total: convenience over `withoutWontDo` for the common
 * "sum a numeric field over live tasks" case (open tasks by default;
 * pass `excludeDone: false` to include finished ones).
 */
export function countLiveTasks(tasks: TaskItem[], opts: { excludeDone?: boolean } = {}): number {
  return withoutWontDo(tasks, opts).length
}
