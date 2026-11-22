/**
 * Tasks handlers batch B (S3-17) — one project.
 *
 * GET    /api/tasks-projects/[id] — the row (404 when missing).
 * PATCH  /api/tasks-projects/[id] — `{ title?, notes?, backlogFlag?, color? }`.
 * DELETE /api/tasks-projects/[id] — SP semantics: tasks move to the inbox,
 *        the project row is removed (their time logs and history stay).
 */
import { z } from 'zod'
import { deleteTaskProjectRow, getTaskProject, updateTaskProjectRow } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { taskErrorResponse, type IdContext, routeId } from '../../tasks/_shared'

/** GET /api/tasks-projects/[id]. */
export async function GET(_req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const project = getTaskProject(id)
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })
  return Response.json({ project })
}

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  notes: z.string().max(10_000).nullable().optional(),
  backlogFlag: z.boolean().optional(),
  color: z.string().max(40).nullable().optional(),
})

/** PATCH /api/tasks-projects/[id]. */
export const PATCH = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  try {
    const body = await readJson(req, patchSchema)
    const project = updateTaskProjectRow(id, body)
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 })
    return Response.json({ project })
  } catch (err) {
    return taskErrorResponse(err)
  }
})

/** DELETE /api/tasks-projects/[id] — tasks to inbox, row removed. */
export async function DELETE(_req: Request, ctx: IdContext) {
  const id = await routeId(ctx)
  if (id === null) return Response.json({ error: 'Invalid id' }, { status: 400 })
  const deleted = deleteTaskProjectRow(id)
  if (!deleted) return Response.json({ error: 'Project not found' }, { status: 404 })
  return Response.json({ deleted: true })
}
