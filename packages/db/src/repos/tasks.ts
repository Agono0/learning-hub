/**
 * Tasks repository — the Super Productivity-parity persistence layer (S3-15).
 *
 * One module over the whole `task_*` schema batch (031/032) so web handlers
 * (S3-16..S3-19), MCP tools and the CLI share every query. Bridging rules:
 *
 * - Core model ↔ row: `task_items` rows map onto the core {@link TaskItem}
 *   with `tagIds` denormalized from `task_item_tags` (the table stores the
 *   link rows, the model carries ids — reads aggregate, writes split).
 * - Relative reminders: the `task_reminders.remind_at` column is NOT NULL
 *   and there is no offset column, so `type='relative'` rows store the
 *   offset in milliseconds as a string (`String(offsetMs)`, e.g. `-1800000`).
 *   {@link reminderFromRow} decodes it back into the core
 *   `remindAt: null / offsetMs: number` shape. A future migration may add a
 *   real `offset_ms` column (see docs/SHARED_CHANGES.md) — the decode is the
 *   only place that would change.
 * - Repeat configs: `task_repeat_cfgs` has no `title` column — the title a
 *   UI passes is dropped on write (SP shows generated titles anyway).
 * - Referential integrity: SQLite FKs are off by default (031 note), so the
 *   repos own it — parent/project/tag/repeat-cfg existence is checked before
 *   writes and deletes cascade to dependent rows.
 * - Time truth: `timeSpentOnDay` on the item is always RE-DERIVED from the
 *   `task_time_logs` rows via core {@link mergeTimeLogs} (S3-10's merge
 *   rule) — never patched by hand, so corrections and out-of-order ticks
 *   converge deterministically.
 *
 * Every multi-row write is one synchronous transaction ({@link withTransaction});
 * functions taking `database?` reuse a caller-supplied connection (nested
 * calls stay inside the caller's transaction) or wrap their own.
 */
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql, type SQL } from 'drizzle-orm'
import {
  DEFAULT_ARCHIVE_CONFIG,
  bulkApply,
  canHaveSubtasks,
  completeTask,
  createRepeatCfgInputSchema,
  createTask,
  createTaskReminderInputSchema,
  duplicateTask,
  moveTo,
  normalizeSession,
  normalizeTagName,
  planArchivePass,
  reopenTask,
  recomputeTaskTime,
  updateTagInputSchema,
  updateTask,
  type ArchiveConfig,
  type ArchiveEntry,
  type ArchiveTier,
  type BulkOp,
  type BulkResult,
  type CreateProjectInput,
  type CreateRepeatCfgInput,
  type CreateTagInput,
  type CreateTaskInput,
  type CreateTaskReminderInput,
  type TaskItem,
  type TaskReminder,
  type TimeLog,
  type TimeLogSource,
  type TrashEntry,
  type UpdateTaskInput,
} from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import {
  metricDays,
  simpleCounterLogs,
  simpleCounters,
  taskArchiveTiers,
  taskAttachments,
  taskItemTags,
  taskItems,
  taskProjects,
  taskReminders,
  taskRepeatCfgs,
  taskSections,
  taskTags,
  taskTimeLogs,
  taskViews,
} from '../schema'
import { withTransaction } from '../transaction'
import type { DbOrTx } from './focus-lock'

// ── Row types ───────────────────────────────────────────────────────────────

/** Row shape of `task_items`. */
export type TaskItemRow = typeof taskItems.$inferSelect
/** Row shape of `task_projects`. */
export type TaskProjectRow = typeof taskProjects.$inferSelect
/** Row shape of `task_tags`. */
export type TaskTagRow = typeof taskTags.$inferSelect
/** Row shape of `task_repeat_cfgs`. */
export type RepeatCfgRow = typeof taskRepeatCfgs.$inferSelect
/** Row shape of `task_reminders`. */
export type TaskReminderRow = typeof taskReminders.$inferSelect
/** Row shape of `task_time_logs`. */
export type TimeLogRow = typeof taskTimeLogs.$inferSelect
/** Row shape of `task_sections`. */
export type TaskSectionRow = typeof taskSections.$inferSelect
/** Row shape of `task_attachments`. */
export type TaskAttachmentRow = typeof taskAttachments.$inferSelect
/** Row shape of `task_archive_tiers`. */
export type ArchiveTierRow = typeof taskArchiveTiers.$inferSelect
/** Row shape of `simple_counters`. */
export type SimpleCounterRow = typeof simpleCounters.$inferSelect
/** Row shape of `simple_counter_logs`. */
export type SimpleCounterLogRow = typeof simpleCounterLogs.$inferSelect
/** Row shape of `metric_days`. */
export type MetricDayRow = typeof metricDays.$inferSelect
/** Row shape of `task_views`. */
export type TaskViewRow = typeof taskViews.$inferSelect

/** Attachment kinds (SP: files, URLs, shell commands). */
export const attachmentTypeSchema = ['file', 'url', 'command'] as const
/** One attachment kind. */
export type AttachmentType = (typeof attachmentTypeSchema)[number]

/** Saved-view kinds (built-ins live in core/boards; these are user views). */
export const taskViewKindSchema = ['kanban', 'eisenhower', 'custom'] as const
/** One saved-view kind. */
export type TaskViewKind = (typeof taskViewKindSchema)[number]

/** The `task_repeat_cfgs` write shape — the core input minus the unpersisted title. */
export type RepeatCfgWrite = Omit<CreateRepeatCfgInput, 'title'>

/**
 * Everything needed to resurrect a deleted task: the item, its subtasks,
 * tag ids, reminders and attachments — what the handler stashes in trash
 * storage (S3-12 shape is storage-agnostic until a table is granted).
 */
export interface TaskSnapshot {
  task: TaskItem
  subtasks: TaskItem[]
  attachments: TaskAttachmentRow[]
}

// ── Mapping helpers ─────────────────────────────────────────────────────────

/** Join the link table into a `tagIds` list (ordered by tag id). */
function tagIdsFor(conn: DbOrTx, itemId: number): number[] {
  return conn
    .select({ tagId: taskItemTags.tagId })
    .from(taskItemTags)
    .where(eq(taskItemTags.itemId, itemId))
    .orderBy(asc(taskItemTags.tagId))
    .all()
    .map((r) => r.tagId)
}

/** Row → core {@link TaskItem} (tags joined from the link table). */
function taskFromRow(conn: DbOrTx, row: TaskItemRow): TaskItem {
  return {
    id: row.id,
    parentId: row.parentId,
    projectId: row.projectId,
    tagIds: tagIdsFor(conn, row.id),
    title: row.title,
    notes: row.notes,
    priority: row.priority as TaskItem['priority'],
    estimateMs: row.estimateMs,
    timeSpentOnDay: row.timeSpentOnDay ?? {},
    due: row.due,
    dueWithTime: row.dueWithTime,
    deadline: row.deadline,
    isDone: row.isDone,
    doneAt: row.doneAt,
    wonthado: row.wonthado,
    repeatCfgId: row.repeatCfgId,
    order: row.order,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * `task_reminders` row → core {@link TaskReminder}. `at_time` rows keep
 * their ISO `remind_at`; `relative` rows decode the offset milliseconds
 * stored (as a string) in the same column — see the module header.
 */
function reminderFromRow(row: TaskReminderRow): TaskReminder {
  const isRelative = row.type === 'relative'
  const offsetMs = isRelative ? Number(row.remindAt) : NaN
  return {
    id: row.id,
    taskId: row.taskId,
    type: row.type as TaskReminder['type'],
    remindAt: isRelative ? null : row.remindAt,
    offsetMs: isRelative && Number.isFinite(offsetMs) ? offsetMs : null,
    exactAlarm: row.exactAlarm,
    createdAt: row.createdAt,
  }
}

/** Core reminder draft → insert values (offset encoded for `relative`). */
function reminderToInsert(reminder: TaskReminder): typeof taskReminders.$inferInsert {
  return {
    taskId: reminder.taskId,
    remindAt: reminder.type === 'at_time' ? (reminder.remindAt ?? '') : String(reminder.offsetMs),
    type: reminder.type,
    exactAlarm: reminder.exactAlarm,
    createdAt: reminder.createdAt,
  }
}

// ── Connection plumbing ─────────────────────────────────────────────────────

/**
 * Run `fn` on the caller's connection when one was supplied (already inside
 * a transaction), else on the global db WITHOUT a wrapping transaction —
 * for single-statement writes. Multi-write ops use {@link txRun}.
 */
function run<T>(fn: (conn: DbOrTx) => T, database?: DbOrTx): T {
  return fn(database ?? getDb())
}

/**
 * Run `fn` atomically: inside the caller's transaction when `database` is a
 * supplied connection, else in a fresh {@link withTransaction} block.
 */
function txRun<T>(fn: (conn: DbOrTx) => T, database?: DbOrTx): T {
  if (database) return fn(database)
  // Every repo callback here is synchronous by contract (rule 6), so the
  // `never` cast just satisfies withTransaction's NonPromise guard — the
  // runtime callback is `fn` itself.
  return withTransaction(fn as never) as T
}

// ── Referential integrity ───────────────────────────────────────────────────

/** Throw when a referenced row is missing (SQLite FKs are off; repos own it). */
function requireRow(
  kind: 'project' | 'tag' | 'repeat config' | 'task' | 'section' | 'counter',
  id: number,
  found: unknown,
): void {
  if (!found) throw new Error(`${kind} #${id} not found`)
}

// ── Task item reads ─────────────────────────────────────────────────────────

/** Filters for {@link listTaskItems}. */
export interface ListTaskItemsOpts {
  /**
   * Project scope: a project id, `null` = inbox only, `'any'` = every task
   * regardless of project (default).
   */
  projectId?: number | null | 'any'
  /** Parent scope: a parent id, `null` = top-level only, `'any'` = all (default `null`). */
  parentId?: number | null | 'any'
  /** Include done tasks (default false — lists show open work). */
  includeDone?: boolean
  /** Include won't-do tasks (default false — S3-66 excludes them). */
  includeWontdo?: boolean
  /** Cap the result (newest-last list order preserved). */
  limit?: number
  database?: DbOrTx
}

/**
 * List tasks in display order (`order`, then id), mapped to the core model.
 * Scope defaults are "everything": open, non-won't-do tasks at any level in
 * any project — views narrow from there (SP list semantics are applied by
 * callers, e.g. `{ parentId: null }` for the top-level Today/Inbox list).
 */
export function listTaskItems(opts: ListTaskItemsOpts = {}): TaskItem[] {
  const conn = opts.database ?? getDb()
  const where: SQL[] = []
  const projectScope = opts.projectId ?? 'any'
  const parentScope = opts.parentId ?? 'any'
  if (projectScope !== 'any') {
    where.push(
      projectScope === null ? isNull(taskItems.projectId) : eq(taskItems.projectId, projectScope),
    )
  }
  if (parentScope !== 'any') {
    where.push(
      parentScope === null ? isNull(taskItems.parentId) : eq(taskItems.parentId, parentScope),
    )
  }
  if (!opts.includeDone) where.push(eq(taskItems.isDone, false))
  if (!opts.includeWontdo) where.push(eq(taskItems.wonthado, false))

  const query = conn
    .select()
    .from(taskItems)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(taskItems.order), asc(taskItems.id))
  const rows = (opts.limit !== undefined ? query.limit(opts.limit) : query).all()
  return rows.map((row) => taskFromRow(conn, row))
}

/**
 * One task by id (null when missing) — tags joined, subtasks NOT included
 * ({@link listTaskItems} with `parentId` fetches them).
 */
export function getTaskItem(id: number, database?: DbOrTx): TaskItem | null {
  const conn = database ?? getDb()
  const row = conn.select().from(taskItems).where(eq(taskItems.id, id)).get()
  return row ? taskFromRow(conn, row) : null
}

// ── Task item writes ────────────────────────────────────────────────────────

/**
 * Persist a validated core draft: inserts the row, the tag links, and
 * places it in its list. When `input.order` is omitted the task appends to
 * the end of its (parentId+projectId) scope; when given, callers own the
 * ordinal (S3-60 dense renumbering happens via {@link setTaskOrder}).
 *
 * Integrity: parent must exist, be top-level and completable
 * ({@link canHaveSubtasks}); project/tags/repeat config must exist. Throws
 * on violations (handlers map to 4xx).
 */
export function createTaskItem(input: CreateTaskInput, database?: DbOrTx): TaskItem {
  return txRun((conn) => {
    const now = new Date().toISOString()
    const draft = createTask(input, now)

    if (draft.parentId !== null) {
      const parent = conn.select().from(taskItems).where(eq(taskItems.id, draft.parentId)).get()
      requireRow('task', draft.parentId, parent)
      if (!canHaveSubtasks(taskFromRow(conn, parent!))) {
        throw new Error(
          `Task #${draft.parentId} cannot receive subtasks ( nesting is limited to one level )`,
        )
      }
    }
    if (draft.projectId !== null) {
      const project = conn
        .select()
        .from(taskProjects)
        .where(eq(taskProjects.id, draft.projectId))
        .get()
      requireRow('project', draft.projectId, project)
    }
    if (draft.repeatCfgId !== null) {
      const cfg = conn
        .select()
        .from(taskRepeatCfgs)
        .where(eq(taskRepeatCfgs.id, draft.repeatCfgId))
        .get()
      requireRow('repeat config', draft.repeatCfgId, cfg)
    }
    ensureTagsExist(conn, draft.tagIds)

    // Default placement: end of the (parent, project) list scope.
    if (input.order === undefined) {
      const [head] = conn
        .select({ maxOrder: sql<number>`coalesce(max(${taskItems.order}), -1)` })
        .from(taskItems)
        .where(
          and(
            draft.parentId === null
              ? isNull(taskItems.parentId)
              : eq(taskItems.parentId, draft.parentId),
            draft.projectId === null
              ? isNull(taskItems.projectId)
              : eq(taskItems.projectId, draft.projectId),
          ),
        )
        .all()
      draft.order = Number(head?.maxOrder ?? -1) + 1
    }

    const [row] = conn
      .insert(taskItems)
      .values({
        parentId: draft.parentId,
        projectId: draft.projectId,
        title: draft.title,
        notes: draft.notes,
        priority: draft.priority,
        estimateMs: draft.estimateMs,
        timeSpentOnDay: draft.timeSpentOnDay,
        due: draft.due,
        dueWithTime: draft.dueWithTime,
        deadline: draft.deadline,
        isDone: draft.isDone,
        doneAt: draft.doneAt,
        wonthado: draft.wonthado,
        repeatCfgId: draft.repeatCfgId,
        order: draft.order,
        createdAt: draft.createdAt,
        updatedAt: draft.updatedAt,
      })
      .returning()
      .all()

    if (draft.tagIds.length > 0) {
      conn
        .insert(taskItemTags)
        .values(draft.tagIds.map((tagId) => ({ itemId: row!.id, tagId })))
        .run()
    }
    return { ...draft, id: row!.id }
  }, database)
}

/** Verify every tag id exists (integrity the disabled FKs would have given). */
function ensureTagsExist(conn: DbOrTx, tagIds: number[]): void {
  if (tagIds.length === 0) return
  const known = conn
    .select({ id: taskTags.id })
    .from(taskTags)
    .where(inArray(taskTags.id, tagIds))
    .all()
  const knownIds = new Set(known.map((r) => r.id))
  const missing = tagIds.filter((id) => !knownIds.has(id))
  if (missing.length > 0) {
    throw new Error(`Unknown tag ids: ${missing.join(', ')}`)
  }
}

/**
 * Apply a validated patch. Tag ids in the patch REPLACE the link rows;
 * project/parent/repeat moves are integrity-checked (a task with subtasks
 * cannot become a subtask — one nesting level).
 */
export function updateTaskItem(
  id: number,
  patch: UpdateTaskInput,
  database?: DbOrTx,
): TaskItem | null {
  return txRun((conn) => {
    const current = getTaskItem(id, conn)
    if (!current) return null

    const now = new Date().toISOString()
    const next = updateTask(current, patch, now)

    if (next.parentId !== null) {
      if (next.parentId === id) throw new Error('A task cannot be its own parent.')
      const hasSubtasks = conn
        .select({ id: taskItems.id })
        .from(taskItems)
        .where(eq(taskItems.parentId, id))
        .limit(1)
        .get()
      if (hasSubtasks) {
        throw new Error('A task with subtasks cannot become a subtask (one nesting level).')
      }
      const parent = conn.select().from(taskItems).where(eq(taskItems.id, next.parentId)).get()
      requireRow('task', next.parentId, parent)
      if (!canHaveSubtasks(taskFromRow(conn, parent!))) {
        throw new Error(`Task #${next.parentId} cannot receive subtasks (one nesting level).`)
      }
    }
    if (next.projectId !== null && next.projectId !== current.projectId) {
      const project = conn
        .select()
        .from(taskProjects)
        .where(eq(taskProjects.id, next.projectId))
        .get()
      requireRow('project', next.projectId, project)
    }
    if (next.repeatCfgId !== null && next.repeatCfgId !== current.repeatCfgId) {
      const cfg = conn
        .select()
        .from(taskRepeatCfgs)
        .where(eq(taskRepeatCfgs.id, next.repeatCfgId))
        .get()
      requireRow('repeat config', next.repeatCfgId, cfg)
    }
    if (patch.tagIds !== undefined) ensureTagsExist(conn, patch.tagIds)

    conn
      .update(taskItems)
      .set({
        parentId: next.parentId,
        projectId: next.projectId,
        title: next.title,
        notes: next.notes,
        priority: next.priority,
        estimateMs: next.estimateMs,
        timeSpentOnDay: next.timeSpentOnDay,
        due: next.due,
        dueWithTime: next.dueWithTime,
        deadline: next.deadline,
        isDone: next.isDone,
        doneAt: next.doneAt,
        wonthado: next.wonthado,
        repeatCfgId: next.repeatCfgId,
        order: next.order,
        updatedAt: next.updatedAt,
      })
      .where(eq(taskItems.id, id))
      .run()

    if (patch.tagIds !== undefined) {
      conn.delete(taskItemTags).where(eq(taskItemTags.itemId, id)).run()
      if (patch.tagIds.length > 0) {
        conn
          .insert(taskItemTags)
          .values(patch.tagIds.map((tagId) => ({ itemId: id, tagId })))
          .run()
      }
    }
    return getTaskItem(id, conn)
  }, database)
}

/**
 * Complete a task (SP: parent completion sweeps its open subtasks — the
 * checklist cannot be left half-done). Idempotent on already-done tasks.
 */
export function completeTaskItem(id: number, database?: DbOrTx): TaskItem | null {
  return txRun((conn) => {
    const current = getTaskItem(id, conn)
    if (!current) return null
    const now = new Date().toISOString()
    const done = completeTask(current, now)
    if (done !== current) persistTaskCore(conn, done)
    for (const sub of listTaskItems({ parentId: id, includeDone: false, database: conn })) {
      const subDone = completeTask(sub, now)
      if (subDone !== sub) persistTaskCore(conn, subDone)
    }
    return getTaskItem(id, conn)
  }, database)
}

/**
 * Reopen a task (or un-mark won't-do). Reopening an archived task also
 * restores it to the active lists ({@link restoreTaskItem} semantics).
 */
export function reopenTaskItem(id: number, database?: DbOrTx): TaskItem | null {
  return txRun((conn) => {
    const current = getTaskItem(id, conn)
    if (!current) return null
    const now = new Date().toISOString()
    const reopened = reopenTask(current, now)
    if (reopened !== current) persistTaskCore(conn, reopened)
    conn.delete(taskArchiveTiers).where(eq(taskArchiveTiers.taskId, id)).run()
    return getTaskItem(id, conn)
  }, database)
}

/**
 * Persist a core-op result back to its row (complete/reopen/won't-do flip
 * paths); `id` is already assigned so this is an UPDATE, not an upsert.
 */
function persistTaskCore(conn: DbOrTx, task: TaskItem): void {
  conn
    .update(taskItems)
    .set({
      parentId: task.parentId,
      projectId: task.projectId,
      title: task.title,
      notes: task.notes,
      priority: task.priority,
      estimateMs: task.estimateMs,
      timeSpentOnDay: task.timeSpentOnDay,
      due: task.due,
      dueWithTime: task.dueWithTime,
      deadline: task.deadline,
      isDone: task.isDone,
      doneAt: task.doneAt,
      wonthado: task.wonthado,
      repeatCfgId: task.repeatCfgId,
      order: task.order,
      updatedAt: task.updatedAt,
    })
    .where(eq(taskItems.id, task.id))
    .run()
}

/**
 * Duplicate a task (SP parity): `(copy)` suffix, fresh ids, NOT done, empty
 * time map — subtasks and tag links are copied, time logs are NOT.
 */
export function duplicateTaskItem(id: number, database?: DbOrTx): TaskItem | null {
  return txRun((conn) => {
    const source = getTaskItem(id, conn)
    if (!source) return null
    const now = new Date().toISOString()
    const copy = duplicateTask(source, now)

    const [row] = conn
      .insert(taskItems)
      .values({
        parentId: copy.parentId,
        projectId: copy.projectId,
        title: copy.title,
        notes: copy.notes,
        priority: copy.priority,
        estimateMs: copy.estimateMs,
        timeSpentOnDay: copy.timeSpentOnDay,
        due: copy.due,
        dueWithTime: copy.dueWithTime,
        deadline: copy.deadline,
        isDone: copy.isDone,
        doneAt: copy.doneAt,
        wonthado: copy.wonthado,
        repeatCfgId: copy.repeatCfgId,
        order: copy.order,
        createdAt: copy.createdAt,
        updatedAt: copy.updatedAt,
      })
      .returning()
      .all()
    const newId = row!.id

    if (source.tagIds.length > 0) {
      conn
        .insert(taskItemTags)
        .values(source.tagIds.map((tagId) => ({ itemId: newId, tagId })))
        .run()
    }

    // One nesting level → at most one round of subtask copies.
    for (const sub of listTaskItems({ parentId: id, database: conn })) {
      const subCopy = duplicateTask(sub, now, { parentId: newId })
      const [subRow] = conn
        .insert(taskItems)
        .values({
          parentId: subCopy.parentId,
          projectId: subCopy.projectId,
          title: subCopy.title,
          notes: subCopy.notes,
          priority: subCopy.priority,
          estimateMs: subCopy.estimateMs,
          timeSpentOnDay: subCopy.timeSpentOnDay,
          due: subCopy.due,
          dueWithTime: subCopy.dueWithTime,
          deadline: subCopy.deadline,
          isDone: subCopy.isDone,
          doneAt: subCopy.doneAt,
          wonthado: subCopy.wonthado,
          repeatCfgId: subCopy.repeatCfgId,
          order: subCopy.order,
          createdAt: subCopy.createdAt,
          updatedAt: subCopy.updatedAt,
        })
        .returning()
        .all()
      if (sub.tagIds.length > 0) {
        conn
          .insert(taskItemTags)
          .values(sub.tagIds.map((tagId) => ({ itemId: subRow!.id, tagId })))
          .run()
      }
    }
    return getTaskItem(newId, conn)
  }, database)
}

/**
 * Everything a delete/trash/undo needs: the item + subtasks + attachments.
 * Reminders are part of the row-level cascade, not the undoable snapshot
 * (SP restores tasks without re-arming old alarms).
 */
export function snapshotTaskItem(id: number, database?: DbOrTx): TaskSnapshot | null {
  const conn = database ?? getDb()
  const task = getTaskItem(id, conn)
  if (!task) return null
  return {
    task,
    subtasks: listTaskItems({ parentId: id, database: conn }),
    attachments: conn.select().from(taskAttachments).where(eq(taskAttachments.taskId, id)).all(),
  }
}

/**
 * Hard-delete a task and everything hanging off it: subtasks (one level),
 * tag links, reminders, attachments, time logs and the archive tier row.
 * Returns the snapshot the caller stashed in trash BEFORE calling this.
 */
export function deleteTaskItem(id: number, database?: DbOrTx): boolean {
  return txRun((conn) => {
    const existing = conn.select().from(taskItems).where(eq(taskItems.id, id)).get()
    if (!existing) return false
    const subIds = conn
      .select({ id: taskItems.id })
      .from(taskItems)
      .where(eq(taskItems.parentId, id))
      .all()
      .map((r) => r.id)
    const doomed = [id, ...subIds]
    for (const taskId of doomed) {
      conn.delete(taskItemTags).where(eq(taskItemTags.itemId, taskId)).run()
      conn.delete(taskReminders).where(eq(taskReminders.taskId, taskId)).run()
      conn.delete(taskAttachments).where(eq(taskAttachments.taskId, taskId)).run()
      conn.delete(taskTimeLogs).where(eq(taskTimeLogs.taskId, taskId)).run()
      conn.delete(taskArchiveTiers).where(eq(taskArchiveTiers.taskId, taskId)).run()
    }
    conn.delete(taskItems).where(inArray(taskItems.id, doomed)).run()
    return true
  }, database)
}

// ── Bulk + ordering ─────────────────────────────────────────────────────────

/**
 * The one batch path (core {@link bulkApply} + transactional persistence).
 * Per-task failures land in `skipped` with their reason; applied rows are
 * returned in selection order.
 */
export function bulkApplyTaskItems(ids: number[], op: BulkOp, database?: DbOrTx): BulkResult {
  return txRun((conn) => {
    if (op.op === 'addTags') ensureTagsExist(conn, op.tagIds)
    const byId = new Map(ids.map((id) => [id, getTaskItem(id, conn)] as const))
    const selection = ids.map((id) => byId.get(id) ?? undefined)
    const result = bulkApply(selection, op, new Date().toISOString())
    for (const task of result.applied) {
      persistTaskCore(conn, task)
      if (op.op === 'addTags' || op.op === 'removeTags') {
        conn.delete(taskItemTags).where(eq(taskItemTags.itemId, task.id)).run()
        if (task.tagIds.length > 0) {
          conn
            .insert(taskItemTags)
            .values(task.tagIds.map((tagId) => ({ itemId: task.id, tagId })))
            .run()
        }
      }
    }
    // bulkApply reports unknown selection entries as `id: 0` — remap them to
    // the real requested ids so the UI can point at the rows.
    const skipped = result.skipped.filter((s) => s.id !== 0)
    const missing = ids.filter((id) => byId.get(id) === undefined)
    return {
      applied: result.applied,
      skipped: [...skipped, ...missing.map((id) => ({ id, reason: 'not found' }))],
    }
  }, database)
}

/**
 * Persist a display order: dense renumber 0..n-1 over the given ids in one
 * transaction (S3-60's simplest-correct strategy). Ids outside the list are
 * untouched, so a view renumbers only its own rows.
 */
export function setTaskOrder(ids: number[], database?: DbOrTx): void {
  txRun((conn) => {
    ids.forEach((id, index) => {
      conn.update(taskItems).set({ order: index }).where(eq(taskItems.id, id)).run()
    })
  }, database)
}

/**
 * Move one task to `targetIndex` within the display list `listIds`
 * (core {@link moveTo}) and persist the resulting dense order.
 */
export function moveTaskItem(
  id: number,
  targetIndex: number,
  listIds: number[],
  database?: DbOrTx,
): number[] {
  const next = moveTo(listIds, id, targetIndex)
  setTaskOrder(next, database)
  return next
}

// ── Tag links ───────────────────────────────────────────────────────────────

/** All tags in creation order. */
export function listTaskTags(database?: DbOrTx): TaskTagRow[] {
  return run((conn) => conn.select().from(taskTags).orderBy(asc(taskTags.id)).all(), database)
}

/** Create a tag (name normalized via core {@link normalizeTagName}; unique). */
export function createTaskTag(input: CreateTagInput, database?: DbOrTx): TaskTagRow {
  return txRun((conn) => {
    const name = normalizeTagName(input.name)
    if (name.length === 0) throw new Error('A tag needs a name.')
    const existing = conn.select().from(taskTags).where(eq(taskTags.name, name)).get()
    if (existing) throw new Error(`Tag "${name}" already exists`)
    return conn
      .insert(taskTags)
      .values({ name, color: input.color ?? null, createdAt: new Date().toISOString() })
      .returning()
      .all()[0]!
  }, database)
}

/** Update a tag (color / normalized name); null when missing. */
export function updateTaskTag(
  id: number,
  patch: { name?: string; color?: string | null },
  database?: DbOrTx,
): TaskTagRow | null {
  return txRun((conn) => {
    const existing = conn.select().from(taskTags).where(eq(taskTags.id, id)).get()
    if (!existing) return null
    const v = updateTagInputSchema.parse(patch)
    if (v.name !== undefined) {
      const name = normalizeTagName(v.name)
      if (name.length === 0) throw new Error('A tag needs a name.')
      const clash = conn.select().from(taskTags).where(eq(taskTags.name, name)).get()
      if (clash && clash.id !== id) throw new Error(`Tag "${name}" already exists`)
      existing.name = name
    }
    if (v.color !== undefined) existing.color = v.color
    conn
      .update(taskTags)
      .set({ name: existing.name, color: existing.color })
      .where(eq(taskTags.id, id))
      .run()
    return conn.select().from(taskTags).where(eq(taskTags.id, id)).get()!
  }, database)
}

/** Delete a tag and unlink every task (links are the only dependents). */
export function deleteTaskTag(id: number, database?: DbOrTx): boolean {
  return txRun((conn) => {
    const existing = conn.select().from(taskTags).where(eq(taskTags.id, id)).get()
    if (!existing) return false
    conn.delete(taskItemTags).where(eq(taskItemTags.tagId, id)).run()
    conn.delete(taskTags).where(eq(taskTags.id, id)).run()
    return true
  }, database)
}

/** Replace a task's tag set (all ids must exist — {@link ensureTagsExist}). */
export function setTaskItemTags(itemId: number, tagIds: number[], database?: DbOrTx): void {
  txRun((conn) => {
    ensureTagsExist(conn, tagIds)
    conn.delete(taskItemTags).where(eq(taskItemTags.itemId, itemId)).run()
    if (tagIds.length > 0) {
      conn
        .insert(taskItemTags)
        .values(tagIds.map((tagId) => ({ itemId, tagId })))
        .run()
    }
  }, database)
}

// ── Projects ────────────────────────────────────────────────────────────────

/** All projects (backlog and archived included — core selectors sort views). */
export function listTaskProjects(database?: DbOrTx): TaskProjectRow[] {
  return run(
    (conn) => conn.select().from(taskProjects).orderBy(asc(taskProjects.id)).all(),
    database,
  )
}

/** One project by id, or null. */
export function getTaskProject(id: number, database?: DbOrTx): TaskProjectRow | null {
  return run(
    (conn) => conn.select().from(taskProjects).where(eq(taskProjects.id, id)).get() ?? null,
    database,
  )
}

/** Create a project row (title required; backlog defaults off). */
export function createTaskProjectRow(input: CreateProjectInput, database?: DbOrTx): TaskProjectRow {
  return txRun((conn) => {
    const now = new Date().toISOString()
    const title = input.title.trim()
    if (title.length === 0) throw new Error('A project needs a title.')
    return conn
      .insert(taskProjects)
      .values({
        title,
        notes: input.notes ?? null,
        backlogFlag: input.backlogFlag ?? false,
        color: input.color ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all()[0]!
  }, database)
}

/** Patch a project (notes/backlog/color/title); updatedAt bumps. */
export function updateTaskProjectRow(
  id: number,
  patch: Partial<Pick<TaskProjectRow, 'title' | 'notes' | 'backlogFlag' | 'color'>>,
  database?: DbOrTx,
): TaskProjectRow | null {
  return txRun((conn) => {
    const existing = conn.select().from(taskProjects).where(eq(taskProjects.id, id)).get()
    if (!existing) return null
    conn
      .update(taskProjects)
      .set({
        title: patch.title?.trim() || existing.title,
        notes: patch.notes !== undefined ? patch.notes : existing.notes,
        backlogFlag: patch.backlogFlag !== undefined ? patch.backlogFlag : existing.backlogFlag,
        color: patch.color !== undefined ? patch.color : existing.color,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(taskProjects.id, id))
      .run()
    return conn.select().from(taskProjects).where(eq(taskProjects.id, id)).get()!
  }, database)
}

/** Archive a project (idempotent — archivedAt stamps the shelving). */
export function archiveTaskProjectRow(
  id: number,
  now: string = new Date().toISOString(),
  database?: DbOrTx,
): TaskProjectRow | null {
  return txRun((conn) => {
    const existing = conn.select().from(taskProjects).where(eq(taskProjects.id, id)).get()
    if (!existing || existing.archivedAt !== null) return existing ?? null
    conn
      .update(taskProjects)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(taskProjects.id, id))
      .run()
    return conn.select().from(taskProjects).where(eq(taskProjects.id, id)).get()!
  }, database)
}

/** Restore an archived project (S3-75 trophy reopen). */
export function restoreTaskProjectRow(id: number, database?: DbOrTx): TaskProjectRow | null {
  return txRun((conn) => {
    const existing = conn.select().from(taskProjects).where(eq(taskProjects.id, id)).get()
    if (!existing) return null
    const now = new Date().toISOString()
    conn
      .update(taskProjects)
      .set({ archivedAt: null, updatedAt: now })
      .where(eq(taskProjects.id, id))
      .run()
    return conn.select().from(taskProjects).where(eq(taskProjects.id, id)).get()!
  }, database)
}

/**
 * Delete a project WITHOUT touching its tasks (SP semantics): the tasks
 * move to the inbox (projectId nulled) and the row is removed. Subtask
 * parents keep their children — only the project scope changes.
 */
export function deleteTaskProjectRow(id: number, database?: DbOrTx): boolean {
  return txRun((conn) => {
    const existing = conn.select().from(taskProjects).where(eq(taskProjects.id, id)).get()
    if (!existing) return false
    const now = new Date().toISOString()
    conn
      .update(taskItems)
      .set({ projectId: null, updatedAt: now })
      .where(eq(taskItems.projectId, id))
      .run()
    conn.delete(taskProjects).where(eq(taskProjects.id, id)).run()
    return true
  }, database)
}

/**
 * Duplicate a project with its OPEN top-level tasks (done/won't-do tasks
 * and time logs stay behind — SP copies the work plan, not the history),
 * including subtasks and tag links.
 */
export function duplicateTaskProjectRow(id: number, database?: DbOrTx): TaskProjectRow | null {
  return txRun((conn) => {
    const source = conn.select().from(taskProjects).where(eq(taskProjects.id, id)).get()
    if (!source) return null
    if (source.archivedAt !== null) {
      throw new Error('Restore this project before duplicating it.')
    }
    const now = new Date().toISOString()
    const copy = conn
      .insert(taskProjects)
      .values({
        title: `${source.title} (copy)`.slice(0, 200),
        notes: source.notes,
        backlogFlag: source.backlogFlag,
        color: source.color,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all()[0]!

    for (const task of listTaskItems({ projectId: id, parentId: null, database: conn })) {
      if (task.isDone || task.wonthado) continue
      const taskCopy = duplicateTask(task, now, { projectId: copy.id })
      const [row] = conn
        .insert(taskItems)
        .values({
          parentId: taskCopy.parentId,
          projectId: taskCopy.projectId,
          title: taskCopy.title,
          notes: taskCopy.notes,
          priority: taskCopy.priority,
          estimateMs: taskCopy.estimateMs,
          timeSpentOnDay: taskCopy.timeSpentOnDay,
          due: taskCopy.due,
          dueWithTime: taskCopy.dueWithTime,
          deadline: taskCopy.deadline,
          isDone: taskCopy.isDone,
          doneAt: taskCopy.doneAt,
          wonthado: taskCopy.wonthado,
          repeatCfgId: taskCopy.repeatCfgId,
          order: taskCopy.order,
          createdAt: taskCopy.createdAt,
          updatedAt: taskCopy.updatedAt,
        })
        .returning()
        .all()
      if (task.tagIds.length > 0) {
        conn
          .insert(taskItemTags)
          .values(task.tagIds.map((tagId) => ({ itemId: row!.id, tagId })))
          .run()
      }
      for (const sub of listTaskItems({ parentId: task.id, database: conn })) {
        const subCopy = duplicateTask(sub, now, { projectId: copy.id, parentId: row!.id })
        conn
          .insert(taskItems)
          .values({
            parentId: subCopy.parentId,
            projectId: subCopy.projectId,
            title: subCopy.title,
            notes: subCopy.notes,
            priority: subCopy.priority,
            estimateMs: subCopy.estimateMs,
            timeSpentOnDay: subCopy.timeSpentOnDay,
            due: subCopy.due,
            dueWithTime: subCopy.dueWithTime,
            deadline: subCopy.deadline,
            isDone: subCopy.isDone,
            doneAt: subCopy.doneAt,
            wonthado: subCopy.wonthado,
            repeatCfgId: subCopy.repeatCfgId,
            order: subCopy.order,
            createdAt: subCopy.createdAt,
            updatedAt: subCopy.updatedAt,
          })
          .returning()
          .all()
      }
    }
    return copy
  }, database)
}

// ── Repeat configs ──────────────────────────────────────────────────────────

/** All repeat configs (S3-19's projections read them). */
export function listRepeatCfgs(database?: DbOrTx): RepeatCfgRow[] {
  return run(
    (conn) => conn.select().from(taskRepeatCfgs).orderBy(asc(taskRepeatCfgs.id)).all(),
    database,
  )
}

/** One repeat config, or null. */
export function getRepeatCfg(id: number, database?: DbOrTx): RepeatCfgRow | null {
  return run(
    (conn) => conn.select().from(taskRepeatCfgs).where(eq(taskRepeatCfgs.id, id)).get() ?? null,
    database,
  )
}

/**
 * Create a repeat config. The core input's `title` is dropped (the table
 * has no title column — see the module header).
 */
export function createRepeatCfgRow(input: RepeatCfgWrite, database?: DbOrTx): RepeatCfgRow {
  return txRun((conn) => {
    const v = createRepeatCfgInputSchema.parse(input)
    const now = new Date().toISOString()
    return conn
      .insert(taskRepeatCfgs)
      .values({
        cycle: v.cycle,
        interval: v.interval,
        startDate: v.startDate,
        endDate: v.endDate ?? null,
        skipDates: v.skipDates ?? [],
        reAnchor: v.reAnchor,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all()[0]!
  }, database)
}

/** Patch a repeat config; deleting-dependent tasks keep working (FK nulled on delete). */
export function updateRepeatCfgRow(
  id: number,
  patch: Partial<RepeatCfgWrite>,
  database?: DbOrTx,
): RepeatCfgRow | null {
  return txRun((conn) => {
    const existing = conn.select().from(taskRepeatCfgs).where(eq(taskRepeatCfgs.id, id)).get()
    if (!existing) return null
    const v = createRepeatCfgInputSchema.parse({
      cycle: patch.cycle ?? existing.cycle,
      interval: patch.interval ?? existing.interval,
      startDate: patch.startDate ?? existing.startDate,
      endDate: patch.endDate !== undefined ? patch.endDate : existing.endDate,
      skipDates: patch.skipDates ?? existing.skipDates,
      reAnchor: patch.reAnchor ?? existing.reAnchor,
    })
    conn
      .update(taskRepeatCfgs)
      .set({
        cycle: v.cycle,
        interval: v.interval,
        startDate: v.startDate,
        endDate: v.endDate ?? null,
        skipDates: v.skipDates ?? [],
        reAnchor: v.reAnchor,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(taskRepeatCfgs.id, id))
      .run()
    return conn.select().from(taskRepeatCfgs).where(eq(taskRepeatCfgs.id, id)).get()!
  }, database)
}

/**
 * Delete a repeat config: referencing tasks become one-off (repeatCfgId
 * nulled) instead of dangling — SP's "remove repeat" behavior.
 */
export function deleteRepeatCfgRow(id: number, database?: DbOrTx): boolean {
  return txRun((conn) => {
    const existing = conn.select().from(taskRepeatCfgs).where(eq(taskRepeatCfgs.id, id)).get()
    if (!existing) return false
    conn.update(taskItems).set({ repeatCfgId: null }).where(eq(taskItems.repeatCfgId, id)).run()
    conn.delete(taskRepeatCfgs).where(eq(taskRepeatCfgs.id, id)).run()
    return true
  }, database)
}

// ── Per-task reminders ──────────────────────────────────────────────────────

/** List reminders, newest-last; scope by task or arm them for the scheduler. */
export function listTaskReminders(
  opts: { taskId?: number; before?: string; database?: DbOrTx } = {},
): TaskReminder[] {
  const conn = opts.database ?? getDb()
  const where: SQL[] = []
  if (opts.taskId !== undefined) where.push(eq(taskReminders.taskId, opts.taskId))
  if (opts.before !== undefined) where.push(lte(taskReminders.remindAt, opts.before))
  const rows = conn
    .select()
    .from(taskReminders)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(taskReminders.remindAt))
    .all()
  return rows.map(reminderFromRow)
}

/** Create a task reminder (task must exist; core schema validates the shape). */
export function createTaskReminderRow(
  input: CreateTaskReminderInput,
  database?: DbOrTx,
): TaskReminder {
  return txRun((conn) => {
    const task = conn.select().from(taskItems).where(eq(taskItems.id, input.taskId)).get()
    if (!task) throw new Error(`task #${input.taskId} not found`)
    const draft = createTaskReminderInputSchema.parse(input)
    return reminderFromRow(
      conn
        .insert(taskReminders)
        .values(
          reminderToInsert({
            id: 0,
            taskId: draft.taskId,
            type: draft.type,
            remindAt: draft.remindAt ?? null,
            offsetMs: draft.offsetMs ?? null,
            exactAlarm: draft.exactAlarm ?? false,
            createdAt: new Date().toISOString(),
          }),
        )
        .returning()
        .all()[0]!,
    )
  }, database)
}

/** Patch a reminder (remindAt / offset / exactAlarm); null when missing. */
export function updateTaskReminderRow(
  id: number,
  patch: Partial<Pick<TaskReminder, 'remindAt' | 'offsetMs' | 'exactAlarm'>>,
  database?: DbOrTx,
): TaskReminder | null {
  return txRun((conn) => {
    const row = conn.select().from(taskReminders).where(eq(taskReminders.id, id)).get()
    if (!row) return null
    if (row.type === 'at_time' && patch.remindAt !== undefined) {
      conn
        .update(taskReminders)
        .set({ remindAt: patch.remindAt ?? '' })
        .where(eq(taskReminders.id, id))
        .run()
    }
    if (row.type === 'relative' && patch.offsetMs !== undefined) {
      conn
        .update(taskReminders)
        .set({ remindAt: String(patch.offsetMs) })
        .where(eq(taskReminders.id, id))
        .run()
    }
    if (patch.exactAlarm !== undefined) {
      conn
        .update(taskReminders)
        .set({ exactAlarm: patch.exactAlarm })
        .where(eq(taskReminders.id, id))
        .run()
    }
    return reminderFromRow(conn.select().from(taskReminders).where(eq(taskReminders.id, id)).get()!)
  }, database)
}

/** Delete one reminder. */
export function deleteTaskReminderRow(id: number, database?: DbOrTx): boolean {
  return txRun((conn) => {
    const existing = conn.select().from(taskReminders).where(eq(taskReminders.id, id)).get()
    if (!existing) return false
    conn.delete(taskReminders).where(eq(taskReminders.id, id)).run()
    return true
  }, database)
}

// ── Time logs (S3-10 / S3-18) ───────────────────────────────────────────────

/** Insert values for a normalized session. */
function timeLogToInsert(log: TimeLog): typeof taskTimeLogs.$inferInsert {
  return {
    taskId: log.taskId,
    day: log.day,
    sessionMs: log.sessionMs,
    startedAt: log.startedAt,
    source: log.source,
    createdAt: log.createdAt,
  }
}

/** Row → core {@link TimeLog}. */
function timeLogFromRow(row: TimeLogRow): TimeLog {
  return {
    id: row.id,
    taskId: row.taskId,
    day: row.day,
    sessionMs: row.sessionMs,
    startedAt: row.startedAt,
    source: row.source as TimeLogSource,
    createdAt: row.createdAt,
  }
}

/**
 * Re-derive a task's `timeSpentOnDay` map from its session rows (S3-10's
 * merge rule — the map is the SUM of the log, never hand-patched).
 */
function recomputeTaskMap(conn: DbOrTx, taskId: number): void {
  const logs = conn
    .select()
    .from(taskTimeLogs)
    .where(eq(taskTimeLogs.taskId, taskId))
    .all()
    .map(timeLogFromRow)
  const task = getTaskItem(taskId, conn)
  if (!task) return
  const merged = recomputeTaskTime(task, logs)
  conn
    .update(taskItems)
    .set({ timeSpentOnDay: merged.timeSpentOnDay })
    .where(eq(taskItems.id, taskId))
    .run()
}

/**
 * Append one tracked session and refresh the task's per-day map — the
 * single write path for tracked time (S3-18's tick/stop, focus-source
 * sessions, idle corrections all funnel here). Sub-second and over-cap
 * sessions are dropped (core {@link normalizeSession} returns null).
 */
export function insertTimeLog(
  input: {
    taskId: number
    day: string
    sessionMs: number
    startedAt?: string | null
    source?: TimeLogSource
  },
  database?: DbOrTx,
): TimeLog | null {
  return txRun((conn) => {
    const normalized = normalizeSession({
      taskId: input.taskId,
      day: input.day,
      sessionMs: input.sessionMs,
      startedAt: input.startedAt ?? null,
      source: input.source ?? 'manual',
    })
    if (!normalized) return null
    const [row] = conn.insert(taskTimeLogs).values(timeLogToInsert(normalized)).returning().all()
    recomputeTaskMap(conn, input.taskId)
    return timeLogFromRow(row!)
  }, database)
}

/**
 * Convenience tick: track `sessionMs` on the calendar day of `startedAt`
 * (or `now`). Returns null when the tick quantizes to nothing.
 */
export function trackTaskTime(
  taskId: number,
  sessionMs: number,
  opts: { startedAt?: string; source?: TimeLogSource; database?: DbOrTx } = {},
): TimeLog | null {
  const startedAt = opts.startedAt ?? new Date().toISOString()
  return insertTimeLog(
    {
      taskId,
      day: startedAt.slice(0, 10),
      sessionMs,
      startedAt,
      source: opts.source ?? 'manual',
    },
    opts.database,
  )
}

/** List session rows (worklog/history queries), newest first. */
export function listTimeLogs(
  opts: { taskId?: number; day?: string; from?: string; to?: string; database?: DbOrTx } = {},
): TimeLog[] {
  const conn = opts.database ?? getDb()
  const where: SQL[] = []
  if (opts.taskId !== undefined) where.push(eq(taskTimeLogs.taskId, opts.taskId))
  if (opts.day !== undefined) where.push(eq(taskTimeLogs.day, opts.day))
  if (opts.from !== undefined) where.push(gte(taskTimeLogs.day, opts.from))
  if (opts.to !== undefined) where.push(lte(taskTimeLogs.day, opts.to))
  return conn
    .select()
    .from(taskTimeLogs)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(desc(taskTimeLogs.day), desc(taskTimeLogs.id))
    .all()
    .map(timeLogFromRow)
}

/**
 * Correction path: remove one session row and re-derive the task's map.
 * (The log itself stays append-only in spirit — corrections delete the
 * offending row, which is how SP's inline worklog edits behave.)
 */
export function deleteTimeLog(id: number, database?: DbOrTx): boolean {
  return txRun((conn) => {
    const row = conn.select().from(taskTimeLogs).where(eq(taskTimeLogs.id, id)).get()
    if (!row) return false
    conn.delete(taskTimeLogs).where(eq(taskTimeLogs.id, id)).run()
    recomputeTaskMap(conn, row.taskId)
    return true
  }, database)
}

/** Total tracked ms over the filter (worklog totals, S3-28). */
export function sumTimeLogs(
  opts: { taskId?: number; from?: string; to?: string; database?: DbOrTx } = {},
): number {
  const conn = opts.database ?? getDb()
  const where: SQL[] = []
  if (opts.taskId !== undefined) where.push(eq(taskTimeLogs.taskId, opts.taskId))
  if (opts.from !== undefined) where.push(gte(taskTimeLogs.day, opts.from))
  if (opts.to !== undefined) where.push(lte(taskTimeLogs.day, opts.to))
  const [row] = conn
    .select({ total: sql<number>`coalesce(sum(${taskTimeLogs.sessionMs}), 0)` })
    .from(taskTimeLogs)
    .where(where.length > 0 ? and(...where) : undefined)
    .all()
  return Number(row?.total ?? 0)
}

// ── Sections ────────────────────────────────────────────────────────────────

/** All sections in display order. */
export function listSections(database?: DbOrTx): TaskSectionRow[] {
  return run(
    (conn) =>
      conn
        .select()
        .from(taskSections)
        .orderBy(asc(taskSections.sortOrder), asc(taskSections.id))
        .all(),
    database,
  )
}

/** Create a section (name required; sortOrder defaults to the end). */
export function createSection(name: string, sortOrder?: number, database?: DbOrTx): TaskSectionRow {
  return txRun((conn) => {
    const trimmed = name.trim()
    if (trimmed.length === 0) throw new Error('A section needs a name.')
    const order =
      sortOrder ??
      Number(
        conn
          .select({ max: sql<number>`coalesce(max(${taskSections.sortOrder}), -1)` })
          .from(taskSections)
          .all()[0]?.max ?? -1,
      ) + 1
    return conn
      .insert(taskSections)
      .values({ name: trimmed, sortOrder: order, createdAt: new Date().toISOString() })
      .returning()
      .all()[0]!
  }, database)
}

/** Patch a section (name / sort order). */
export function updateSection(
  id: number,
  patch: { name?: string; sortOrder?: number },
  database?: DbOrTx,
): TaskSectionRow | null {
  return txRun((conn) => {
    const existing = conn.select().from(taskSections).where(eq(taskSections.id, id)).get()
    if (!existing) return null
    conn
      .update(taskSections)
      .set({
        name: patch.name?.trim() || existing.name,
        sortOrder: patch.sortOrder ?? existing.sortOrder,
      })
      .where(eq(taskSections.id, id))
      .run()
    return conn.select().from(taskSections).where(eq(taskSections.id, id)).get()!
  }, database)
}

/** Delete a section (no dependents — tasks are not section-scoped). */
export function deleteSection(id: number, database?: DbOrTx): boolean {
  return txRun((conn) => {
    const existing = conn.select().from(taskSections).where(eq(taskSections.id, id)).get()
    if (!existing) return false
    conn.delete(taskSections).where(eq(taskSections.id, id)).run()
    return true
  }, database)
}

// ── Attachments ─────────────────────────────────────────────────────────────

/** All attachments of one task, oldest first. */
export function listTaskAttachments(taskId: number, database?: DbOrTx): TaskAttachmentRow[] {
  return run(
    (conn) =>
      conn
        .select()
        .from(taskAttachments)
        .where(eq(taskAttachments.taskId, taskId))
        .orderBy(asc(taskAttachments.id))
        .all(),
    database,
  )
}

/** Attach a file/URL/command to a task (task must exist; type is validated). */
export function createTaskAttachment(
  input: { taskId: number; type: AttachmentType; value: string; title?: string | null },
  database?: DbOrTx,
): TaskAttachmentRow {
  return txRun((conn) => {
    const task = conn.select().from(taskItems).where(eq(taskItems.id, input.taskId)).get()
    if (!task) throw new Error(`task #${input.taskId} not found`)
    if (!attachmentTypeSchema.includes(input.type)) {
      throw new Error(`Attachment type must be one of ${attachmentTypeSchema.join(' | ')}`)
    }
    const value = input.value.trim()
    if (value.length === 0) throw new Error('An attachment needs a value.')
    return conn
      .insert(taskAttachments)
      .values({
        taskId: input.taskId,
        type: input.type,
        value,
        title: input.title?.trim() || null,
        createdAt: new Date().toISOString(),
      })
      .returning()
      .all()[0]!
  }, database)
}

/** Remove one attachment. */
export function deleteTaskAttachment(id: number, database?: DbOrTx): boolean {
  return txRun((conn) => {
    const existing = conn.select().from(taskAttachments).where(eq(taskAttachments.id, id)).get()
    if (!existing) return false
    conn.delete(taskAttachments).where(eq(taskAttachments.id, id)).run()
    return true
  }, database)
}

// ── Archive tiers (S3-11) ───────────────────────────────────────────────────

/** All archive tier rows (S3-29's finish-day summary reads them). */
export function listArchiveTiers(database?: DbOrTx): ArchiveTierRow[] {
  return run(
    (conn) => conn.select().from(taskArchiveTiers).orderBy(desc(taskArchiveTiers.archivedAt)).all(),
    database,
  )
}

/** The archive state of one task, or null (not archived). */
export function getArchiveTier(taskId: number, database?: DbOrTx): ArchiveTierRow | null {
  return run(
    (conn) =>
      conn.select().from(taskArchiveTiers).where(eq(taskArchiveTiers.taskId, taskId)).get() ?? null,
    database,
  )
}

/** Archive a task into a tier (upsert — re-archiving moves the tier). */
export function archiveTaskItem(
  taskId: number,
  tier: ArchiveTier = 'young',
  now: string = new Date().toISOString(),
  database?: DbOrTx,
): ArchiveTierRow {
  return txRun((conn) => {
    const task = conn.select().from(taskItems).where(eq(taskItems.id, taskId)).get()
    if (!task) throw new Error(`task #${taskId} not found`)
    conn
      .insert(taskArchiveTiers)
      .values({ taskId, tier, archivedAt: now, createdAt: now })
      .onConflictDoUpdate({
        target: taskArchiveTiers.taskId,
        set: { tier, archivedAt: now },
      })
      .run()
    return conn.select().from(taskArchiveTiers).where(eq(taskArchiveTiers.taskId, taskId)).get()!
  }, database)
}

/**
 * Restore an archived task to the active lists: the tier row is removed and
 * the task keeps its original done/open state and timestamps (SP parity).
 */
export function restoreTaskItem(taskId: number, database?: DbOrTx): boolean {
  return txRun((conn) => {
    const row = conn
      .select()
      .from(taskArchiveTiers)
      .where(eq(taskArchiveTiers.taskId, taskId))
      .get()
    if (!row) return false
    conn.delete(taskArchiveTiers).where(eq(taskArchiveTiers.taskId, taskId)).run()
    return true
  }, database)
}

/**
 * The auto-archive pass (S3-11 orchestrator, persisted): loads done tasks
 * + existing tiers, asks core {@link planArchivePass} for the transitions,
 * applies them in one transaction. Returns the applied plan for logging.
 */
export function runArchivePass(
  config: ArchiveConfig = DEFAULT_ARCHIVE_CONFIG,
  now: string = new Date().toISOString(),
  database?: LearningHubDB,
): { archived: number[]; promoted: number[]; restored: number[] } {
  return txRun((conn) => {
    const tasks = listTaskItems({
      projectId: 'any',
      parentId: 'any',
      includeDone: true,
      includeWontdo: true,
      database: conn,
    })
    const existing: ArchiveEntry[] = conn
      .select()
      .from(taskArchiveTiers)
      .all()
      .map((r) => ({ taskId: r.taskId, tier: r.tier as ArchiveTier, archivedAt: r.archivedAt }))

    const plan = planArchivePass(tasks, existing, config, now)
    for (const { task, tier } of plan.toArchive) {
      conn
        .insert(taskArchiveTiers)
        .values({ taskId: task.id, tier, archivedAt: now, createdAt: now })
        .onConflictDoUpdate({ target: taskArchiveTiers.taskId, set: { tier, archivedAt: now } })
        .run()
    }
    for (const entry of plan.toPromote) {
      conn
        .update(taskArchiveTiers)
        .set({ tier: 'old', archivedAt: now })
        .where(eq(taskArchiveTiers.taskId, entry.taskId))
        .run()
    }
    for (const entry of plan.toRestore) {
      conn.delete(taskArchiveTiers).where(eq(taskArchiveTiers.taskId, entry.taskId)).run()
    }
    return {
      archived: plan.toArchive.map((a) => a.task.id),
      promoted: plan.toPromote.map((p) => p.taskId),
      restored: plan.toRestore.map((r) => r.taskId),
    }
  }, database)
}

// ── Saved views / boards (S3-24/S3-44) ──────────────────────────────────────

/** All user-defined views (built-in Kanban/Eisenhower live in core/boards). */
export function listTaskViews(database?: DbOrTx): TaskViewRow[] {
  return run((conn) => conn.select().from(taskViews).orderBy(asc(taskViews.id)).all(), database)
}

/** One saved view by id, or null. */
export function getTaskViewRow(id: number, database?: DbOrTx): TaskViewRow | null {
  return run(
    (conn) => conn.select().from(taskViews).where(eq(taskViews.id, id)).get() ?? null,
    database,
  )
}

/** Create a saved view (rule chips in `filter`, sort/group overrides). */
export function createTaskViewRow(
  input: {
    name: string
    kind?: TaskViewKind
    filter?: Record<string, unknown>
    sortBy?: string | null
    groupBy?: string | null
  },
  database?: DbOrTx,
): TaskViewRow {
  return txRun((conn) => {
    const name = input.name.trim()
    if (name.length === 0) throw new Error('A view needs a name.')
    const kind = input.kind ?? 'custom'
    if (!taskViewKindSchema.includes(kind)) {
      throw new Error(`View kind must be one of ${taskViewKindSchema.join(' | ')}`)
    }
    const now = new Date().toISOString()
    return conn
      .insert(taskViews)
      .values({
        name,
        kind,
        filter: input.filter ?? {},
        sortBy: input.sortBy ?? null,
        groupBy: input.groupBy ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all()[0]!
  }, database)
}

/** Patch a saved view (name/kind/filter/sort/group). */
export function updateTaskViewRow(
  id: number,
  patch: {
    name?: string
    kind?: TaskViewKind
    filter?: Record<string, unknown>
    sortBy?: string | null
    groupBy?: string | null
  },
  database?: DbOrTx,
): TaskViewRow | null {
  return txRun((conn) => {
    const existing = conn.select().from(taskViews).where(eq(taskViews.id, id)).get()
    if (!existing) return null
    conn
      .update(taskViews)
      .set({
        name: patch.name?.trim() || existing.name,
        kind: patch.kind ?? existing.kind,
        filter: patch.filter ?? existing.filter,
        sortBy: patch.sortBy !== undefined ? patch.sortBy : existing.sortBy,
        groupBy: patch.groupBy !== undefined ? patch.groupBy : existing.groupBy,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(taskViews.id, id))
      .run()
    return conn.select().from(taskViews).where(eq(taskViews.id, id)).get()!
  }, database)
}

/** Delete a saved view. */
export function deleteTaskViewRow(id: number, database?: DbOrTx): boolean {
  return txRun((conn) => {
    const existing = conn.select().from(taskViews).where(eq(taskViews.id, id)).get()
    if (!existing) return false
    conn.delete(taskViews).where(eq(taskViews.id, id)).run()
    return true
  }, database)
}

// ── Simple counters (S3-31/S3-90) ───────────────────────────────────────────

/** Counters, active first (archived included when asked). */
export function listCounters(
  opts: { includeArchived?: boolean; database?: DbOrTx } = {},
): SimpleCounterRow[] {
  return run((conn) => {
    const rows = conn.select().from(simpleCounters).orderBy(asc(simpleCounters.id)).all()
    return opts.includeArchived ? rows : rows.filter((r) => !r.archived)
  }, opts.database)
}

/** Create a counter (label required). */
export function createCounterRow(
  input: { label: string; color?: string | null },
  database?: DbOrTx,
): SimpleCounterRow {
  return txRun((conn) => {
    const label = input.label.trim()
    if (label.length === 0) throw new Error('A counter needs a label.')
    const now = new Date().toISOString()
    return conn
      .insert(simpleCounters)
      .values({ label, color: input.color ?? null, createdAt: now, updatedAt: now })
      .returning()
      .all()[0]!
  }, database)
}

/** Patch a counter (label/color/archived). */
export function updateCounterRow(
  id: number,
  patch: { label?: string; color?: string | null; archived?: boolean },
  database?: DbOrTx,
): SimpleCounterRow | null {
  return txRun((conn) => {
    const existing = conn.select().from(simpleCounters).where(eq(simpleCounters.id, id)).get()
    if (!existing) return null
    conn
      .update(simpleCounters)
      .set({
        label: patch.label?.trim() || existing.label,
        color: patch.color !== undefined ? patch.color : existing.color,
        archived: patch.archived ?? existing.archived,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(simpleCounters.id, id))
      .run()
    return conn.select().from(simpleCounters).where(eq(simpleCounters.id, id)).get()!
  }, database)
}

/** Delete a counter and its daily logs. */
export function deleteCounterRow(id: number, database?: DbOrTx): boolean {
  return txRun((conn) => {
    const existing = conn.select().from(simpleCounters).where(eq(simpleCounters.id, id)).get()
    if (!existing) return false
    conn.delete(simpleCounterLogs).where(eq(simpleCounterLogs.counterId, id)).run()
    conn.delete(simpleCounters).where(eq(simpleCounters.id, id)).run()
    return true
  }, database)
}

/**
 * Tap a counter on a day: upserts the (counter, day) row, ADDING `by`
 * (default 1) — repeated taps accumulate, S3-90's streak math reads the
 * resulting per-day counts.
 */
export function incrementCounter(
  counterId: number,
  day: string,
  by = 1,
  database?: DbOrTx,
): SimpleCounterLogRow {
  return txRun((conn) => {
    const counter = conn.select().from(simpleCounters).where(eq(simpleCounters.id, counterId)).get()
    if (!counter) throw new Error(`counter #${counterId} not found`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Not a YYYY-MM-DD day: ${day}`)
    conn
      .insert(simpleCounterLogs)
      .values({ counterId, day, count: by, createdAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: [simpleCounterLogs.counterId, simpleCounterLogs.day],
        set: { count: sql`${simpleCounterLogs.count} + ${by}` },
      })
      .run()
    return conn
      .select()
      .from(simpleCounterLogs)
      .where(and(eq(simpleCounterLogs.counterId, counterId), eq(simpleCounterLogs.day, day)))
      .get()!
  }, database)
}

/** Daily counter logs (per counter or across, windowed). */
export function listCounterLogs(
  opts: { counterId?: number; from?: string; to?: string; database?: DbOrTx } = {},
): SimpleCounterLogRow[] {
  const conn = opts.database ?? getDb()
  const where: SQL[] = []
  if (opts.counterId !== undefined) where.push(eq(simpleCounterLogs.counterId, opts.counterId))
  if (opts.from !== undefined) where.push(gte(simpleCounterLogs.day, opts.from))
  if (opts.to !== undefined) where.push(lte(simpleCounterLogs.day, opts.to))
  return conn
    .select()
    .from(simpleCounterLogs)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(simpleCounterLogs.day))
    .all()
}

// ── Metric days (S3-30/S3-50) ───────────────────────────────────────────────

/** One day's metric record, or null. */
export function getMetricDay(day: string, database?: DbOrTx): MetricDayRow | null {
  return run(
    (conn) => conn.select().from(metricDays).where(eq(metricDays.day, day)).get() ?? null,
    database,
  )
}

/**
 * Upsert one day's record: `metrics` entries MERGE into the existing map
 * (per-key addition, SP's metric accumulation); impact/energy/reflection
 * replace when given (null explicitly clears).
 */
export function upsertMetricDay(
  day: string,
  patch: {
    metrics?: Record<string, number>
    impact?: number | null
    energy?: number | null
    reflection?: string | null
  },
  database?: DbOrTx,
): MetricDayRow {
  return txRun((conn) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`Not a YYYY-MM-DD day: ${day}`)
    if (
      patch.impact !== undefined &&
      patch.impact !== null &&
      (patch.impact < 1 || patch.impact > 4)
    ) {
      throw new Error('Impact is 1-4.')
    }
    if (
      patch.energy !== undefined &&
      patch.energy !== null &&
      (patch.energy < 1 || patch.energy > 3)
    ) {
      throw new Error('Energy is 1-3.')
    }
    const now = new Date().toISOString()
    const existing = conn.select().from(metricDays).where(eq(metricDays.day, day)).get()
    const merged: Record<string, number> = { ...(existing?.metrics ?? {}) }
    for (const [key, value] of Object.entries(patch.metrics ?? {})) {
      merged[key] = (merged[key] ?? 0) + value
    }
    conn
      .insert(metricDays)
      .values({
        day,
        metrics: merged,
        impact: patch.impact !== undefined ? patch.impact : (existing?.impact ?? null),
        energy: patch.energy !== undefined ? patch.energy : (existing?.energy ?? null),
        reflection:
          patch.reflection !== undefined ? patch.reflection : (existing?.reflection ?? null),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: metricDays.day,
        set: {
          metrics: merged,
          impact: patch.impact !== undefined ? patch.impact : (existing?.impact ?? null),
          energy: patch.energy !== undefined ? patch.energy : (existing?.energy ?? null),
          reflection:
            patch.reflection !== undefined ? patch.reflection : (existing?.reflection ?? null),
          updatedAt: now,
        },
      })
      .run()
    return conn.select().from(metricDays).where(eq(metricDays.day, day)).get()!
  }, database)
}

/** Metric records over a day window (S3-30 charts read these). */
export function listMetricDays(
  opts: { from?: string; to?: string; database?: DbOrTx } = {},
): MetricDayRow[] {
  const conn = opts.database ?? getDb()
  const where: SQL[] = []
  if (opts.from !== undefined) where.push(gte(metricDays.day, opts.from))
  if (opts.to !== undefined) where.push(lte(metricDays.day, opts.to))
  return conn
    .select()
    .from(metricDays)
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(asc(metricDays.day))
    .all()
}

// ── Trash snapshot helper (S3-12; storage lives with the handler) ───────────

/**
 * Build the trash entry payload for a task about to be deleted: the core
 * {@link TrashEntry} shape minus storage — the handler (S3-16) persists it
 * in the settings store until the lead grants a dedicated table.
 */
export function buildTrashEntry(
  id: number,
  via: TrashEntry['deletedVia'],
  database?: DbOrTx,
): TrashEntry | null {
  const snap = snapshotTaskItem(id, database)
  if (!snap) return null
  return {
    taskId: id,
    snapshot: { ...snap.task, subtasks: snap.subtasks, attachments: snap.attachments },
    title: snap.task.title,
    deletedAt: new Date().toISOString(),
    deletedVia: via,
  }
}
