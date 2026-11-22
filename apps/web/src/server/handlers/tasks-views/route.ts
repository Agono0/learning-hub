/**
 * Tasks handlers batch B (S3-17) — saved task views / boards.
 *
 * GET  /api/tasks-views — user-defined views (the built-in Kanban and
 *      Eisenhower boards live in core/boards and need no row).
 * POST /api/tasks-views — create (`{ name, kind?, filter?, sortBy?,
 *      groupBy? }`; rule chips ride in `filter` — S3-24/S3-44).
 */
import { z } from 'zod'
import { createTaskViewRow, listTaskViews } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../tasks/_shared'

/** GET /api/tasks-views. */
export async function GET() {
  return Response.json({ views: listTaskViews() })
}

const createSchema = z.object({
  name: z.string().trim().min(1, 'A view needs a name').max(200),
  kind: z.enum(['kanban', 'eisenhower', 'custom']).default('custom'),
  filter: z.record(z.string(), z.unknown()).default({}),
  sortBy: z.string().max(40).nullable().optional(),
  groupBy: z.string().max(40).nullable().optional(),
})

/** POST /api/tasks-views — 201 with the row. */
export const POST = withRoute(async (req: Request) => {
  try {
    const body = await readJson(req, createSchema)
    const view = createTaskViewRow(body)
    return Response.json({ view }, { status: 201 })
  } catch (err) {
    return taskErrorResponse(err)
  }
})
