/**
 * Tasks MCP tools — the task manager (repos/tasks) for agents: list, add,
 * complete, reopen, and log tracked time. Every tool calls the same repo
 * functions the /api/tasks* web handlers run (createTaskItem, listTaskItems,
 * completeTaskItem, reopenTaskItem, trackTaskTime); no task logic lives here.
 *
 * Failures the web handlers map to 4xx (invalid input, domain-rule violation,
 * unknown id) come back as `{ ok: false, error }`, like the habit tools.
 */
import { z } from 'zod'
import {
  TaskDomainError,
  createTaskInputSchema,
  dayKeySchema,
  taskPrioritySchema,
} from '@learning-hub/core'
import {
  completeTaskItem,
  createTaskItem,
  getTaskItem,
  listTaskItems,
  reopenTaskItem,
  trackTaskTime,
} from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

const taskId = z.number().int().positive()

/** YYYY-MM-DD that is a real calendar date (the regex alone lets 2026-02-30 and 2026-13-45 through). */
const realDay = dayKeySchema.refine(
  (d) => new Date(`${d}T00:00:00.000Z`).toISOString().slice(0, 10) === d,
  'Expected a real calendar date',
)

/** Domain-rule and "<kind> #<id> not found" errors become tool results; the rest rethrow. */
function failure(err: unknown) {
  if (err instanceof TaskDomainError) {
    return json({ ok: false, error: err.message, code: err.code })
  }
  if (err instanceof Error && /not found$/i.test(err.message)) {
    return json({ ok: false, error: err.message })
  }
  throw err
}

export const taskTools: RegisteredTool[] = [
  tool(
    'task_list',
    'List tasks in display order. Defaults to open top-level tasks in every project; ' +
      'projectId=null limits to the inbox, includeDone also returns finished tasks.',
    {
      projectId: taskId.nullable().optional(),
      includeDone: z.boolean().optional(),
      limit: z.number().int().min(1).max(200).default(50),
    },
    ({ projectId, includeDone, limit }) => {
      const tasks = listTaskItems({
        projectId: projectId === undefined ? 'any' : projectId,
        parentId: null,
        includeDone: includeDone ?? false,
        limit,
      })
      return json({ count: tasks.length, tasks })
    },
  ),
  tool(
    'task_add',
    'Create a task (title required; inbox unless projectId is given). due is YYYY-MM-DD, ' +
      'or a full ISO timestamp with dueWithTime=true.',
    {
      title: z.string().min(1),
      projectId: taskId.nullable().optional(),
      priority: taskPrioritySchema.optional(),
      due: z.string().max(40).nullable().optional(),
      dueWithTime: z.boolean().optional(),
      deadline: z.string().nullable().optional(),
      notes: z.string().max(10_000).nullable().optional(),
    },
    (args) => {
      const parsed = createTaskInputSchema.safeParse(args)
      if (!parsed.success) {
        return json({
          ok: false,
          error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        })
      }
      try {
        return json({ ok: true, task: createTaskItem(parsed.data) })
      } catch (err) {
        return failure(err)
      }
    },
  ),
  tool(
    'task_complete',
    'Mark a task done (completing a parent also completes its open subtasks). Idempotent.',
    { id: taskId },
    ({ id }) => {
      try {
        const task = completeTaskItem(id)
        return task ? json({ ok: true, task }) : json({ ok: false, error: `task #${id} not found` })
      } catch (err) {
        return failure(err)
      }
    },
  ),
  tool('task_reopen', "Reopen a finished (or won't-do) task.", { id: taskId }, ({ id }) => {
    try {
      const task = reopenTaskItem(id)
      return task ? json({ ok: true, task }) : json({ ok: false, error: `task #${id} not found` })
    } catch (err) {
      return failure(err)
    }
  }),
  tool(
    'task_track_time',
    'Log tracked time on a task for today (or day=YYYY-MM-DD). Sessions the repo quantizes ' +
      'to nothing (under a second) or over its cap are not stored and reported as such.',
    {
      id: taskId,
      minutes: z.number().positive().max(1440),
      day: realDay.optional(),
    },
    ({ id, minutes, day }) => {
      if (!getTaskItem(id)) return json({ ok: false, error: `task #${id} not found` })
      try {
        const startedAt = day ? `${day}T12:00:00.000Z` : undefined
        const log = trackTaskTime(id, Math.round(minutes * 60_000), { startedAt })
        return log
          ? json({ ok: true, log })
          : json({ ok: false, error: 'session not stored (too short or over the cap)' })
      } catch (err) {
        return failure(err)
      }
    },
  ),
]
