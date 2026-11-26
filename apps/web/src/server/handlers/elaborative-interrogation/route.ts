/**
 * /api/elaborative-interrogation — runtime-neutral handler (Request → Response).
 *
 * Stateless by design: the client keeps its facts and per-fact state (local
 * storage) and sends them with each call, so the same handler runs on Node and
 * in the native webview worker with no schema change. All logic is in core.
 */
import { z } from 'zod'
import { readJson, withRoute } from '@/lib/api'
import {
  buildPrompt,
  calibrationPointSchema,
  calibrationReport,
  gradeToFsrsRating,
  lintFacts,
  toMarkdown,
  buildQueue,
  eiFactSchema,
  eiFactStateSchema,
  extractFacts,
  gradeExplanation,
  initialState,
  nextStyle,
  promptStyleSchema,
  summarize,
  updateState,
} from '@learning-hub/core/elaborative-interrogation'

/** GET /api/elaborative-interrogation — describes the actions and limits. */
export const GET = withRoute(async () => {
  return Response.json({
    actions: ['extract', 'queue', 'grade', 'summary', 'lint', 'calibration', 'export'],
    limits: { facts: 200, answerChars: 4000, queue: 50 },
  })
})

const factsField = z.array(eiFactSchema).max(200)
const statesField = z.array(eiFactStateSchema).max(200).default([])
const today = z.number().int().min(0)

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('extract'),
    text: z.string().min(1).max(60_000),
    max: z.number().int().min(1).max(100).default(30),
  }),
  z.object({
    action: z.literal('queue'),
    facts: factsField,
    states: statesField,
    today,
    limit: z.number().int().min(1).max(50).default(10),
  }),
  z.object({ action: z.literal('lint'), facts: factsField }),
  z.object({ action: z.literal('calibration'), points: z.array(calibrationPointSchema).max(2000) }),
  z.object({ action: z.literal('export'), facts: factsField, states: statesField }),
  z.object({ action: z.literal('summary'), facts: factsField, states: statesField, today }),
  z.object({
    action: z.literal('grade'),
    fact: eiFactSchema,
    state: eiFactStateSchema.optional(),
    style: promptStyleSchema.optional(),
    answer: z.string().max(4000),
    today,
  }),
])

/** POST /api/elaborative-interrogation { action, ... } — pure computation, nothing is stored. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, bodySchema)
  switch (body.action) {
    case 'extract':
      return Response.json({ facts: extractFacts(body.text, body.max) })
    case 'queue': {
      const queue = buildQueue(body.facts, body.states, body.today, body.limit)
      return Response.json({ queue, summary: summarize(body.facts, body.states, body.today) })
    }
    case 'lint':
      return Response.json({ issues: lintFacts(body.facts) })
    case 'calibration':
      return Response.json({ report: calibrationReport(body.points) })
    case 'export':
      return Response.json({ markdown: toMarkdown(body.facts, body.states) })
    case 'summary':
      return Response.json({ summary: summarize(body.facts, body.states, body.today) })
    case 'grade': {
      const state = body.state ?? initialState(body.fact)
      const style = body.style ?? nextStyle(state)
      const grade = gradeExplanation(body.fact, body.answer)
      const next = updateState(state, grade, style, body.today)
      return Response.json({
        grade,
        state: next,
        fsrsRating: gradeToFsrsRating(grade),
        nextPrompt: buildPrompt(body.fact, nextStyle(next)),
      })
    }
  }
})
