/**
 * Learning HUB headless server — FEEDBACK STUDIO routes.
 * Same handlers, same zod validation, same Route[] table pattern as the
 * other area modules; composition lives in ./index.ts.
 *
 * Exposes the Feedback Literacy & Formative Assessment engine (Hattie &
 * Timperley 2007; Kluger & DeNisi 1996; Shute 2008) over REST so the
 * headless server keeps parity with web, MCP and CLI.
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
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
} from '@learning-hub/core'
import { sendJson, readJson } from '../http'
import type { Route } from './shared'

const gradeBodySchema = z.object({
  scenarioId: z.string().default('fb-math-fraction-addition'),
  optionId: z.string().min(1),
  confidence: z.number().int().min(1).max(5).default(3),
})

const classifyBodySchema = z.object({
  statements: z.array(FeedbackStatementSchema).min(1),
})

const deckBodySchema = z.object({
  scenarioIds: z.array(z.string().min(1)).optional(),
})

const timingBodySchema = z.object({
  taskDifficulty: z.number().int().min(1).max(5).default(3),
  isProcedural: z.boolean().default(false),
  transferGoal: z.boolean().default(false),
  isRetrievalPractice: z.boolean().default(false),
})

/** GET /cognitive/feedback/scenarios — scenario bank + guidelines + target mix */
function getFeedbackScenarios(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    ok: true,
    scenarios: getCanonicalFeedbackScenarios(),
    guidelines: SHUTE_GUIDELINES,
    misconceptionTags: listMisconceptionTags(),
    targetLevelMix: TARGET_LEVEL_MIX,
  })
}

/** POST /cognitive/feedback/classify — level classification + FIT risks + metrics */
async function postFeedbackClassify(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, classifyBodySchema)
  sendJson(res, 200, {
    ok: true,
    classifications: body.statements.map(classifyFeedbackStatement),
    metrics: calculateFLMetrics(body.statements),
  })
}

/** POST /cognitive/feedback/audit — Shute (2008) formative guideline audit */
async function postFeedbackAudit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, classifyBodySchema)
  const { audits, formativeAlignmentScore } = auditFeedbackAgainstShute(body.statements)
  sendJson(res, 200, { ok: true, audits, formativeAlignmentScore })
}

/** POST /cognitive/feedback/grade — three-level formative feedback for a response */
async function postFeedbackGrade(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, gradeBodySchema)
  const result = gradeScenarioResponse(body)
  sendJson(res, 200, {
    ok: true,
    isCorrect: result.isCorrect,
    misconceptionTag: result.misconceptionTag ?? null,
    hypercorrectionFlag: result.hypercorrectionFlag,
    feedback: result.feedback,
    explanation: result.scenario.explanation,
  })
}

/** POST /cognitive/feedback/deck — FSRS-6 bridge cards */
async function postFeedbackDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, deckBodySchema)
  const cards = generateFeedbackFSRSCards(body.scenarioIds)
  sendJson(res, 200, { ok: true, count: cards.length, cards })
}

/** POST /cognitive/feedback/timing — immediate-vs-delayed guidance (Shute 2008) */
async function postFeedbackTiming(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, timingBodySchema)
  sendJson(res, 200, { ok: true, ...suggestFeedbackTiming(body) })
}

export const feedbackRoutes: Route[] = [
  {
    method: 'GET',
    path: '/cognitive/feedback/scenarios',
    summary: 'list feedback scenarios, Shute guidelines and target level mix',
    handler: getFeedbackScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/feedback/classify',
    summary: 'classify feedback statements (Hattie & Timperley levels, FIT risks, FL metrics)',
    handler: postFeedbackClassify,
  },
  {
    method: 'POST',
    path: '/cognitive/feedback/audit',
    summary: 'Shute (2008) formative guideline audit',
    handler: postFeedbackAudit,
  },
  {
    method: 'POST',
    path: '/cognitive/feedback/grade',
    summary: 'grade a scenario response with three-level formative feedback',
    handler: postFeedbackGrade,
  },
  {
    method: 'POST',
    path: '/cognitive/feedback/deck',
    summary: 'generate FSRS-6 bridge cards from the feedback scenario bank',
    handler: postFeedbackDeck,
  },
  {
    method: 'POST',
    path: '/cognitive/feedback/timing',
    summary: 'immediate vs delayed feedback timing guidance (Shute 2008)',
    handler: postFeedbackTiming,
  },
]
