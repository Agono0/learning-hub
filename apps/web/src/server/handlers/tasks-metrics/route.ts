/**
 * Tasks handlers batch D (S3-19 / S3-30 / S3-50) — metric days.
 *
 * GET  /api/tasks-metrics?from=&to= — per-day records for the charts.
 * POST /api/tasks-metrics — upsert one day: `metrics` entries MERGE per key
 *      (per-key addition), `impact` (1-4), `energy` (1-3) and `reflection`
 *      replace when given — the evaluation sheet writes here.
 */
import { calendarDay } from '@/lib/query-params'
import { z } from 'zod'
import { listMetricDays, upsertMetricDay } from '@learning-hub/db'
import { readJson, readQuery, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../tasks/_shared'

const querySchema = z.object({
  from: calendarDay.optional(),
  to: calendarDay.optional(),
})

/** GET /api/tasks-metrics. */
export async function GET(req: Request) {
  const q = readQuery(req, querySchema)
  return Response.json({ days: listMetricDays({ from: q.from, to: q.to }) })
}

const bodySchema = z.object({
  day: calendarDay,
  metrics: z.record(z.string(), z.number()).optional(),
  impact: z.number().int().min(1).max(4).nullable().optional(),
  energy: z.number().int().min(1).max(3).nullable().optional(),
  reflection: z.string().max(2000).nullable().optional(),
})

/** POST /api/tasks-metrics — upsert + merge. */
export const POST = withRoute(async (req: Request) => {
  try {
    const body = await readJson(req, bodySchema)
    const day = upsertMetricDay(body.day, {
      metrics: body.metrics,
      impact: body.impact,
      energy: body.energy,
      reflection: body.reflection,
    })
    return Response.json({ day })
  } catch (err) {
    return taskErrorResponse(err)
  }
})
