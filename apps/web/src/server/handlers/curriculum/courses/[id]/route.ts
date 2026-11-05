/**
 * /api/curriculum/courses/:id
 * GET    → the course overview (syllabus with statuses + soft locks, projects,
 *          exam, certificate status).
 * DELETE → remove the course and its exercise deck (review history is kept).
 */
import { deleteCourse, getCourseOverview } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { notFound, routeId, type IdContext } from '../../_shared'

export const GET = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  const overview = id ? getCourseOverview(id) : null
  return overview ? Response.json(overview) : notFound('course')
})

export const DELETE = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  return id && deleteCourse(id) ? Response.json({ ok: true }) : notFound('course')
})
