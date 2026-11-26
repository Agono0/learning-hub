/**
 * Learning HUB headless server — TASKS routes. Closes the tasks parity gap: the task manager
 * (repos/tasks) already serves the web app (handlers/tasks*) and MCP/CLI (task_*), and the
 * headless server had no tasks routes at all. Same repo functions, same core input schema, same
 * status mapping as the web handlers (domain rule 400 + code, "<kind> #<id> not found" 404,
 * duplicate 409); no task logic lives here.
 *
 * The router matches exact paths, so ids travel in the query (?id=) or the JSON body, like /ideas.
 * Every route here sits behind the server guard (apps/server/src/guard.ts): Host/Origin checks,
 * JSON on writes, and the bearer token when one is configured or the server is exposed.
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { TaskDomainError, createTaskInputSchema, dayKeySchema } from '@learning-hub/core'
import {
  completeTaskItem,
  createTaskItem,
  getTaskItem,
  listTaskItems,
  listTimeLogs,
  reopenTaskItem,
  sumTimeLogs,
  trackTaskTime,
} from '@learning-hub/db'
import { ApiError, readJson, readQuery, sendJson } from '../http'
import type { Route } from './shared'

/** Map a tasks-domain or repository error onto the server error envelope, else rethrow (500). */
function taskError(err: unknown): never {
  if (err instanceof TaskDomainError) throw new ApiError(400, err.message, { code: err.code })
  if (err instanceof Error) {
    if (/not found$/i.test(err.message)) throw new ApiError(404, err.message)
    if (/already exists/i.test(err.message)) throw new ApiError(409, err.message)
    if (/Unknown tag ids/i.test(err.message)) throw new ApiError(400, err.message)
  }
  throw err
}

/** A YYYY-MM-DD that is a real calendar date (the regex alone lets 2026-02-30 through). */
const realDay = dayKeySchema.refine((d) => {
  const parsed = new Date(`${d}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d
}, 'Expected a real calendar date')

const idSchema = z.coerce.number().int().positive()

/** Scopes as the web list route reads them: `all|inbox|<id>` and `all|top|<id>`. */
const projectScopeSchema = z
  .union([z.enum(['all', 'inbox']), z.coerce.number().int().positive()])
  .default('all')
const parentScopeSchema = z
  .union([z.enum(['all', 'top']), z.coerce.number().int().positive()])
  .default('top')

const listQuerySchema = z.object({
  projectId: projectScopeSchema,
  parentId: parentScopeSchema,
  includeDone: z.enum(['0', '1']).default('0'),
  includeWontdo: z.enum(['0', '1']).default('0'),
  limit: z.coerce.number().int().positive().max(1000).optional(),
})

const idQuerySchema = z.object({ id: idSchema })

const trackBodySchema = z.object({
  id: z.number().int().positive(),
  minutes: z.number().positive().max(1440),
  day: realDay.optional(),
})

const timeQuerySchema = z.object({
  taskId: idSchema.optional(),
  day: realDay.optional(),
  from: realDay.optional(),
  to: realDay.optional(),
})

/** GET /tasks?projectId=&parentId=&includeDone=&includeWontdo=&limit= — open top-level tasks by default. */
async function listTasks(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, listQuerySchema)
  const tasks = listTaskItems({
    projectId: q.projectId === 'all' ? 'any' : q.projectId === 'inbox' ? null : q.projectId,
    parentId: q.parentId === 'all' ? 'any' : q.parentId === 'top' ? null : q.parentId,
    includeDone: q.includeDone === '1',
    includeWontdo: q.includeWontdo === '1',
    limit: q.limit,
  })
  sendJson(res, 200, { count: tasks.length, tasks })
}

/** POST /tasks {title, projectId?, priority?, due?, ...} — the core CreateTaskInput shape. */
async function postTask(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const input = await readJson(req, createTaskInputSchema)
  try {
    sendJson(res, 200, { ok: true, task: createTaskItem(input) })
  } catch (err) {
    taskError(err)
  }
}

/** POST /tasks/complete?id= — mark done (a parent also completes its open subtasks). */
async function postComplete(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const { id } = readQuery(url, idQuerySchema)
  try {
    const task = completeTaskItem(id)
    if (!task) throw new ApiError(404, `task #${id} not found`)
    sendJson(res, 200, { ok: true, task })
  } catch (err) {
    if (err instanceof ApiError) throw err
    taskError(err)
  }
}

/** POST /tasks/reopen?id= — reopen a finished or won't-do task. */
async function postReopen(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const { id } = readQuery(url, idQuerySchema)
  try {
    const task = reopenTaskItem(id)
    if (!task) throw new ApiError(404, `task #${id} not found`)
    sendJson(res, 200, { ok: true, task })
  } catch (err) {
    if (err instanceof ApiError) throw err
    taskError(err)
  }
}

/**
 * POST /tasks/time {id, minutes, day?} — log tracked time (the MCP task_track_time contract).
 * Done and won't-do tasks are not trackable (400, as in the web tick route); a session the repo
 * quantizes to nothing or over its cap answers `{ ok: true, stored: false }`.
 */
async function postTrackTime(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, trackBodySchema)
  const task = getTaskItem(body.id)
  if (!task) throw new ApiError(404, `task #${body.id} not found`)
  if (task.isDone || task.wonthado) {
    throw new ApiError(400, 'Completed and won\u2019t-do tasks are not trackable.')
  }
  try {
    const startedAt = body.day ? `${body.day}T12:00:00.000Z` : undefined
    const log = trackTaskTime(body.id, Math.round(body.minutes * 60_000), { startedAt })
    sendJson(res, 200, log ? { ok: true, stored: true, log } : { ok: true, stored: false })
  } catch (err) {
    taskError(err)
  }
}

/** GET /tasks/time?taskId=&day=&from=&to= — tracked sessions (newest first) and the filtered total. */
async function listTime(_req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, timeQuerySchema)
  const filter = { taskId: q.taskId, day: q.day, from: q.from, to: q.to }
  // sumTimeLogs has no `day` filter (the list does), so a single day is passed as from = to = day;
  // otherwise the total would cover every day while the list covers one.
  const total = sumTimeLogs({
    taskId: q.taskId,
    from: q.day ?? q.from,
    to: q.day ?? q.to,
  })
  sendJson(res, 200, { logs: listTimeLogs(filter), totalMs: total })
}

export const tasksRoutes: Route[] = [
  { method: 'GET', path: '/tasks', summary: 'list tasks (listTaskItems)', handler: listTasks },
  { method: 'POST', path: '/tasks', summary: 'create a task (createTaskItem)', handler: postTask },
  {
    method: 'POST',
    path: '/tasks/complete',
    summary: 'mark a task done (?id=)',
    handler: postComplete,
  },
  {
    method: 'POST',
    path: '/tasks/reopen',
    summary: 'reopen a task (?id=)',
    handler: postReopen,
  },
  {
    method: 'POST',
    path: '/tasks/time',
    summary: 'log tracked time on a task (trackTaskTime)',
    handler: postTrackTime,
  },
  {
    method: 'GET',
    path: '/tasks/time',
    summary: 'tracked sessions and total (listTimeLogs)',
    handler: listTime,
  },
]
