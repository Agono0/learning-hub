/**
 * /api/cognitive/generation — Slamecka & Graf Generation Effect & Desirable Difficulties Engine.
 *
 * GET  → Return sample generation ladder.
 * POST → Create a tiered ladder or evaluate a learner's generation trial.
 */
import { z } from 'zod'
import {
  createGenerationLadder,
  evaluateGenerationTrial,
  generationTierEnum,
  generationTrialInputSchema,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const createLadderInputSchema = z.object({
  concept: z.string().min(1),
  explanation: z.string().min(1),
  tier: generationTierEnum.default('stem_completion'),
})

export const GET = withRoute(async () => {
  const ladder = createGenerationLadder(
    'Active Recall',
    'Retrieving memories strengthens synaptic connections and reduces forgetting curve decay',
    'stem_completion',
  )
  return Response.json({ ok: true, ladder })
})

export const POST = withRoute(async (req: Request) => {
  const json: unknown = await req.clone().json()
  const isTrial =
    typeof json === 'object' && json !== null && 'userAttempt' in json && 'expectedAnswer' in json

  if (isTrial) {
    const trialInput = await readJson(req, generationTrialInputSchema)
    const result = evaluateGenerationTrial(trialInput)
    return Response.json({ ok: true, result })
  }

  const ladderInput = await readJson(req, createLadderInputSchema)
  const ladder = createGenerationLadder(
    ladderInput.concept,
    ladderInput.explanation,
    ladderInput.tier,
  )
  return Response.json({ ok: true, ladder })
})
