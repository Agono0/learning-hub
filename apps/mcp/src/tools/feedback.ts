/**
 * Feedback Literacy & Formative Assessment MCP Tools
 *
 * Exposes the Feedback Studio engine to external AI agents (Claude Desktop,
 * Cursor, IDE sidecars):
 * 1. feedback_list_scenarios — canonical misconception-tagged scenarios
 * 2. feedback_classify — Hattie & Timperley (2007) level classification +
 *    Kluger & DeNisi (1996) FIT risk detection with FL metrics
 * 3. feedback_audit — Shute (2008) formative guideline audit
 * 4. feedback_grade_response — three-level formative feedback for a scenario
 *    response, with the hypercorrection flag (Butterfield & Metcalfe 2001)
 * 5. feedback_generate_deck — FSRS-6 bridge cards from the scenario bank
 * 6. feedback_timing — Shute (2008) timing guidance for a teaching context
 */

import { z } from 'zod'
import { json, tool, type RegisteredTool } from '../tool-kit'
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
  suggestFeedbackTiming,
  TARGET_LEVEL_MIX,
} from '@learning-hub/core/feedback-studio'

export const feedbackTools: RegisteredTool[] = [
  tool(
    'feedback_list_scenarios',
    'Lists the canonical formative assessment scenarios (misconception-tagged options with three-level exemplar feedback), Shute (2008) guidelines, and the target Hattie & Timperley (2007) level mix.',
    {},
    async () => {
      return json({
        scenarios: getCanonicalFeedbackScenarios(),
        guidelines: SHUTE_GUIDELINES,
        misconceptionTags: listMisconceptionTags(),
        targetLevelMix: TARGET_LEVEL_MIX,
      })
    },
  ),

  tool(
    'feedback_classify',
    'Classifies feedback statements into Hattie & Timperley (2007) levels with per-level evidence, detects Kluger & DeNisi (1996) FIT self-focus risks, and returns composite Feedback Quality metrics.',
    {
      statements: z.array(FeedbackStatementSchema).min(1),
    },
    async ({ statements }) => {
      const classifications = statements.map(classifyFeedbackStatement)
      const metrics = calculateFLMetrics(statements)
      return json({ classifications, metrics })
    },
  ),

  tool(
    'feedback_audit',
    "Audits a set of feedback statements against Shute's (2008) formative feedback guidelines and returns per-guideline status plus the Formative Alignment Score.",
    {
      statements: z.array(FeedbackStatementSchema).min(1),
    },
    async ({ statements }) => {
      const { audits, formativeAlignmentScore } = auditFeedbackAgainstShute(statements)
      return json({ audits, formativeAlignmentScore })
    },
  ),

  tool(
    'feedback_grade_response',
    'Grades a learner response inside a canonical scenario and returns three-level formative feedback (task/process/self-regulation) plus the hypercorrection flag for high-confidence errors.',
    {
      scenarioId: z.string().default('fb-math-fraction-addition'),
      optionId: z.string().min(1),
      confidence: z.number().int().min(1).max(5).default(3),
    },
    async ({ scenarioId, optionId, confidence }) => {
      const result = gradeScenarioResponse({ scenarioId, optionId, confidence })
      return json({
        isCorrect: result.isCorrect,
        misconceptionTag: result.misconceptionTag ?? null,
        hypercorrectionFlag: result.hypercorrectionFlag,
        feedback: result.feedback,
        explanation: result.scenario.explanation,
      })
    },
  ),

  tool(
    'feedback_generate_deck',
    'Generates FSRS-6 spaced-repetition cards from the feedback scenario bank: one concept card per scenario plus one misconception-diagnosis card per tagged distractor.',
    {
      scenarioIds: z.array(z.string()).optional(),
    },
    async ({ scenarioIds }) => {
      const cards = generateFeedbackFSRSCards(scenarioIds)
      return json({ count: cards.length, cards })
    },
  ),

  tool(
    'feedback_timing',
    'Recommends immediate vs delayed feedback timing for a teaching context, per Shute (2008): delayed for transfer and retrieval practice, immediate for early procedural acquisition.',
    {
      taskDifficulty: z.number().int().min(1).max(5).default(3),
      isProcedural: z.boolean().default(false),
      transferGoal: z.boolean().default(false),
      isRetrievalPractice: z.boolean().default(false),
    },
    async ({ taskDifficulty, isProcedural, transferGoal, isRetrievalPractice }) => {
      return json(
        suggestFeedbackTiming({ taskDifficulty, isProcedural, transferGoal, isRetrievalPractice }),
      )
    },
  ),
]
