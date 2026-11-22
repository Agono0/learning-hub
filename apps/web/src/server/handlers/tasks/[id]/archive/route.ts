/**
 * Tasks handlers (S3-16) — POST /api/tasks/[id]/archive.
 *
 * Moves a task into an archive tier (`young` default; `old` = deep storage,
 * S3-11). Upsert semantics: re-archiving moves the tier. The task row keeps
 * its state/timestamps — restore brings it back unchanged.
 */
import { z } from 'zod'
import { archiveTaskItem } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, type IdContext } from '../../_shared'

const bodySchema = z.object({
  tier: z.enum(['young', 'old']).default('young'),
  /** Optional explicit archive timestamp (finish-day passes its clock). */
  archivedAt: z.string().min(1).optional(),
})

export const POST = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await readJson(req, bodySchema)
    const archive = archiveTaskItem(id, body.tier, body.archivedAt ?? new Date().toISOString())
    return Response.json({ archive })
  } catch (err) {
    return taskErrorResponse(err)
  }
})
