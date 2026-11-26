/**
 * Tasks handlers (S3-20 upgrade) — GET /api/tasks-sections/assignments.
 *
 * The task → section map (migration 034's `task_items.section_id`) for the
 * Today list's inline section headers: one row per SECTIONED task; the
 * page treats absent ids as unsectioned.
 */
import { withRoute } from '@/lib/api'
import { listTaskSectionAssignments } from '@learning-hub/db'

export const GET = withRoute(async () => {
  return Response.json({ assignments: listTaskSectionAssignments() })
})
