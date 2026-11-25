/**
 * @file apps/web/src/server/handlers/feedback-studio/route.ts
 * @description Runtime-neutral API handler for the Feedback Literacy &
 * Formative Assessment Studio.
 *
 * Implements:
 * - GET  /api/feedback-studio — canonical scenarios, Shute guidelines, and
 *          the classifier cue-lexicon summary for the Studio UI.
 * - POST /api/feedback-studio — actions:
 *     classify        → classify one or more feedback statements (level,
 *                       confidence, FIT risks) and return FL metrics.
 *     grade_response  → grade a scenario response and return three-level
 *                       formative feedback (task/process/self-regulation).
 *     generate_deck   → emit FSRS-6 cards from the scenario bank.
 *     audit           → Shute (2008) guideline audit for a set of statements.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (zod validation at boundaries).
 */

import { z } from 'zod'
import {
  auditFeedbackAgainstShute,
  calculateFLMetrics,
  classifyFeedbackStatement,
  FeedbackStatementSchema,
  generateFeedbackFSRSCards,
  getCanonicalFeedbackScenarios,
  gradeScenarioResponse,
  listMisconceptionTags,
  SHUTE_GUIDELINES,
  TARGET_LEVEL_MIX,
} from '@learning-hub/core/feedback-studio'
import { readJson, withRoute } from '@/lib/api'

const FeedbackActionSchema = z.object({
  action: z.enum(['classify', 'grade_response', 'generate_deck', 'audit']).default('classify'),
  statements: z.array(FeedbackStatementSchema).optional(),
  response: z
    .object({
      scenarioId: z.string().min(1),
      optionId: z.string().min(1),
      confidence: z.number().int().min(1).max(5).default(3),
    })
    .optional(),
  scenarioIds: z.array(z.string().min(1)).optional(),
})

/** GET /api/feedback-studio — scenarios, guidelines, and reference constants. */
export const GET = withRoute(async () => {
  return Response.json({
    scenarios: getCanonicalFeedbackScenarios(),
    guidelines: SHUTE_GUIDELINES,
    misconceptionTags: listMisconceptionTags(),
    targetLevelMix: TARGET_LEVEL_MIX,
  })
})

/** POST /api/feedback-studio — run the requested studio action. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, FeedbackActionSchema)

  switch (body.action) {
    case 'grade_response': {
      if (!body.response) {
        return Response.json({ error: 'response is required' }, { status: 400 })
      }
      const result = gradeScenarioResponse(body.response)
      return Response.json({
        isCorrect: result.isCorrect,
        misconceptionTag: result.misconceptionTag ?? null,
        hypercorrectionFlag: result.hypercorrectionFlag,
        feedback: result.feedback,
        explanation: result.scenario.explanation,
      })
    }
    case 'generate_deck': {
      const cards = generateFeedbackFSRSCards(body.scenarioIds)
      return Response.json({ cards, count: cards.length })
    }
    case 'audit': {
      const statements = body.statements ?? []
      const { audits, formativeAlignmentScore } = auditFeedbackAgainstShute(statements)
      return Response.json({ audits, formativeAlignmentScore })
    }
    case 'classify':
    default: {
      const statements = body.statements ?? []
      const classifications = statements.map(classifyFeedbackStatement)
      const metrics = calculateFLMetrics(statements)
      return Response.json({ classifications, metrics })
    }
  }
})
