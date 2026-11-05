/**
 * PATCH /api/curriculum/stages/:id { checked: boolean[] } — tick a project
 * stage's checklist. The stage is complete when every item is ticked.
 */
import { z } from 'zod'
import { setStageChecks } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { notFound, routeId, type IdContext } from '../../_shared'

const checksSchema = z.object({ checked: z.array(z.boolean()).max(30) })

export const PATCH = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (!id) return notFound('stage')
  const { checked } = await readJson(req, checksSchema)
  const stage = setStageChecks(id, checked)
  return stage ? Response.json({ stage }) : notFound('stage')
})
