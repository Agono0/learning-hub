/**
 * Tasks handlers batch B (S3-17) — one task list section.
 * PATCH /api/tasks-sections/[id] — `{ name?, sortOrder? }`.
 * DELETE /api/tasks-sections/[id] — sections have no dependents.
 */
import { z } from 'zod'
import { deleteSection, updateSection } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { routeId, taskErrorResponse, type IdContext } from '../../tasks/_shared'

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  sortOrder: z.number().int().optional(),
})

/** PATCH /api/tasks-sections/[id]. */
export const PATCH = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await readJson(req, patchSchema)
    const section = updateSection(id, body)
    if (!section) return Response.json({ error: 'Section not found' }, { status: 404 })
    return Response.json({ section })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

/** DELETE /api/tasks-sections/[id]. */
export async function DELETE(_req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const deleted = deleteSection(id)
  if (!deleted) return Response.json({ error: 'Section not found' }, { status: 404 })
  return Response.json({ deleted: true })
}
