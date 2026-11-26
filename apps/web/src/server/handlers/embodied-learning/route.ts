/**
 * /api/embodied-learning — runtime-neutral handler (Request → Response).
 *
 * Runs on Node (via the app/api shim) AND inside the native apps' webview
 * worker (via the hub registry). So: no static node:* imports (lint-enforced),
 * validate every body with zod via readJson, keep logic in @learning-hub/core.
 */
import { z } from 'zod'
import { readJson, withRoute } from '@/lib/api'
import {
  analyzeMismatch,
  EnactmentSessionSchema,
  evaluateGesturePlan,
  ExplanationSampleSchema,
  FadingLadderSchema,
  GestureSpecSchema,
  getEmbodiedScenario,
  listEmbodiedScenarios,
  scoreEnactmentSession,
  STUDIO_PHASE_ORDER,
  validateFadingLadder,
} from '@learning-hub/core/embodied-learning'

/** GET /api/embodied-learning — the scenario library plus studio phase order. */
export const GET = withRoute(async () => {
  return Response.json({ scenarios: listEmbodiedScenarios(), phases: STUDIO_PHASE_ORDER })
})

const postSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('evaluate-plan'),
    plan: z.array(GestureSpecSchema).min(1),
    coreElements: z.array(z.string().min(1)).min(1),
  }),
  z.object({
    action: z.literal('analyze-mismatch'),
    samples: z.array(ExplanationSampleSchema),
  }),
  z.object({
    action: z.literal('validate-ladder'),
    ladder: FadingLadderSchema,
  }),
  z.object({
    action: z.literal('score-enactment'),
    session: EnactmentSessionSchema,
  }),
  z.object({
    action: z.literal('scenario'),
    id: z.string().min(1),
  }),
])

/** POST /api/embodied-learning { action, ... } — run one engine step. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, postSchema)
  switch (body.action) {
    case 'evaluate-plan':
      return Response.json(evaluateGesturePlan(body.plan, body.coreElements))
    case 'analyze-mismatch':
      return Response.json(analyzeMismatch(body.samples))
    case 'validate-ladder':
      return Response.json(validateFadingLadder(body.ladder))
    case 'score-enactment':
      return Response.json(scoreEnactmentSession(body.session))
    case 'scenario': {
      const scenario = getEmbodiedScenario(body.id)
      if (!scenario) return Response.json({ error: 'scenario not found' }, { status: 404 })
      return Response.json({ scenario })
    }
  }
})
