/**
 * /api/cognitive/feynman-eval — Feynman Teach-Back Simplification & Socratic Reflection Engine.
 *
 * GET  → Return sample diagnostic evaluation report.
 * POST → Evaluate learner's explanation against Flesch-Kincaid & Rozenblit-Keil metrics.
 */
import { evaluateFeynmanExplanation, feynmanEvaluationInputSchema } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

export const GET = withRoute(async () => {
  const sampleInput = {
    concept: 'Electric Current',
    explanation:
      'Think of electricity like water flowing in a pipe. The battery acts like a water pump pushing the water. Because the pump pushes, the water moves through the pipe and turns a water wheel to make light.',
    initialConfidence: 4,
  }
  const report = evaluateFeynmanExplanation(sampleInput)
  return Response.json({ ok: true, report })
})

export const POST = withRoute(async (req: Request) => {
  const input = await readJson(req, feynmanEvaluationInputSchema)
  const report = evaluateFeynmanExplanation(input)
  return Response.json({ ok: true, report })
})
