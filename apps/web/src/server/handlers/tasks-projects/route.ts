/**
 * Tasks handlers batch B (S3-17) — projects.
 *
 * GET  /api/tasks-projects — every project row (backlog + archived; core
 *      selectors sort the views).
 * POST /api/tasks-projects — create (`{ title, notes?, backlogFlag?, color? }`).
 */
import { z } from 'zod'
import { createTaskProjectRow, listTaskProjects } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../tasks/_shared'

/** GET /api/tasks-projects. */
export async function GET() {
  return Response.json({ projects: listTaskProjects() })
}

const createSchema = z.object({
  title: z.string().trim().min(1, 'A project needs a title').max(200),
  notes: z.string().max(10_000).nullable().optional(),
  backlogFlag: z.boolean().optional(),
  color: z.string().max(40).nullable().optional(),
})

/** POST /api/tasks-projects — 201 with the row. */
export const POST = withRoute(async (req: Request) => {
  try {
    const body = await readJson(req, createSchema)
    const project = createTaskProjectRow(body)
    return Response.json({ project }, { status: 201 })
  } catch (err) {
    return taskErrorResponse(err)
  }
})
