/**
 * Tasks handlers batch D (S3-19 / S3-92) — repeat configs.
 *
 * GET  /api/tasks-repeat-cfgs — all configs (S3-19's projections + S3-47's
 *      dialog read these).
 * POST /api/tasks-repeat-cfgs — create from the core repeat input (the
 *      UI-side `title` is accepted and dropped — no DB column).
 */
import { z } from 'zod'
import { createRepeatCfgRow, listRepeatCfgs } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../tasks/_shared'

/** GET /api/tasks-repeat-cfgs. */
export async function GET() {
  return Response.json({ repeatCfgs: listRepeatCfgs() })
}

const createSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  cycle: z.enum(['d', 'w', 'm', 'y']),
  interval: z.number().int().min(1).max(999).default(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  skipDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).default([]),
  reAnchor: z.enum(['scheduled', 'completion', 'postponed']),
})

/** POST /api/tasks-repeat-cfgs — 201 with the row (title persisted, 034). */
export const POST = withRoute(async (req: Request) => {
  try {
    const body = await readJson(req, createSchema)
    const cfg = createRepeatCfgRow({
      title: body.title ?? null,
      cycle: body.cycle,
      interval: body.interval,
      startDate: body.startDate,
      endDate: body.endDate ?? null,
      skipDates: body.skipDates,
      reAnchor: body.reAnchor,
    })
    return Response.json({ repeatCfg: cfg }, { status: 201 })
  } catch (err) {
    return taskErrorResponse(err)
  }
})
