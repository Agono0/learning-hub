/**
 * Tasks handlers (S3-16) — POST /api/tasks/order.
 *
 * Two body shapes (zod discriminated on the presence of `ids`):
 * - `{ ids: [...] }` — persist a display order as dense ordinals 0..n-1
 *   (S3-60's simplest-correct strategy; ids outside the list untouched).
 * - `{ id, targetIndex, listIds }` — a single drag: core `moveTo` computes
 *   the new order and persists it; the response echoes the new order so the
 *   client state converges even after optimistic updates.
 */
import { z } from 'zod'
import { moveTaskItem, setTaskOrder } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../_shared'

const bodySchema = z.union([
  z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) }),
  z.object({
    id: z.number().int().positive(),
    targetIndex: z.number().int().min(0),
    listIds: z.array(z.number().int().positive()).min(1).max(500),
  }),
])

/** POST /api/tasks/order — dense renumber or single move. */
export const POST = withRoute(async (req: Request) => {
  try {
    const body = await readJson(req, bodySchema)
    if ('ids' in body) {
      setTaskOrder(body.ids)
      return Response.json({ order: body.ids })
    }
    const order = moveTaskItem(body.id, body.targetIndex, body.listIds)
    return Response.json({ order })
  } catch (err) {
    return taskErrorResponse(err)
  }
})
