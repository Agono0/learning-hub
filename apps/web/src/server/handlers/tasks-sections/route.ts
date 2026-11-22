/**
 * Tasks handlers batch B (S3-17) — task list sections.
 *
 * GET  /api/tasks-sections — sections in display order.
 * POST /api/tasks-sections — create (`{ name, sortOrder? }`; sortOrder
 *      defaults to the end of the list).
 */
import { z } from 'zod'
import { createSection, listSections } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../tasks/_shared'

/** GET /api/tasks-sections. */
export async function GET() {
  return Response.json({ sections: listSections() })
}

const createSchema = z.object({
  name: z.string().trim().min(1, 'A section needs a name').max(200),
  sortOrder: z.number().int().optional(),
})

/** POST /api/tasks-sections — 201 with the row. */
export const POST = withRoute(async (req: Request) => {
  try {
    const body = await readJson(req, createSchema)
    const section = createSection(body.name, body.sortOrder)
    return Response.json({ section }, { status: 201 })
  } catch (err) {
    return taskErrorResponse(err)
  }
})
