/**
 * Boards (S3-24) — board views + the drag-applies-rule engine over the SP
 * task model (`./tasks`).
 *
 * Mental model: a board VIEW is an ordered list of COLUMNS, and every column
 * owns a RULE CHIP — a filter (which tasks belong in the column) plus an
 * apply-patch (what dropping a task there SETS). Dragging is therefore not
 * cosmetic: the drop applies the chip's patch through {@link applyChip}, so
 * "move to column" and "edit fields" can never drift apart. This is SP's
 * custom-boards idea, grounded in pure functions so every host (web page,
 * tests, a future worker) shares one engine.
 *
 * Built-ins:
 * - **Kanban** — columns by priority (`Backlog/Low/Medium/High` + `Done`);
 *   dragging re-prioritizes or completes.
 * - **Eisenhower** — the urgent×important quadrants. Urgency is DATA, not
 *   opinion: a task is urgent when it is overdue, or due/deadline within
 *   `URGENT_WINDOW_DAYS` (default 7); importance is `high|medium` priority.
 *   Dropping into a quadrant aligns the two axes (see the built-in chips).
 *
 * Custom rule views are S3-44's extension space; the persistence row lives
 * in `task_views` (S3-17 handlers), while the in-memory view shapes here are
 * the single source of truth the page renders.
 *
 * Pure module: no I/O, no clock reads — `today` (YYYY-MM-DD) is a parameter.
 */
import { z } from 'zod'
import {
  dayKeySchema,
  taskItemSchema,
  taskPrioritySchema,
  type TaskItem,
  type TaskPriority,
} from './tasks'

// ── Rule chips ──────────────────────────────────────────────────────────────

/**
 * The filter half of a rule chip — every present key must hold for a task
 * to match. Absent keys don't constrain (a chip with only `isDone: true`
 * matches every completed task). `urgent`/`important` are the DATA-DRIVEN
 * Eisenhower axes (see {@link isUrgent}/{@link isImportant}) — they make
 * each quadrant's chip distinguishable, so `buildBoard`'s first-match rule
 * lands every open task in exactly one quadrant.
 */
export const boardChipFilterSchema = z.object({
  isDone: z.boolean().optional(),
  /** Won't-do tasks are excluded from every chip unless explicitly matched. */
  wonthado: z.boolean().optional(),
  /** Task priority is one of these (absent = any). */
  priority: z.array(taskPrioritySchema).optional(),
  /** Task belongs to this project id (absent = any project). */
  projectId: z.number().int().positive().optional(),
  /** Task carries this tag id. */
  tagId: z.number().int().positive().optional(),
  /** Task has any due value. */
  hasDue: z.boolean().optional(),
  /** Due (or deadline) is overdue relative to `today`. */
  overdue: z.boolean().optional(),
  /** Due (or deadline) falls within N days of `today` (inclusive). */
  dueWithinDays: z.number().int().min(0).max(3650).optional(),
  /** Urgent axis (overdue, or due/deadline within the window). */
  urgent: z.boolean().optional(),
  /** Important axis (priority high|medium). */
  important: z.boolean().optional(),
})
export type BoardChipFilter = z.infer<typeof boardChipFilterSchema>

/**
 * The apply half of a rule chip — the patch a drop sets. At most one due
 * policy per chip: `clearDue`, or `dueInDays` (relative to `today`), or a
 * literal `due` (a full SP due value). The zod `.refine` keeps impossible
 * combinations out of the model rather than out of the UI.
 */
export const boardChipApplySchema = z
  .object({
    isDone: z.boolean().optional(),
    priority: taskPrioritySchema.optional(),
    projectId: z.number().int().positive().nullable().optional(),
    addTagId: z.number().int().positive().optional(),
    removeTagId: z.number().int().positive().optional(),
    clearDue: z.literal(true).optional(),
    /** Due = `today + dueInDays` days (a `YYYY-MM-DD` day-key). */
    dueInDays: z.number().int().min(0).max(3650).optional(),
    /** Literal due value (day-key, or ISO timestamp with `dueWithTime`). */
    due: z.string().min(1).max(40).optional(),
    /** Literal deadline day-key (S3-63 semantics). */
    deadline: dayKeySchema.nullable().optional(),
  })
  .refine(
    (patch) =>
      !(patch.clearDue === true && (patch.dueInDays !== undefined || patch.due !== undefined)),
    { message: 'clearDue excludes dueInDays/due' },
  )
export type BoardChipApply = z.infer<typeof boardChipApplySchema>

/** A rule chip: the reason a column exists (filter) + what a drop does (apply). */
export const boardRuleChipSchema = z.object({
  /** Stable chip id (built-ins use `builtin:*`, custom ones any slug). */
  id: z.string().min(1).max(80),
  /** Human label shown on the column header AND the chip. */
  label: z.string().min(1).max(120),
  filter: boardChipFilterSchema.default({}),
  apply: boardChipApplySchema.default({}),
})
export type BoardRuleChip = z.infer<typeof boardRuleChipSchema>

/** One board column: a chip plus its display identity. */
export const boardColumnSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  chip: boardRuleChipSchema,
})
export type BoardColumn = z.infer<typeof boardColumnSchema>

/** A board view: kind + ordered columns. Built-ins are factory functions. */
export const boardViewSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(200),
  kind: z.enum(['kanban', 'eisenhower', 'custom']),
  columns: z.array(boardColumnSchema).min(1).max(20),
})
export type BoardView = z.infer<typeof boardViewSchema>

/** Urgency window for the Eisenhower built-in (days from `today`). */
export const URGENT_WINDOW_DAYS = 7

/**
 * `today + days` as a `YYYY-MM-DD` day-key (UTC arithmetic on the key —
 * no clock reads; `today` is already a normalized day-key).
 */
export function addDays(today: string, days: number): string {
  const parsed = dayKeySchema.parse(today)
  const [y, m, d] = parsed.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + days))
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(next.getUTCDate()).padStart(2, '0')
  return `${next.getUTCFullYear()}-${mm}-${dd}`
}

/** Day-key of a task's `due` (the calendar half of possibly-timestamped dues). */
function dueDayKey(task: TaskItem): string | null {
  if (!task.due) return null
  return task.due.slice(0, 10)
}

/** True when the due (or deadline) is strictly before `today` (overdue). */
function isOverdue(task: TaskItem, today: string): boolean {
  const due = dueDayKey(task)
  const deadline = task.deadline
  const first = [due, deadline].filter((v): v is string => v !== null).sort()[0]
  return first !== undefined && first < today
}

/**
 * True when the task is URGENT (Eisenhower axis): overdue, or due/deadline
 * within `URGENT_WINDOW_DAYS` of `today` (inclusive). Data-driven — never
 * a manual flag.
 */
export function isUrgent(task: TaskItem, today: string): boolean {
  const due = dueDayKey(task)
  const deadline = task.deadline
  const limit = addDays(today, URGENT_WINDOW_DAYS)
  for (const value of [due, deadline]) {
    if (value !== null && value >= today && value <= limit) return true
  }
  return isOverdue(task, today)
}

/** True when the task is IMPORTANT (Eisenhower axis): high|medium priority. */
export function isImportant(task: TaskItem): boolean {
  return task.priority === 'high' || task.priority === 'medium'
}

/** The Eisenhower quadrant of a task (open tasks only — done tasks: null). */
export type EisenhowerQuadrant = 'q1' | 'q2' | 'q3' | 'q4'

/**
 * Quadrant of an open task: Q1 urgent+important (do now), Q2 important
 * (schedule), Q3 urgent (delegate/quick), Q4 neither (drop-or-someday).
 * Done and won't-do tasks have no quadrant.
 */
export function eisenhowerQuadrant(task: TaskItem, today: string): EisenhowerQuadrant | null {
  if (task.isDone || task.wonthado) return null
  const urgent = isUrgent(task, today)
  const important = isImportant(task)
  if (urgent && important) return 'q1'
  if (!urgent && important) return 'q2'
  if (urgent && !important) return 'q3'
  return 'q4'
}

// ── Built-in views ──────────────────────────────────────────────────────────

/**
 * The built-in Kanban view: priority columns + Done. Dragging between the
 * priority columns re-prioritizes (clearing nothing else); dropping on
 * Done completes. `id: 0` keeps it hashable without a DB row.
 */
export function kanbanBoardView(): BoardView {
  const priorityChip = (priority: TaskPriority, label: string): BoardColumn => ({
    id: `kanban-${priority}`,
    label,
    chip: {
      id: `builtin:kanban:${priority}`,
      label,
      filter: { isDone: false, wonthado: false, priority: [priority] },
      apply: { priority, isDone: false },
    },
  })
  return {
    id: 'builtin-kanban',
    name: 'Kanban',
    kind: 'kanban',
    columns: [
      priorityChip('none', 'Backlog'),
      priorityChip('low', 'Low'),
      priorityChip('medium', 'Medium'),
      priorityChip('high', 'High'),
      {
        id: 'kanban-done',
        label: 'Done',
        chip: {
          id: 'builtin:kanban:done',
          label: 'Done',
          filter: { isDone: true },
          apply: { isDone: true },
        },
      },
    ],
  }
}

/**
 * The built-in Eisenhower view: the four quadrants. Drops align BOTH axes
 * (priority + due policy): Q1 do-now gets `high` + due in a week, Q2
 * schedule gets `high` + no due, Q3 urgent-but-small gets `low` + due, Q4
 * gets `low` + no due. An existing more-precise due (a timestamp, or any
 * due the user set) is left alone unless the quadrant's policy clears it —
 * the apply only touches priority + clears/sets due per the table above.
 */
export function eisenhowerBoardView(): BoardView {
  const quadrant = (
    id: EisenhowerQuadrant,
    label: string,
    important: boolean,
    urgent: boolean,
  ): BoardColumn => ({
    id: `eisenhower-${id}`,
    label,
    chip: {
      id: `builtin:eisenhower:${id}`,
      label,
      // Quadrants must be MUTUALLY EXCLUSIVE filters — buildBoard assigns by
      // first match, so an under-specified filter would swallow every open
      // task into Q1.
      filter: {
        isDone: false,
        wonthado: false,
        important,
        urgent,
      },
      apply: {
        priority: important ? 'high' : 'low',
        ...(urgent ? { dueInDays: URGENT_WINDOW_DAYS } : { clearDue: true }),
      },
    },
  })
  return {
    id: 'builtin-eisenhower',
    name: 'Eisenhower',
    kind: 'eisenhower',
    columns: [
      quadrant('q1', 'Do now (urgent + important)', true, true),
      quadrant('q2', 'Schedule (important)', true, false),
      quadrant('q3', 'Quick wins (urgent)', false, true),
      quadrant('q4', 'Someday / drop', false, false),
    ],
  }
}

// ── Matching + application ──────────────────────────────────────────────────

/** Pure filter evaluation of one chip against one task. */
export function matchesChip(task: TaskItem, chip: BoardRuleChip, today: string): boolean {
  const f = chip.filter
  if (f.isDone !== undefined && task.isDone !== f.isDone) return false
  if (f.wonthado !== undefined && task.wonthado !== f.wonthado) return false
  if (f.priority !== undefined && !f.priority.includes(task.priority)) return false
  if (f.projectId !== undefined && task.projectId !== f.projectId) return false
  if (f.tagId !== undefined && !task.tagIds.includes(f.tagId)) return false
  if (f.hasDue !== undefined && (task.due !== null) !== f.hasDue) return false
  if (f.overdue !== undefined && isOverdue(task, today) !== f.overdue) return false
  if (f.dueWithinDays !== undefined && !isUrgent(task, today)) return false
  if (f.urgent !== undefined && isUrgent(task, today) !== f.urgent) return false
  if (f.important !== undefined && isImportant(task) !== f.important) return false
  return true
}

/** One board column's matched tasks + the chip that produced it. */
export interface BuiltBoardColumn {
  column: BoardColumn
  tasks: TaskItem[]
}

/**
 * Build a board: first matching column wins (a task appears exactly once,
 * in column order). Done/won't-do tasks only land where a chip explicitly
 * matches their state; open tasks never match a done-only column. Tasks no
 * column claims are returned separately (`unmatched`) so the page can be
 * honest about them instead of silently hiding work.
 */
export function buildBoard(
  view: BoardView,
  tasks: TaskItem[],
  today: string,
): { columns: BuiltBoardColumn[]; unmatched: TaskItem[] } {
  const columns: BuiltBoardColumn[] = view.columns.map((column) => ({
    column,
    tasks: [],
  }))
  const unmatched: TaskItem[] = []
  for (const task of tasks) {
    const target = columns.find(({ column }) => matchesChip(task, column.chip, today))
    if (target) target.tasks.push(task)
    else unmatched.push(task)
  }
  return { columns, unmatched }
}

/**
 * Apply a chip's patch to a task (the drag-drop contract). Immutable:
 * returns a NEW TaskItem with `updatedAt` re-stamped and the model
 * re-validated through `taskItemSchema` — an illegal patch throws zod's
 * error at the boundary instead of producing a half-valid row. Done and
 * won't-do tasks are not re-opened by accident: an `isDone: false` apply on
 * a won't-do task keeps `wonthado` intact (won't-do is a user decision,
 * S3-66).
 */
export function applyChip(task: TaskItem, chip: BoardRuleChip, today: string): TaskItem {
  // zod at the boundary: the chip (filter + apply) is parsed before any
  // field is read, so an illegal patch (e.g. clearDue + a due) throws a
  // schema error instead of silently applying a policy mix.
  const apply = boardRuleChipSchema.parse(chip).apply
  const next: TaskItem = {
    ...task,
    priority: apply.priority ?? task.priority,
    isDone: apply.isDone ?? task.isDone,
    projectId: apply.projectId !== undefined ? apply.projectId : task.projectId,
    due:
      apply.clearDue === true
        ? null
        : apply.due !== undefined
          ? apply.due
          : apply.dueInDays !== undefined
            ? addDays(today, apply.dueInDays)
            : task.due,
    deadline: apply.deadline !== undefined ? apply.deadline : task.deadline,
    tagIds: (() => {
      let ids = task.tagIds
      if (apply.addTagId !== undefined && !ids.includes(apply.addTagId)) {
        ids = [...ids, apply.addTagId]
      }
      if (apply.removeTagId !== undefined) {
        ids = ids.filter((id) => id !== apply.removeTagId)
      }
      return ids
    })(),
    // Timestamps: this is a FIELD patch, not a persistence write — keep the
    // task's existing stamps; the PATCH handler (S3-16) re-stamps
    // updatedAt/doneAt server-side when the drag's patch lands.
    updatedAt: task.updatedAt,
    doneAt:
      apply.isDone === true
        ? (task.doneAt ?? task.updatedAt)
        : apply.isDone === false
          ? null
          : task.doneAt,
  }
  return taskItemSchema.parse(next)
}
