/**
 * /api/curriculum/courses/:id/certificate
 * GET  → { issued, eligible, missing }
 * POST → issue it when the course rules are met (idempotent: re-posting returns
 *        the same certificate). Not yet eligible → 409 with what is missing.
 */
import { getCourseOverview, issueCertificate } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { notFound, routeId, type IdContext } from '../../../_shared'

export const GET = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  const overview = id ? getCourseOverview(id) : null
  if (!overview) return notFound('course')
  return Response.json({
    course: { title: overview.course.title, emoji: overview.course.emoji },
    ...overview.certificate,
  })
})

export const POST = withRoute(async (_req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  if (!id) return notFound('course')
  const result = issueCertificate(id)
  if (result.missing.includes('Course not found')) return notFound('course')
  if (!result.issued)
    return Response.json({ error: 'Not eligible yet', missing: result.missing }, { status: 409 })
  return Response.json({ issued: result.issued })
})
