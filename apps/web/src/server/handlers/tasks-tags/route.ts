/**
 * Tasks handlers batch B (S3-17) — tags.
 *
 * GET  /api/tasks-tags — every tag (creation order; the S3-23 tag pages +
 *      filter chips read this).
 * POST /api/tasks-tags — create (`{ name, color? }`; names normalized and
 *      unique — a duplicate is a 409).
 */
import { z } from 'zod'
import { createTaskTag, listTaskTags } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../tasks/_shared'

/** GET /api/tasks-tags. */
export async function GET() {
  return Response.json({ tags: listTaskTags() })
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(40).nullable().optional(),
})

/** POST /api/tasks-tags — 201 with the row. */
export const POST = withRoute(async (req: Request) => {
  try {
    const body = await readJson(req, createSchema)
    const tag = createTaskTag(body)
    return Response.json({ tag }, { status: 201 })
  } catch (err) {
    return taskErrorResponse(err)
  }
})
