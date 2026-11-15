/**
 * /api/cognitive/tmr — Rasch & Born sleep memory consolidation & TMR cue planner.
 *
 * GET  → Return sample sleep consolidation plan for tonight.
 * POST → Generate personalized Slow-Wave Sleep (SWS) cueing schedule and retention forecast.
 */
import { z } from 'zod'
import { generateSleepConsolidationPlan, tmrCandidateCardSchema } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const tmrPlanInputSchema = z.object({
  cards: z.array(tmrCandidateCardSchema),
  sleepDurationHours: z.number().min(4).max(12).default(7.5),
})

export const GET = withRoute(async () => {
  const sampleCards = [
    {
      cardId: 1,
      stability: 1.2,
      difficulty: 0.6,
      baseFrequency: 330,
      harmonicType: 'major_triad' as const,
      title: 'Vocabulary Item',
    },
    {
      cardId: 2,
      stability: 2.1,
      difficulty: 0.5,
      baseFrequency: 440,
      harmonicType: 'perfect_fifth' as const,
      title: 'Formula',
    },
    {
      cardId: 3,
      stability: 0.7,
      difficulty: 0.8,
      baseFrequency: 550,
      harmonicType: 'octave_bloom' as const,
      title: 'Historical Date',
    },
  ]
  const plan = generateSleepConsolidationPlan(sampleCards, 7.5)
  return Response.json({ ok: true, plan })
})

export const POST = withRoute(async (req: Request) => {
  const { cards, sleepDurationHours } = await readJson(req, tmrPlanInputSchema)
  const plan = generateSleepConsolidationPlan(cards, sleepDurationHours)
  return Response.json({ ok: true, plan })
})
