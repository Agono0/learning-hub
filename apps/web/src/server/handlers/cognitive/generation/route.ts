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
import { ApiError, readJson, withRoute } from '@/lib/api'

const createLadderInputSchema = z.object({
  concept: z.string().min(1),
  explanation: z.string().min(1),
  tier: generationTierEnum.default('stem_completion'),
})

function invalidBody(error: z.ZodError): ApiError {
  return new ApiError(
    400,
    'Invalid request body',
    error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  )
}

export const GET = withRoute(async () => {
  const ladder = createGenerationLadder(
    'Active Recall',
    'Retrieving memories strengthens synaptic connections and reduces forgetting curve decay',
    'stem_completion',
  )
  return Response.json({ ok: true, ladder })
})

export const POST = withRoute(async (req: Request) => {
  // Read the body once through readJson (400 on malformed JSON), then pick the schema.
  const json = await readJson(req, z.record(z.string(), z.unknown()))
  const isTrial = 'userAttempt' in json && 'expectedAnswer' in json

  if (isTrial) {
    const trialInput = generationTrialInputSchema.safeParse(json)
    if (!trialInput.success) throw invalidBody(trialInput.error)
    const result = evaluateGenerationTrial(trialInput.data)
    return Response.json({ ok: true, result })
  }

  const ladderParsed = createLadderInputSchema.safeParse(json)
  if (!ladderParsed.success) throw invalidBody(ladderParsed.error)
  const ladderInput = ladderParsed.data
  const ladder = createGenerationLadder(
    ladderInput.concept,
    ladderInput.explanation,
    ladderInput.tier,
  )
  return Response.json({ ok: true, ladder })
})
