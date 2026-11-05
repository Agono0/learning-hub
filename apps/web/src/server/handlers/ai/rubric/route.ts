/**
 * POST /api/ai/rubric — optional AI Rubric Coach for `freetext` practice exercises.
 *
 * Evaluates a learner's written response against the exercise's rubric checklist
 * (`criteriaMet`, `score`, `feedback`). Never submits the exercise grade directly:
 * the learner reviews the suggested ticks and retains full manual control.
 * When provider is `'none'`, returns `needsSetup: true` + `manualHint`.
 */
import { z } from 'zod'
import {
  FREETEXT_RUBRIC_SYSTEM,
  freetextRubricPrompt,
  freetextRubricResultSchema,
} from '@learning-hub/core/ai'
import { AIUnavailableError, requireAI } from '@/lib/ai'
import { aiErrorResponse, readJson, withRoute } from '@/lib/api'

const rubricRequestSchema = z.object({
  prompt: z.string().min(1).max(8000),
  rubric: z.array(z.string().min(1).max(1000)).min(1).max(20),
  learnerAnswer: z.string().min(1).max(12000),
  modelAnswer: z.string().max(8000).optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, rubricRequestSchema)

  let ai
  try {
    ai = await requireAI()
  } catch (e) {
    if (e instanceof AIUnavailableError) {
      return Response.json(
        {
          ok: false,
          error: e.message,
          needsSetup: true,
          manualHint:
            'No AI provider needed: tick the rubric criteria manually above, or use the copy-envelope prompt below with any external chat AI.',
        },
        { status: 400 },
      )
    }
    return aiErrorResponse(e)
  }

  try {
    const raw = await ai.generateJSON({
      schema: freetextRubricResultSchema,
      system: FREETEXT_RUBRIC_SYSTEM,
      prompt: freetextRubricPrompt(body),
    })

    const criteriaMet = body.rubric.map((_, idx) => Boolean(raw.criteriaMet[idx]))
    const score = criteriaMet.filter(Boolean).length / body.rubric.length

    return Response.json({
      ok: true,
      criteriaMet,
      score,
      feedback: raw.feedback,
    })
  } catch (e) {
    return aiErrorResponse(e)
  }
})
