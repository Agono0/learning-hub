/**
 * Tasks handlers (S3-16) — PUT /api/tasks/[id]/tags.
 *
 * Wholesale tag-set replacement on one task (the multi-select "edit tags"
 * flow, S3-70). Every tag id must exist — unknown ids are a 400 and the
 * previous set is left untouched (the repo checks before writing).
 */
import { z } from 'zod'
import { getTaskItem, setTaskItemTags } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, taskNotFound, type IdContext } from '../../_shared'

const bodySchema = z.object({
  tagIds: z.array(z.number().int().positive()).max(50),
})

export const PUT = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  if (!getTaskItem(id)) return taskNotFound()
  try {
    const body = await readJson(req, bodySchema)
    setTaskItemTags(id, body.tagIds)
    const task = getTaskItem(id)!
    return Response.json({ tagIds: task.tagIds })
  } catch (err) {
    return taskErrorResponse(err)
  }
})
