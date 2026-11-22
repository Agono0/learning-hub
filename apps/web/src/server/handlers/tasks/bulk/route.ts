/**
 * Tasks handlers (S3-16) — POST /api/tasks/bulk.
 *
 * The single batch path (multi-select bar, S3-70): one core `bulkOp` over a
 * selection, persisted transactionally. Per-task failures never abort the
 * batch — they land in `skipped` with the reason (and unknown ids come back
 * as `{ id, reason: 'not found' }` so the UI can point at the rows).
 */
import { z } from 'zod'
import { bulkApplyTaskItems } from '@learning-hub/db'
import { bulkOpSchema } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../_shared'

const bodySchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(200),
  op: bulkOpSchema,
})

/** POST /api/tasks/bulk — `{ ids, op }` → `{ applied, skipped }`. */
export const POST = withRoute(async (req: Request) => {
  try {
    const body = await readJson(req, bodySchema)
    const result = bulkApplyTaskItems(body.ids, body.op)
    return Response.json(result)
  } catch (err) {
    return taskErrorResponse(err)
  }
})
