/**
 * Tasks — grouping (S3-61): pure helpers to group a task list by project,
 * tag or due-day for the view layer (S3-20 sections, S3-24 boards, S3-46
 * rollups).
 *
 * Groups are ordered by a stable policy (untitled/no-value last), members
 * keep input order (the caller's sort survives), and grouping NEVER
 * mutates. Won't-do tasks are excluded by the tasks passed in — these
 * helpers group what they see (S3-66 filters upstream).
 */
import type { TaskItem } from './shared'

/** One named group with its members (input order preserved). */
export interface TaskGroup<T extends TaskItem = TaskItem> {
  /** Group key: project id, tag id, or day key. */
  key: string
  /** Display label (null for the unassigned bucket — the UI renders it). */
  label: string | null
  members: T[]
}

function groupBy<T extends TaskItem>(
  tasks: T[],
  keyOf: (task: T) => string | null,
  labelOf: (key: string) => string | null,
  opts: { unassignedKey?: string; sortKeys?: (a: string, b: string) => number } = {},
): TaskGroup<T>[] {
  const unassignedKey = opts.unassignedKey ?? '__none__'
  const buckets = new Map<string, T[]>()
  for (const task of tasks) {
    const key = keyOf(task) ?? unassignedKey
    const bucket = buckets.get(key)
    if (bucket) bucket.push(task)
    else buckets.set(key, [task])
  }
  const keys = [...buckets.keys()]
  const unassigned = keys.includes(unassignedKey)
  const real = keys.filter((k) => k !== unassignedKey)
  if (opts.sortKeys) real.sort(opts.sortKeys)
  const ordered = [...real, ...(unassigned ? [unassignedKey] : [])]
  return ordered.map((key) => ({
    key,
    label: key === unassignedKey ? null : labelOf(key),
    members: buckets.get(key) ?? [],
  }))
}

/**
 * Group by project (bucket per `projectId`; inbox/unassigned LAST with a
 * null label). `resolveProject` turns a project id into its display title.
 */
export function groupByProject<T extends TaskItem>(
  tasks: T[],
  resolveProject: (projectId: number) => string,
): TaskGroup<T>[] {
  return groupBy(
    tasks,
    (t) => (t.projectId === null ? null : String(t.projectId)),
    (key) => resolveProject(Number(key)),
  )
}

/**
 * Group by tag (a task with 3 tags appears in all 3 buckets AND is skipped
 * from the untagged bucket; SP's list groups behave this way). Tagless
 * tasks land in the untagged bucket (last, null label).
 */
export function groupByTag<T extends TaskItem>(
  tasks: T[],
  resolveTag: (tagId: number) => string,
): TaskGroup<T>[] {
  const map = new Map<string, { label: string; members: T[] }>()
  const untagged: T[] = []
  for (const task of tasks) {
    if (task.tagIds.length === 0) {
      untagged.push(task)
      continue
    }
    for (const tagId of task.tagIds) {
      const key = String(tagId)
      const bucket = map.get(key)
      if (bucket) bucket.members.push(task)
      else map.set(key, { label: resolveTag(tagId), members: [task] })
    }
  }
  const groups: TaskGroup<T>[] = [...map.entries()].map(([key, b]) => ({
    key,
    label: b.label,
    members: b.members,
  }))
  if (untagged.length > 0) groups.push({ key: '__none__', label: null, members: untagged })
  return groups
}

/**
 * Group by due day (day-keyed buckets: overdue days first — oldest due
 * last? No: oldest first, matching the overdue row's sort — then today,
 * then future days ascending; undated tasks go last, null label). `today`
 * is injected (`YYYY-MM-DD`).
 */
export function groupByDueDay<T extends TaskItem>(tasks: T[], today: string): TaskGroup<T>[] {
  const dated = new Map<string, T[]>()
  const undated: T[] = []
  for (const task of tasks) {
    const day = dueDay(task)
    if (day === null) undated.push(task)
    else {
      const bucket = dated.get(day)
      if (bucket) bucket.push(task)
      else dated.set(day, [task])
    }
  }
  const keys = [...dated.keys()]
  const past = keys.filter((k) => k < today).sort()
  const todayKey = keys.filter((k) => k === today)
  const future = keys.filter((k) => k > today).sort()
  const ordered = [...past, ...todayKey, ...future]
  const groups: TaskGroup<T>[] = ordered.map((key) => ({
    key,
    label: key === today ? 'Today' : key,
    members: dated.get(key) ?? [],
  }))
  if (undated.length > 0) groups.push({ key: '__none__', label: null, members: undated })
  return groups
}

/** Date part of a due value (timed dues keep their calendar day). */
function dueDay(task: Pick<TaskItem, 'due'>): string | null {
  if (task.due === null) return null
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(task.due)
  return m ? (m[1] ?? null) : null
}

/** Member ids per group — the cheap shape rollups (S3-46) start from. */
export function groupIds(
  groups: Array<{ key: string; members: Array<{ id: number }> }>,
): Array<{ key: string; ids: number[] }> {
  return groups.map((g) => ({ key: g.key, ids: g.members.map((m) => m.id) }))
}
