/**
 * GET /api/curriculum/courses/:id/export?format=json|yaml
 * Download the course as LHCF — to back it up, share it, or hand it to an AI
 * to improve (re-importing keeps progress because slugs are stable).
 */
import { stringify } from 'yaml'
import { slugify } from '@learning-hub/core/curriculum'
import { exportCurriculum } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { notFound, routeId, type IdContext } from '../../../_shared'

export const GET = withRoute(async (req: Request, ctx: IdContext) => {
  const id = await routeId(ctx)
  const course = id ? exportCurriculum(id) : null
  if (!course) return notFound('course')
  const yaml = new URL(req.url).searchParams.get('format') === 'yaml'
  const body = yaml ? stringify(course, { lineWidth: 0 }) : JSON.stringify(course, null, 2) + '\n'
  const filename = `${slugify(course.slug || course.title)}.lhcf.${yaml ? 'yaml' : 'json'}`
  return new Response(body, {
    headers: {
      'content-type': yaml ? 'application/yaml; charset=utf-8' : 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  })
})
