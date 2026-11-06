/**
 * /api/audio/grade — Evaluates user spoken answer with phonetic & fuzzy matching.
 */
import { z } from 'zod'
import { evaluateSpokenAnswer } from '@learning-hub/core/audio'
import { readJson, withRoute } from '@/lib/api'

const speechGradeSchema = z.object({
  spoken: z.string(),
  expected: z.string(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, speechGradeSchema)
  const result = evaluateSpokenAnswer(body.spoken, body.expected)

  return Response.json({
    ok: true,
    pass: result.isMatch,
    ...result,
  })
})
