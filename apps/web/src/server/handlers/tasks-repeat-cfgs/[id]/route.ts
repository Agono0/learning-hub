/**
 * Tasks handlers batch D (S3-19 / S3-92) — one repeat config.
 * PATCH  /api/tasks-repeat-cfgs/[id] — partial repeat-input patch.
 * DELETE /api/tasks-repeat-cfgs/[id] — referencing tasks become one-off
 *        (repeatCfgId nulled; SP's "remove repeat").
 */
import { z } from 'zod'
import { deleteRepeatCfgRow, getRepeatCfg, updateRepeatCfgRow } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, type IdContext } from '../../tasks/_shared'

const patchSchema = z.object({
  title: z.string().max(200).nullable().optional(),
  cycle: z.enum(['d', 'w', 'm', 'y']).optional(),
  interval: z.number().int().min(1).max(999).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  skipDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).optional(),
  reAnchor: z.enum(['scheduled', 'completion', 'postponed']).optional(),
})

/** GET /api/tasks-repeat-cfgs/[id]. */
export async function GET(_req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const cfg = getRepeatCfg(id)
  if (!cfg) return Response.json({ error: 'Repeat config not found' }, { status: 404 })
  return Response.json({ repeatCfg: cfg })
}

/** PATCH /api/tasks-repeat-cfgs/[id]. */
export const PATCH = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await readJson(req, patchSchema)
    const cfg = updateRepeatCfgRow(id, body)
    if (!cfg) return Response.json({ error: 'Repeat config not found' }, { status: 404 })
    return Response.json({ repeatCfg: cfg })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

/** DELETE /api/tasks-repeat-cfgs/[id]. */
export async function DELETE(_req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const deleted = deleteRepeatCfgRow(id)
  if (!deleted) return Response.json({ error: 'Repeat config not found' }, { status: 404 })
  return Response.json({ deleted: true })
}
