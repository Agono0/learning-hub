/**
 * Tasks handlers batch D (S3-19 / S3-91) — simple counters REST.
 *
 * GET  /api/tasks-counters?all=1 — active counters (archived with `all=1`).
 * POST /api/tasks-counters — create `{ label, color? }`.
 */
import { z } from 'zod'
import { createCounterRow, listCounters } from '@learning-hub/db'
import { readJson, readQuery, withRoute } from '@/lib/api'
import { taskErrorResponse } from '../tasks/_shared'

/** GET /api/tasks-counters. */
export async function GET(req: Request) {
  const q = readQuery(req, z.object({ all: z.enum(['0', '1']).default('0') }))
  return Response.json({ counters: listCounters({ includeArchived: q.all === '1' }) })
}

const createSchema = z.object({
  label: z.string().trim().min(1, 'A counter needs a label').max(200),
  color: z.string().max(40).nullable().optional(),
})

/** POST /api/tasks-counters — 201 with the row. */
export const POST = withRoute(async (req: Request) => {
  try {
    const body = await readJson(req, createSchema)
    const counter = createCounterRow(body)
    return Response.json({ counter }, { status: 201 })
  } catch (err) {
    return taskErrorResponse(err)
  }
})
