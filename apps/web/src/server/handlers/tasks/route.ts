/**
 * Tasks handlers (S3-16) — list + create.
 *
 * GET /api/tasks?projectId=all|inbox|<id>&parentId=all|top|<id>
 *            &includeDone=1&includeWontdo=1&limit=N
 *   The SP list semantics: defaults return OPEN top-level tasks across all
 *   projects in display order (`order`, then id) — the shape the Today/Inbox
 *   page (S3-20) and tag filters (S3-23) read. Views narrow via query.
 *
 * POST /api/tasks — create a task from the core CreateTaskInput shape
 *   (title required; project/tags/repeat config existence is enforced by
 *   the repo; short-syntax parsing happens client-side, S3-09, and arrives
 *   here as structured fields).
 */
import { z } from 'zod'
import { createTaskItem, listTaskItems } from '@learning-hub/db'
import { createTaskInputSchema } from '@learning-hub/core'
import { readJson, readQuery, withRoute } from '@/lib/api'
import { taskErrorResponse } from './_shared'

/** Query scopes: `'all'` → every project, `'inbox'` → no project, id → one. */
const projectScopeSchema = z
  .union([z.enum(['all', 'inbox']), z.coerce.number().int().positive()])
  .default('all')

/** Parent scopes: `'all'` → any level, `'top'` → top-level only, id → subtasks of one. */
const parentScopeSchema = z
  .union([z.enum(['all', 'top']), z.coerce.number().int().positive()])
  .default('top')

const listQuerySchema = z.object({
  projectId: projectScopeSchema,
  parentId: parentScopeSchema,
  includeDone: z.enum(['0', '1']).default('0'),
  includeWontdo: z.enum(['0', '1']).default('0'),
  limit: z.coerce.number().int().positive().max(1000).optional(),
})

/** `all|inbox|<id>` query value → repo scope (`'any'` | null | id). */
function toProjectScope(v: z.infer<typeof projectScopeSchema>): number | null | 'any' {
  if (v === 'all') return 'any'
  if (v === 'inbox') return null
  return v
}

/** `all|top|<id>` query value → repo scope (`'any'` | null | id). */
function toParentScope(v: z.infer<typeof parentScopeSchema>): number | null | 'any' {
  if (v === 'all') return 'any'
  if (v === 'top') return null
  return v
}

/** GET /api/tasks — the SP task list (open top-level tasks by default). */
export async function GET(req: Request) {
  const q = readQuery(req, listQuerySchema)
  const tasks = listTaskItems({
    projectId: toProjectScope(q.projectId),
    parentId: toParentScope(q.parentId),
    includeDone: q.includeDone === '1',
    includeWontdo: q.includeWontdo === '1',
    limit: q.limit,
  })
  return Response.json({ tasks })
}

/** POST /api/tasks — create a task (201 with the persisted core model). */
export const POST = withRoute(async (req: Request) => {
  try {
    const input = await readJson(req, createTaskInputSchema)
    const task = createTaskItem(input)
    return Response.json({ task }, { status: 201 })
  } catch (err) {
    return taskErrorResponse(err)
  }
})
