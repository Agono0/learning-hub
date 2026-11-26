/**
 * /api/retention-planner: read-only. POST runs one modeled scenario over the
 * learner's Review-state cards. It writes nothing; applying a retention goes
 * through the existing settings and deck endpoints from the UI.
 */
import { z } from 'zod'
import {
  MAX_BUDGET_MINUTES,
  MAX_GRID_POINTS,
  MAX_HORIZON_DAYS,
  MAX_RETENTION,
  MAX_SCHEDULER_CALLS,
  MAX_SIMULATED_CARDS,
  MIN_BUDGET_MINUTES,
  MIN_GRID_POINTS,
  MIN_HORIZON_DAYS,
  MIN_RETENTION,
  PlannerBoundsError,
  fingerprintInput,
  runRetentionPlanner,
} from '@learning-hub/core'
import { loadRetentionPlannerData } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const bodySchema = z
  .object({
    deckId: z.number().int().positive().optional(),
    grid: z
      .array(z.number().min(MIN_RETENTION).max(MAX_RETENTION))
      .min(MIN_GRID_POINTS)
      .max(MAX_GRID_POINTS)
      .optional(),
    horizonDays: z.number().int().min(MIN_HORIZON_DAYS).max(MAX_HORIZON_DAYS).optional(),
    budgetMinutes: z.number().min(MIN_BUDGET_MINUTES).max(MAX_BUDGET_MINUTES).optional(),
    maxCards: z.number().int().min(1).max(MAX_SIMULATED_CARDS).optional(),
    seed: z.number().int().min(-2_147_483_647).max(2_147_483_647).optional(),
    maxCalls: z.number().int().min(1).max(MAX_SCHEDULER_CALLS).optional(),
    /** Skip the simulation and return only the input fingerprint, to check a result is still current. */
    fingerprintOnly: z.boolean().optional(),
  })
  .strict()

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, bodySchema)
  const data = loadRetentionPlannerData({ deckId: body.deckId })
  try {
    if (body.fingerprintOnly) {
      return Response.json({ ok: true, fingerprint: fingerprintInput(data) })
    }
    const { deckId: _deckId, fingerprintOnly: _f, ...options } = body
    void _deckId
    void _f
    const result = await runRetentionPlanner(data, options)
    return Response.json({ ok: true, result, cardsTruncated: data.cardsTruncated })
  } catch (e) {
    if (e instanceof PlannerBoundsError) throw new ApiError(400, e.message)
    throw e
  }
})

export const GET = withRoute(async () =>
  Response.json({
    ok: true,
    bounds: {
      retention: [MIN_RETENTION, MAX_RETENTION],
      gridPoints: [MIN_GRID_POINTS, MAX_GRID_POINTS],
      horizonDays: [MIN_HORIZON_DAYS, MAX_HORIZON_DAYS],
      budgetMinutes: [MIN_BUDGET_MINUTES, MAX_BUDGET_MINUTES],
      maxCards: MAX_SIMULATED_CARDS,
      maxCalls: MAX_SCHEDULER_CALLS,
    },
  }),
)
