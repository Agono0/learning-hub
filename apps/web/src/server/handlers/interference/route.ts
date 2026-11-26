/**
 * /api/interference: lookalike cards that compete at recall.
 * GET ?deckId&windowDays returns the audit, the report, drill totals and the
 * learner's decisions. POST actions: confirm, dismiss, clear (a pair),
 * drill (build a discrimination drill), drill-log, order (spread a queue).
 * Cards, schedules and reviews are never changed here.
 */
import { z } from 'zod'
import { ApiError, readJson, readQuery, withRoute } from '@/lib/api'
import {
  InterferenceLimitError,
  InterferenceValidationError,
  getPairDrill,
  listDrillSummaries,
  listPairDecisions,
  logPairDrill,
  planSeparatedSession,
  runInterferenceAuditDb,
  setPairStatus,
} from '@learning-hub/db'

const querySchema = z.object({
  deckId: z.coerce.number().int().positive().optional(),
  windowDays: z.coerce.number().int().min(7).max(365).default(90),
})

/** GET /api/interference?deckId&windowDays */
export const GET = withRoute(async (req: Request) => {
  const q = readQuery(req, querySchema)
  const run = runInterferenceAuditDb({ deckId: q.deckId, windowDays: q.windowDays })
  return Response.json({
    ...run,
    decisions: listPairDecisions(),
    drills: listDrillSummaries(30),
  })
})

const id = z.number().int().positive()
const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.enum(['confirm', 'dismiss']),
    a: id,
    b: id,
    note: z.string().max(200).nullish(),
  }),
  z.object({ action: z.literal('clear'), a: id, b: id }),
  z.object({ action: z.literal('drill'), a: id, b: id }),
  z.object({
    action: z.literal('drill-log'),
    a: id,
    b: id,
    correct: z.number().int().min(0).max(50),
    total: z.number().int().min(1).max(50),
  }),
  z.object({
    action: z.literal('order'),
    ids: z.array(id).min(1).max(2000),
    gap: z.number().int().min(1).max(20).optional(),
    deckId: id.optional(),
  }),
])

/** Map repository errors to 400 and 409. */
function guard<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof InterferenceValidationError) throw new ApiError(400, e.message)
    if (e instanceof InterferenceLimitError) throw new ApiError(409, e.message)
    throw e
  }
}

/** POST /api/interference { action: confirm | dismiss | clear | drill | drill-log | order }. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, bodySchema)
  switch (body.action) {
    case 'confirm':
    case 'dismiss': {
      const ok = guard(() =>
        setPairStatus(
          body.a,
          body.b,
          body.action === 'confirm' ? 'confirmed' : 'dismissed',
          body.note,
        ),
      )
      if (!ok) throw new ApiError(404, 'Card not found')
      return Response.json({ ok: true })
    }
    case 'clear': {
      if (!guard(() => setPairStatus(body.a, body.b, null)))
        throw new ApiError(404, 'Card not found')
      return Response.json({ ok: true })
    }
    case 'drill': {
      const drill = guard(() => getPairDrill(body.a, body.b))
      if (!drill) throw new ApiError(404, 'Both cards must exist and have a question and an answer')
      return Response.json({ drill })
    }
    case 'drill-log': {
      const r = guard(() => logPairDrill(body))
      if (!r) throw new ApiError(404, 'Card not found')
      return Response.json(r)
    }
    case 'order': {
      const ids = [...new Set(body.ids)]
      return Response.json({
        ids: planSeparatedSession(ids, { gap: body.gap, deckId: body.deckId }),
      })
    }
  }
})
