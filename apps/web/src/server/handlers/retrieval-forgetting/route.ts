/**
 * /api/retrieval-forgetting: retrieval-induced forgetting guard.
 * GET runs a read-only audit over the learner's cards and recent reviews.
 * POST saves an audit summary, dismisses or restores a card, or plans a
 * balanced session. Cards, schedules and reviews are never changed here.
 */
import { z } from 'zod'
import { ApiError, readJson, readQuery, withRoute } from '@/lib/api'
import {
  RifLimitError,
  dismissRifCard,
  listRifAudits,
  listRifDismissed,
  planBalancedSession,
  restoreRifCard,
  runRifAudit,
  saveRifAudit,
} from '@learning-hub/db'

const querySchema = z.object({
  deckId: z.coerce.number().int().positive().optional(),
  windowDays: z.coerce.number().int().min(3).max(120).default(21),
})

/** GET /api/retrieval-forgetting?deckId&windowDays: audit, rescue queue, report, history. */
export const GET = withRoute(async (req: Request) => {
  const q = readQuery(req, querySchema)
  const run = runRifAudit({ deckId: q.deckId, windowDays: q.windowDays })
  return Response.json({
    ...run,
    dismissed: listRifDismissed(),
    history: listRifAudits(10).map((h) => ({
      id: h.id,
      deckId: h.deckId,
      atRisk: h.atRisk,
      watch: h.watch,
      meanRisk: h.meanRisk,
      createdAt: h.createdAt,
    })),
  })
})

const cardId = z.number().int().positive()
const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('save'),
    deckId: z.number().int().positive().optional(),
    windowDays: z.number().int().min(3).max(120).default(21),
  }),
  z.object({ action: z.literal('dismiss'), cardId, reason: z.string().max(200).optional() }),
  z.object({ action: z.literal('restore'), cardId }),
  z.object({
    action: z.literal('plan'),
    dueIds: z.array(cardId).max(500),
    budget: z.number().int().min(0).max(50).default(5),
    deckId: z.number().int().positive().optional(),
  }),
])

/** Map a cap error to 409. */
function guardLimit<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof RifLimitError) throw new ApiError(409, e.message)
    throw e
  }
}

/** POST /api/retrieval-forgetting { action: save | dismiss | restore | plan }. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, bodySchema)
  switch (body.action) {
    case 'save': {
      const { audit } = runRifAudit({ deckId: body.deckId, windowDays: body.windowDays })
      const id = saveRifAudit(audit, body.deckId ?? null)
      return Response.json({ id, atRisk: audit.atRisk, watch: audit.watch }, { status: 201 })
    }
    case 'dismiss':
      if (!guardLimit(() => dismissRifCard(body.cardId, body.reason)))
        throw new ApiError(404, 'Card not found')
      return Response.json({ ok: true })
    case 'restore':
      return Response.json({ ok: restoreRifCard(body.cardId) })
    case 'plan':
      return Response.json(
        planBalancedSession(body.dueIds, { deckId: body.deckId, budget: body.budget }),
      )
  }
})
