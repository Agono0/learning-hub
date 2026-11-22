/**
 * Tasks — shared leaf definitions (model, primitives, domain error).
 *
 * LEAF MODULE: siblings under `tasks/` import from here, never from the
 * `./index` barrel — the barrel re-exports every sibling, so a sibling
 * importing the barrel would create an import cycle (architecture.test.ts
 * guards this). Keep this file free of sibling imports.
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
export const timestampSchema = z.string().min(1)

export const positiveId = z.number().int().positive()
export const nonNegativeMs = z.number().int().nonnegative()

/**
 * The task model — mirrors the `task_items` table (S3-01).
 *
 * `id === 0` means "not persisted yet" (drafts returned by createTask before
 * the repo assigns the real id); every other id is the DB row id.
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

/** Domain-rule violation: illegal *transitions* throw so handlers map codes. */
export class TaskDomainError extends Error {
  /** Stable machine code, e.g. `wontdo-cannot-complete`. */
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'TaskDomainError'
    this.code = code
  }
}
