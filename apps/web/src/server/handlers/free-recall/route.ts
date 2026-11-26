/**
 * /api/free-recall: stateless free-recall ("brain dump") scoring. Runs on Node
 * and in the native webview worker. Logic lives in @learning-hub/core/free-recall.
 */
import { z } from 'zod'
import { readJson, withRoute } from '@/lib/api'
import {
  gapList,
  gapsToEiFacts,
  nextStep,
  passageSchema,
  scoreRecall,
  splitIdeaUnits,
  suggestedDelayMinutes,
} from '@learning-hub/core/free-recall'

/** GET /api/free-recall: actions and limits. */
export const GET = withRoute(async () =>
  Response.json({
    actions: ['units', 'score'],
    limits: { passageChars: 30_000, recallChars: 20_000, rounds: 50 },
  }),
)

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('units'), passage: passageSchema }),
  z.object({
    action: z.literal('score'),
    passage: passageSchema,
    recall: z.string().max(20_000),
    /** Recall scores of earlier rounds on the same passage, oldest first. */
    history: z.array(z.number().min(0).max(100)).max(49).default([]),
  }),
])

/** POST /api/free-recall { action: units | score }: pure computation, nothing stored. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, bodySchema)
  const units = splitIdeaUnits(body.passage.text)
  if (body.action === 'units') return Response.json({ units })
  const report = scoreRecall(units, body.recall)
  const rounds = [...body.history, report.recallScore].map((recallScore, i) => ({
    round: i + 1,
    recallScore,
  }))
  return Response.json({
    report,
    gaps: gapList(report),
    eiFacts: gapsToEiFacts(report),
    next: nextStep(rounds),
    delayMinutes: suggestedDelayMinutes(report.recallScore),
    round: rounds.length,
  })
})
