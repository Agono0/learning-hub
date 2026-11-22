/**
 * Tasks — priority model (S3-64): SP's p1..p3 ladder + tag strategies.
 *
 * The stored ladder is `none < low < medium < high` (short-syntax maps
 * SP's `p1..p3` onto it). On top sits SP's "strategies" idea: a tag can
 * BOOST the effective priority of anything carrying it (`#urgent` lifts a
 * task to `high` regardless of its own setting). Effective priority is
 * max(base, boosts); the base value is never mutated.
 *
 * Pure; S3-45 renders the badges, S3-24/S3-20 sort with
 * {@link compareByEffectivePriority}.
 */
import type { TaskItem, TaskPriority } from './shared'

/** Sort rank of a priority (higher = more urgent). */
export function priorityRank(priority: TaskPriority): number {
  switch (priority) {
    case 'high':
      return 3
    case 'medium':
      return 2
    case 'low':
      return 1
    case 'none':
      return 0
  }
}

/** A tag-driven boost (SP strategy): tasks with `tagId` act as `boost`. */
export interface PriorityStrategy {
  tagId: number
  /** The priority anything carrying this tag behaves as. */
  boost: TaskPriority
}

/**
 * The effective priority: the task's own setting lifted by matching tag
 * strategies (max wins). Strategies referencing tags the task does not
 * carry are ignored.
 */
export function effectivePriority(
  task: TaskItem,
  strategies: PriorityStrategy[] = [],
): TaskPriority {
  let best: TaskPriority = task.priority
  let bestRank = priorityRank(best)
  for (const strategy of strategies) {
    if (!task.tagIds.includes(strategy.tagId)) continue
    const rank = priorityRank(strategy.boost)
    if (rank > bestRank) {
      best = strategy.boost
      bestRank = rank
    }
  }
  return best
}

/**
 * Descending urgency comparator (most urgent first), stable for ties
 * (input order preserved). Use with `.sort()` on any task list.
 */
export function compareByEffectivePriority(
  strategies: PriorityStrategy[] = [],
): (a: TaskItem, b: TaskItem) => number {
  return (a, b) =>
    priorityRank(effectivePriority(b, strategies)) - priorityRank(effectivePriority(a, strategies))
}

/**
 * Badge label for S3-45: SP's `p1..p3` wording (high = p1), empty string
 * for `none` (no badge — calm by default).
 */
export function priorityBadge(priority: TaskPriority): string {
  switch (priority) {
    case 'high':
      return 'p1'
    case 'medium':
      return 'p2'
    case 'low':
      return 'p3'
    case 'none':
      return ''
  }
}
