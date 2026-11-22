/**
 * Tasks — subtasks (S3-04): SP's exactly-one-nesting-level model.
 *
 * A subtask is a {@link TaskItem} whose `parentId` points at a task; a task
 * may itself never be a subtask of a subtask (SP invariant, enforced here).
 * The parent aggregates its children: tracked time and estimates roll up
 * into the parent's own values (SP shows the parent's totals in the list,
 * with the (done/total) checklist progress badge — S3-69 renders it).
 *
 * Pure functions over the S3-03 domain; illegal transitions throw
 * {@link TaskDomainError} like the rest of the domain.
 */
import { TaskDomainError, type TaskItem } from './shared'

// ── Nesting rules ───────────────────────────────────────────────────────────

/** True when this task may receive subtasks (it is not itself a subtask). */
export function canHaveSubtasks(task: Pick<TaskItem, 'parentId' | 'isDone' | 'wonthado'>): boolean {
  return task.parentId === null && !task.isDone && !task.wonthado
}

/**
 * Point `sub` at `parent` (immutably). Checks:
 * - the subtask must not already have a parent (re-attach via detach first);
 * - the parent must be parentable ({@link canHaveSubtasks});
 * - a task cannot be its own parent.
 *
 * Throws {@link TaskDomainError} with codes `subtask-depth`, `subtask-attached`
 * and `subtask-self` respectively.
 */
export function attachSubtask(parent: TaskItem, sub: TaskItem, now: string): TaskItem {
  if (sub.id === parent.id) {
    throw new TaskDomainError('subtask-self', 'A task cannot be its own parent.')
  }
  if (!canHaveSubtasks(parent)) {
    throw new TaskDomainError(
      'subtask-depth',
      'Subtasks cannot nest further — SP allows exactly one level.',
    )
  }
  if (sub.parentId !== null) {
    throw new TaskDomainError(
      'subtask-attached',
      'This task already has a parent — detach it first.',
    )
  }
  return { ...sub, parentId: parent.id, updatedAt: now }
}

/** Clear a subtask's parent link (immutably); it becomes a standalone task. */
export function detachSubtask(sub: TaskItem, now: string): TaskItem {
  if (sub.parentId === null) return sub
  return { ...sub, parentId: null, updatedAt: now }
}

// ── Aggregation ─────────────────────────────────────────────────────────────

/** Checklist progress for one parent (S3-69 renders `2/5`). */
export interface SubtaskProgress {
  /** Number of direct subtasks. */
  total: number
  /** How many are done. */
  done: number
  /** 0–100, rounded; 0 when there are no subtasks. */
  pct: number
}

/**
 * Progress of a parent's direct subtasks, in list order (`order`, then id).
 * Deep nesting is impossible (one level), so a single pass suffices.
 */
export function subtaskProgress(tasks: TaskItem[], parentId: number): SubtaskProgress {
  const subs = tasks
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.id - b.id)
  const done = subs.filter((t) => t.isDone).length
  const total = subs.length
  return { total, done, pct: total === 0 ? 0 : Math.round((done / total) * 100) }
}

/**
 * Merge per-day time maps: sum of ms per day key. Used to roll subtask
 * tracking up into the parent (S3-10 reads the parent map).
 */
function mergeTimeMaps(maps: Array<Record<string, number>>): Record<string, number> {
  const merged: Record<string, number> = {}
  for (const map of maps) {
    for (const [day, ms] of Object.entries(map)) {
      merged[day] = (merged[day] ?? 0) + ms
    }
  }
  return merged
}

/**
 * Roll subtask time and estimates up into the parent — SP's aggregate
 * display: the parent's `timeSpentOnDay` becomes own + children's, and
 * `estimateMs` becomes own + children's (null own + children = the sum;
 * both null = null). Returns the updated parent copy; children untouched.
 */
export function aggregateSubtasks(parent: TaskItem, subs: TaskItem[]): TaskItem {
  const childMaps = subs.map((s) => s.timeSpentOnDay)
  const estimates = subs.map((s) => s.estimateMs).filter((e): e is number => e !== null)

  const timeSpentOnDay = mergeTimeMaps([parent.timeSpentOnDay, ...childMaps])

  let estimateMs = parent.estimateMs
  if (estimates.length > 0) {
    estimateMs = (parent.estimateMs ?? 0) + estimates.reduce((a, b) => a + b, 0)
  }

  return { ...parent, timeSpentOnDay, estimateMs, updatedAt: parent.updatedAt }
}

/**
 * Convenience: aggregate for a parent id looked up inside `tasks` (returns
 * the parent unchanged when it is absent). Completion state is intentionally
 * NOT rolled up — SP keeps subtask doneness per child; the parent only shows
 * the progress badge ({@link subtaskProgress}).
 */
export function withSubtaskAggregates(tasks: TaskItem[], parentId: number): TaskItem | null {
  const parent = tasks.find((t) => t.id === parentId)
  if (!parent) return null
  const subs = tasks.filter((t) => t.parentId === parentId)
  return aggregateSubtasks(parent, subs)
}
