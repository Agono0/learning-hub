/**
 * Tasks — the Super Productivity-parity task domain (mega-run Epic 3).
 *
 * Pure model + ops over the `task_items` shape persisted by
 * `packages/db` (S3-01 batch A). Everything here is deterministic and
 * I/O-free (core rule): no DB, no fetch, no clock reads — callers pass
 * `now` so tests and handlers stay in control of time.
 *
 * House conventions (mirrors `habits.ts`):
 * - zod schemas at the construction boundary (`createTaskInputSchema` /
 *   `updateTaskInputSchema` parse before anything else runs).
 * - Domain rules surface as issues (`validateTask` → errors + warnings),
 *   while illegal *transitions* (e.g. completing a won't-do task) throw
 *   {@link TaskDomainError} so handlers can map the code to a status.
 * - All ops are immutable: they return a new {@link TaskItem}, never mutate.
 */
import { z } from 'zod'

// ── Primitives ──────────────────────────────────────────────────────────────

/** SP priority ladder (S3-64 maps SP's p1..p3 onto low/medium/high). */
export const taskPrioritySchema = z.enum(['none', 'low', 'medium', 'high'])

/** A task priority. */
export type TaskPriority = z.infer<typeof taskPrioritySchema>

/** Calendar-day key, `YYYY-MM-DD` (keys of timeSpentOnDay; `due` without time). */
export const dayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')

/** ISO timestamp (RFC 3339), used for doneAt/createdAt/updatedAt. */
const timestampSchema = z.string().min(1)

const positiveId = z.number().int().positive()
const nonNegativeMs = z.number().int().nonnegative()

/**
 * The task model — mirrors the `task_items` table (S3-01).
 *
 * `id === 0` means "not persisted yet" (drafts returned by {@link createTask}
 * before the repo assigns the real id); every other id is the DB row id.
 */
export const taskItemSchema = z.object({
  /** Row id; `0` for unpersisted drafts. */
  id: z.number().int().nonnegative(),
  /** Parent task — SP subtasks have exactly one nesting level. */
  parentId: positiveId.nullable(),
  /** Owning project (null = inbox). */
  projectId: positiveId.nullable(),
  /** Tag ids (the `task_item_tags` link rows, denormalized onto the model). */
  tagIds: z.array(positiveId),
  /** Task title, 1–500 chars (SP's task title cap). */
  title: z.string().min(1).max(500),
  /** Free-form notes; markdown rendered by the UI kit, never raw HTML. */
  notes: z.string().nullable(),
  priority: taskPrioritySchema,
  /** Time estimate in milliseconds (null = no estimate). */
  estimateMs: nonNegativeMs.nullable(),
  /**
   * Per-day tracked time in ms — `time_spent_on_day` (S3-10 time-tracking
   * core owns the writes; date keys are `YYYY-MM-DD`).
   */
  timeSpentOnDay: z.record(z.string(), nonNegativeMs),
  /**
   * Due value: `YYYY-MM-DD` when `dueWithTime` is false, a full ISO
   * timestamp when true. Null = no due date.
   */
  due: z.string().nullable(),
  /** True when `due` carries a time of day (SP's dueWithTime flag). */
  dueWithTime: z.boolean(),
  /** Separate hard deadline (S3-63 semantics); null = none. */
  deadline: dayKeySchema.nullable(),
  isDone: z.boolean(),
  /** Completion timestamp; null while open. */
  doneAt: timestampSchema.nullable(),
  /** SP's "won't do" state — excluded from Today/metric counts (S3-66). */
  wonthado: z.boolean(),
  /** Repeat config row this task was projected from (S3-07); null = one-off. */
  repeatCfgId: positiveId.nullable(),
  /** List ordinal (drag order, S3-60). */
  order: z.number().int(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
})

/** The parsed {@link taskItemSchema} shape. */
export type TaskItem = z.infer<typeof taskItemSchema>

// ── Create / update inputs ──────────────────────────────────────────────────

/**
 * Input for {@link createTask}. Only `title` is required — everything else
 * takes the calm default (inbox, no tags, no due, priority `none`).
 */
export const createTaskInputSchema = z.object({
  title: z.string().trim().min(1, 'A task needs a title').max(500),
  parentId: positiveId.nullable().optional(),
  projectId: positiveId.nullable().optional(),
  tagIds: z.array(positiveId).max(50).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  priority: taskPrioritySchema.optional(),
  estimateMs: nonNegativeMs.nullable().optional(),
  due: z.string().max(40).nullable().optional(),
  dueWithTime: z.boolean().optional(),
  deadline: dayKeySchema.nullable().optional(),
  repeatCfgId: positiveId.nullable().optional(),
  order: z.number().int().optional(),
})

/** The parsed {@link createTaskInputSchema} shape. */
export type CreateTaskInput = z.infer<typeof createTaskInputSchema>

/**
 * Input for {@link updateTask} — every field optional; constraints still
 * apply when a field is present (e.g. an empty trimmed title is rejected).
 */
export const updateTaskInputSchema = createTaskInputSchema.partial()

/** The parsed {@link updateTaskInputSchema} shape. */
export type UpdateTaskInput = z.infer<typeof updateTaskInputSchema>

/** Error thrown for illegal task transitions (mapped to 4xx by handlers). */
export class TaskDomainError extends Error {
  /** Stable machine code, e.g. `wontdo-cannot-complete`. */
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'TaskDomainError'
    this.code = code
  }
}

/** Domain-rule check result (habits.ts style): blockers + advisories. */
export interface TaskValidation {
  /** True when there are no blocking errors. */
  ok: boolean
  /** Blocking problems — the task must not be persisted/applied. */
  errors: string[]
  /** Advisories that do not block (e.g. deadline earlier than due). */
  warnings: string[]
}

// ── Ops ─────────────────────────────────────────────────────────────────────

/**
 * Build a new task from validated input, applying the SP-parity defaults.
 *
 * Pure: `now` stamps createdAt/updatedAt; the returned task has `id: 0`
 * (the repo assigns the real id on insert). Throws a zod error when the
 * input violates the schema (handlers catch and map to 400).
 */
export function createTask(input: CreateTaskInput, now: string): TaskItem {
  const v = createTaskInputSchema.parse(input)
  return {
    id: 0,
    parentId: v.parentId ?? null,
    projectId: v.projectId ?? null,
    tagIds: v.tagIds ?? [],
    title: v.title,
    notes: v.notes ?? null,
    priority: v.priority ?? 'none',
    estimateMs: v.estimateMs ?? null,
    timeSpentOnDay: {},
    due: v.due ?? null,
    dueWithTime: v.dueWithTime ?? false,
    deadline: v.deadline ?? null,
    isDone: false,
    doneAt: null,
    wonthado: false,
    repeatCfgId: v.repeatCfgId ?? null,
    order: v.order ?? 0,
    createdAt: now,
    updatedAt: now,
  }
}

/**
 * Apply a validated patch immutably. `updatedAt` is always bumped to `now`;
 * completing/reopening belongs to {@link completeTask}/{@link reopenTask}
 * (pass `isDone` here only for bulk paths — they go through
 * {@link bulkApply}, the one grading-adjacent path for batch changes).
 */
export function updateTask(task: TaskItem, patch: UpdateTaskInput, now: string): TaskItem {
  const v = updateTaskInputSchema.parse(patch)
  return { ...task, ...v, updatedAt: now }
}

/**
 * Mark a task done (SP: completing sets the done timestamp). Won't-do tasks
 * are not completable — cancel the won't-do first ({@link reopenTask} clears
 * it). Throws {@link TaskDomainError} (`wontdo-cannot-complete`).
 */
export function completeTask(task: TaskItem, now: string): TaskItem {
  if (task.wonthado) {
    throw new TaskDomainError(
      'wontdo-cannot-complete',
      'This task is marked as "won\u2019t do" — unmark it before completing.',
    )
  }
  if (task.isDone) return task
  return { ...task, isDone: true, doneAt: now, updatedAt: now }
}

/**
 * Reopen a done task (or un-mark a won't-do): clears both flags and the
 * done timestamp. Open tasks pass through unchanged.
 */
export function reopenTask(task: TaskItem, now: string): TaskItem {
  if (!task.isDone && !task.wonthado) return task
  return { ...task, isDone: false, doneAt: null, wonthado: false, updatedAt: now }
}

/**
 * SP-style duplicate: `(copy)` suffix, fresh id (0 = unpersisted), not done,
 * empty per-day time map, same tags/project/priority/estimate. `order`
 * lands directly below the source (+1) — repos may renumber the list
 * afterwards (S3-60 owns the ordering math).
 */
export function duplicateTask(
  task: TaskItem,
  now: string,
  overrides: UpdateTaskInput = {},
): TaskItem {
  const v = updateTaskInputSchema.parse(overrides)
  return {
    ...task,
    ...v,
    id: 0,
    title: (v.title ?? `${task.title} (copy)`).slice(0, 500),
    isDone: false,
    doneAt: null,
    wonthado: false,
    timeSpentOnDay: {},
    order: v.order ?? task.order + 1,
    createdAt: now,
    updatedAt: now,
  }
}

// ── Bulk ────────────────────────────────────────────────────────────────────

/** Operations {@link bulkApply} can run over a selection of tasks. */
export const bulkOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('complete') }),
  z.object({ op: z.literal('reopen') }),
  z.object({ op: z.literal('wontdo') }),
  z.object({ op: z.literal('setPriority'), priority: taskPrioritySchema }),
  z.object({ op: z.literal('setProject'), projectId: positiveId.nullable() }),
  z.object({ op: z.literal('addTags'), tagIds: z.array(positiveId).min(1) }),
  z.object({ op: z.literal('removeTags'), tagIds: z.array(positiveId).min(1) }),
])

/** The parsed {@link bulkOpSchema} shape. */
export type BulkOp = z.infer<typeof bulkOpSchema>

/** One task the bulk op could not apply, with the reason. */
export interface BulkSkip {
  id: number
  reason: string
}

/** Result of {@link bulkApply}. */
export interface BulkResult {
  /** Successfully transformed tasks (immutable copies, in input order). */
  applied: TaskItem[]
  /** Tasks skipped, with the human-readable reason. */
  skipped: BulkSkip[]
}

/**
 * Apply one operation across a selection of tasks — the single batch path
 * for complete/reopen/won't-do/project/tag changes (handlers S3-16 call
 * this, then persist each resulting row transactionally).
 *
 * Per-task failures (e.g. completing a won't-do) never abort the batch:
 * they land in `skipped` with the reason. Unknown task ids in the selection
 * are skipped as `not found`.
 */
export function bulkApply(
  selection: Array<TaskItem | undefined>,
  op: BulkOp,
  now: string,
): BulkResult {
  const applied: TaskItem[] = []
  const skipped: BulkSkip[] = []
  for (const task of selection) {
    if (!task) {
      skipped.push({ id: 0, reason: 'not found' })
      continue
    }
    try {
      switch (op.op) {
        case 'complete':
          applied.push(completeTask(task, now))
          break
        case 'reopen':
          applied.push(reopenTask(task, now))
          break
        case 'wontdo':
          if (task.isDone) {
            skipped.push({
              id: task.id,
              reason: 'done tasks cannot be marked won\u2019t do',
            })
            break
          }
          applied.push({ ...task, wonthado: !task.wonthado, updatedAt: now })
          break
        case 'setPriority':
          applied.push(updateTask(task, { priority: op.priority }, now))
          break
        case 'setProject':
          applied.push(updateTask(task, { projectId: op.projectId }, now))
          break
        case 'addTags':
          applied.push(
            updateTask(task, { tagIds: [...new Set([...task.tagIds, ...op.tagIds])] }, now),
          )
          break
        case 'removeTags':
          applied.push(
            updateTask(task, { tagIds: task.tagIds.filter((id) => !op.tagIds.includes(id)) }, now),
          )
          break
      }
    } catch (err) {
      skipped.push({
        id: task.id,
        reason: err instanceof TaskDomainError ? err.message : 'operation failed',
      })
    }
  }
  return { applied, skipped }
}

// ── Validation ──────────────────────────────────────────────────────────────

/**
 * Domain-rule check (habits.ts style). Blocking errors mean the task should
 * not be persisted; warnings are advisories the UI may surface inline.
 *
 * Rules:
 * - `dueWithTime` requires a due value, and it must parse as a full ISO
 *   timestamp; without `dueWithTime`, a due value must be `YYYY-MM-DD`.
 * - `estimateMs` must be positive when present (schema allows 0 — a zero
 *   estimate is meaningless, so it blocks).
 * - A task cannot be its own parent (S3-04 guards deeper cycles).
 * - `doneAt` set while `isDone` is false is a data inconsistency (blocking).
 * - Deadline earlier than the due date is only a warning (plans slip).
 */
export function validateTask(task: TaskItem): TaskValidation {
  const errors: string[] = []
  const warnings: string[] = []

  if (task.dueWithTime) {
    if (!task.due) {
      errors.push('dueWithTime is set but no due value was given.')
    } else if (Number.isNaN(Date.parse(task.due)) || !task.due.includes('T')) {
      errors.push('A timed due must be a full ISO timestamp (e.g. 2026-11-22T14:00).')
    }
  } else if (task.due && !dayKeySchema.safeParse(task.due).success) {
    errors.push('A date-only due must be YYYY-MM-DD.')
  }

  if (task.estimateMs !== null && task.estimateMs <= 0) {
    errors.push('Time estimate must be greater than zero.')
  }

  if (task.parentId !== null && task.parentId === task.id) {
    errors.push('A task cannot be its own parent.')
  }

  if (!task.isDone && task.doneAt !== null) {
    errors.push('doneAt is set but the task is not marked done.')
  }

  if (
    task.deadline !== null &&
    task.due !== null &&
    !task.dueWithTime &&
    task.deadline < task.due
  ) {
    warnings.push('The deadline is earlier than the due date.')
  }

  if (task.isDone && task.wonthado) {
    warnings.push('Task is both done and won\u2019t do — reopen it to fix the state.')
  }

  return { ok: errors.length === 0, errors, warnings }
}

// Subtask model (S3-04) — re-exported so hosts consume one entry.
export * from './subtasks'

// Project model (S3-05) — re-exported so hosts consume one entry.
export * from './projects'

// Tag model + SP tag filters (S3-06) — re-exported so hosts consume one entry.
export * from './tags'

// Repeat engine (S3-07) — re-exported so hosts consume one entry.
export * from './repeat'

// Per-task reminder planner (S3-08) — re-exported so hosts consume one entry.
export * from './reminders'

// Short-syntax parser (S3-09) — re-exported so hosts consume one entry.
export * from './short-syntax'

// Estimate math (S3-62) — re-exported so hosts consume one entry.
export * from './estimates'

// Deadline semantics (S3-63) — re-exported so hosts consume one entry.
export * from './deadlines'

// Priority model (S3-64) — re-exported so hosts consume one entry.
export * from './priority'

// Today membership (S3-65) — re-exported so hosts consume one entry.
export * from './today'

// Won't-do exclusion (S3-66) — re-exported so hosts consume one entry.
export * from './wontdo'

// Time-tracking core (S3-10) — re-exported so hosts consume one entry.
export * from './time-tracking'

// Archive tiers (S3-11) — re-exported so hosts consume one entry.
export * from './archive'

// Recently-deleted trash (S3-12) — re-exported so hosts consume one entry.
export * from './trash'

// Undo stack (S3-13) — re-exported so hosts consume one entry.
export * from './undo'
