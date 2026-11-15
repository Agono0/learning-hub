/**
 * /api/cognitive/metacognition — Koriat & Bjork metacognitive calibration & fluency illusion engine.
 *
 * GET  → Return sample metacognitive diagnostic report.
 * POST → Evaluate learner trials and prescribe desirable difficulty adjustments.
 */
import { z } from 'zod'
import { evaluateMetacognitiveProfile, judgmentOfLearningSchema } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const metacognitionInputSchema = z.object({
  trials: z.array(judgmentOfLearningSchema),
})

export const GET = withRoute(async () => {
  const sampleTrials = [
    { confidence: 0.9, outcome: 1.0, latencyMs: 1400 },
    { confidence: 0.8, outcome: 1.0, latencyMs: 1600 },
    { confidence: 0.7, outcome: 0.0, latencyMs: 3200 },
    { confidence: 0.3, outcome: 0.0, latencyMs: 4100 },
    { confidence: 0.85, outcome: 1.0, latencyMs: 1200 },
  ]
  const report = evaluateMetacognitiveProfile(sampleTrials)
  return Response.json({ ok: true, report })
})

export const POST = withRoute(async (req: Request) => {
  const { trials } = await readJson(req, metacognitionInputSchema)
  const report = evaluateMetacognitiveProfile(trials)
  return Response.json({ ok: true, report })
})
