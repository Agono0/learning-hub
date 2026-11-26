/**
 * Task reporting MCP tools: saved views, worklog rollup, daily metrics and the finish-day pass,
 * over the same repo functions the /api/tasks-views, -worklog, -metrics and -finish-day web
 * handlers use.
 */
import { z } from 'zod'
import { dayKeySchema } from '@learning-hub/core'
import {
  createTaskViewRow,
  deleteTaskViewRow,
  finishDay,
  listMetricDays,
  listTaskViews,
  upsertMetricDay,
  worklogRollup,
} from '@learning-hub/db'
import { json, tool, type RegisteredTool } from '../tool-kit'

const id = z.number().int().positive()

const realDay = dayKeySchema.refine((d) => {
  const parsed = new Date(`${d}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === d
}, 'Expected a real calendar date')

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

function attempt(fn: () => unknown) {
  try {
    return json(fn())
  } catch (err) {
    if (
      err instanceof Error &&
      /(not found|needs a|must be one of|Not a YYYY|must be)/i.test(err.message)
    ) {
      return json({ ok: false, error: err.message })
    }
    throw err
  }
}

export const taskReportTools: RegisteredTool[] = [
  tool('task_view_list', 'List saved task views (the built-in boards have no row).', {}, () => {
    const views = listTaskViews()
    return json({ count: views.length, views })
  }),
  tool(
    'task_view_create',
    'Save a task view (name required; kind kanban, eisenhower or custom).',
    {
      name: z.string().trim().min(1).max(200),
      kind: z.enum(['kanban', 'eisenhower', 'custom']).default('custom'),
      filter: z.record(z.string(), z.unknown()).default({}),
      sortBy: z.string().max(40).nullable().optional(),
      groupBy: z.string().max(40).nullable().optional(),
    },
    (args) => attempt(() => ({ ok: true, view: createTaskViewRow(args) })),
  ),
  tool('task_view_delete', 'Delete a saved task view.', { id }, ({ id: viewId }) =>
    attempt(() =>
      deleteTaskViewRow(viewId) ? { ok: true } : { ok: false, error: `view #${viewId} not found` },
    ),
  ),
  tool(
    'task_worklog',
    'Tracked-time rollup per day and per task. Defaults to the last 7 days ending today.',
    { from: realDay.optional(), to: realDay.optional() },
    ({ from, to }) => {
      const start = from ?? daysAgo(6)
      const end = to ?? today()
      if (start > end) return json({ ok: false, error: 'from must not be after to' })
      return json({ ok: true, ...worklogRollup(start, end) })
    },
  ),
  tool(
    'task_metrics_list',
    'Daily task metric records (impact, energy, reflection, counters) in an optional day range.',
    { from: realDay.optional(), to: realDay.optional() },
    ({ from, to }) => {
      if (from !== undefined && to !== undefined && from > to) {
        return json({ ok: false, error: 'from must not be after to' })
      }
      const days = listMetricDays({ from, to })
      return json({ count: days.length, days })
    },
  ),
  tool(
    'task_metrics_set',
    'Upsert one day of task metrics. metrics entries add per key; impact (1-4), energy (1-3) ' +
      'and reflection replace when given.',
    {
      day: realDay,
      metrics: z.record(z.string(), z.number()).optional(),
      impact: z.number().int().min(1).max(4).nullable().optional(),
      energy: z.number().int().min(1).max(3).nullable().optional(),
      reflection: z.string().max(2000).nullable().optional(),
    },
    ({ day, ...patch }) => attempt(() => ({ ok: true, day: upsertMetricDay(day, patch) })),
  ),
  tool(
    'task_finish_day',
    'End-of-day pass for a day (default today): tasks done, time tracked, tasks still due, and ' +
      'the auto-archive pass is applied (this archives or restores old finished tasks).',
    { day: realDay.optional() },
    ({ day }) => json({ ok: true, ...finishDay(day ?? today()) }),
  ),
]
