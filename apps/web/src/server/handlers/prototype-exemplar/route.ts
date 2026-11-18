/**
 * Runtime-neutral API handler for the Prototype & Exemplar Categorization Studio
 *
 * Grounded in:
 * - Rosch (1975) typicality norms & family resemblance (Rosch & Mervis 1975)
 * - Posner & Keele (1968, 1970) prototype abstraction
 * - Medin & Schaffer (1978) 5-4 structure & exemplar theory
 * - Nosofsky (1986) Generalized Context Model with attention fitting
 * - Ashby & Gott (1988) rule-based decision bounds
 *
 * Actions (zod-discriminated):
 * - `evaluate`: full session telemetry (TSC/CTS/MCD/CRI + model comparison)
 * - `plan`: the most model-diagnostic trial sequence for a category set
 * - `deck`: FSRS-calibrated review cards scaled by the CRI
 */

import { z } from 'zod'
import {
  CANONICAL_CATEGORIZATION_SETS,
  categorizationSubmissionSchema,
  evaluateCategorizationSession,
  findCategorySet,
  generateCategorizationDeck,
  planDiscriminatingBlock,
  type CategorizationEvaluation,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const postPrototypeExemplarBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('evaluate'),
    submission: categorizationSubmissionSchema,
  }),
  z.object({
    action: z.literal('plan'),
    setId: z.string(),
    maxTrials: z.number().int().min(1).max(24).default(6),
  }),
  z.object({
    action: z.literal('deck'),
    setId: z.string(),
    criBaseline: z.number().min(0).max(100).default(50),
  }),
])

export const GET = withRoute(async () => {
  return Response.json({
    ok: true,
    scenarios: CANONICAL_CATEGORIZATION_SETS,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, postPrototypeExemplarBodySchema)

  if (body.action === 'evaluate') {
    const set = findCategorySet(body.submission.setId)
    const evaluation = evaluateCategorizationSession(set, body.submission)
    return Response.json({
      ok: true,
      evaluation,
    })
  }

  if (body.action === 'plan') {
    const set = findCategorySet(body.setId)
    const plan = planDiscriminatingBlock(set, body.maxTrials)
    return Response.json({
      ok: true,
      plan,
    })
  }

  // action === 'deck' — the deck scales FSRS parameters off the CRI baseline,
  // so a neutral evaluation (empty submission) suffices; only `cri` is used.
  const set = findCategorySet(body.setId)
  const neutralEvaluation: CategorizationEvaluation = evaluateCategorizationSession(set, {
    setId: set.id,
  })
  neutralEvaluation.cri = body.criBaseline
  const deck = generateCategorizationDeck(set, neutralEvaluation)
  return Response.json({
    ok: true,
    deck,
  })
})
