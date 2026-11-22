/**
 * Tasks handlers (S3-20 upgrade) — PUT /api/tasks/[id]/section.
 *
 * Drag-into-section write path (migration 034's `task_items.section_id`):
 * `{ sectionId: number | null }` assigns or unassigns. Unknown section →
 * 404 via the repo's integrity error mapping; unknown task → 404.
 */
import { z } from 'zod'
import { getTaskItem, setTaskItemSection } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, taskNotFound, type IdContext } from '../../../tasks/_shared'

const bodySchema = z.object({
  sectionId: z.number().int().positive().nullable(),
})

export const PUT = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  if (!getTaskItem(id)) return taskNotFound()
  try {
    const body = await readJson(req, bodySchema)
    setTaskItemSection(id, body.sectionId)
    return Response.json({ taskId: id, sectionId: body.sectionId })
  } catch (err) {
    return taskErrorResponse(err)
  }
})
