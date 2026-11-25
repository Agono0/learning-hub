/**
 * Learning HUB headless server — EMBODIED LEARNING routes. Same handlers,
 * same zod validation, same Route[] table pattern as the other studio
 * routes; composition lives in ./index.ts.
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  analyzeMismatch,
  EnactmentSessionSchema,
  evaluateGesturePlan,
  ExplanationSampleSchema,
  FadingLadderSchema,
  GestureSpecSchema,
  getEmbodiedScenario,
  listEmbodiedScenarios,
  scoreEnactmentSession,
  STUDIO_PHASE_ORDER,
  validateFadingLadder,
} from '@learning-hub/core'
import { sendJson, readJson } from '../http'
import type { Route } from './shared'

// Host-parity contract: these handlers return the same shapes as the web
// handler in apps/web/src/server/handlers/embodied-learning/route.ts.

/** GET /cognitive/embodied/scenarios — canonical embodied practice scenarios */
function getEmbodiedScenarios(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    ok: true,
    scenarios: listEmbodiedScenarios(),
    phases: STUDIO_PHASE_ORDER,
  })
}

const scenarioBodySchema = z.object({ id: z.string().min(1) })

/** POST /cognitive/embodied/scenario — one full scenario by id */
async function postEmbodiedScenario(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, scenarioBodySchema)
  const scenario = getEmbodiedScenario(body.id)
  if (!scenario) {
    sendJson(res, 404, { ok: false, error: 'scenario not found' })
    return
  }
  sendJson(res, 200, { ok: true, scenario })
}

const evaluatePlanBodySchema = z.object({
  plan: z.array(GestureSpecSchema).min(1),
  coreElements: z.array(z.string().min(1)).min(1),
})

/** POST /cognitive/embodied/evaluate-plan — gesture plan coverage evaluation */
async function postEmbodiedEvaluatePlan(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, evaluatePlanBodySchema)
  sendJson(res, 200, { ok: true, report: evaluateGesturePlan(body.plan, body.coreElements) })
}

const mismatchBodySchema = z.object({ samples: z.array(ExplanationSampleSchema) })

/** POST /cognitive/embodied/mismatch — gesture-speech mismatch analysis */
async function postEmbodiedMismatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, mismatchBodySchema)
  sendJson(res, 200, { ok: true, report: analyzeMismatch(body.samples) })
}

const ladderBodySchema = z.object({ ladder: FadingLadderSchema })

/** POST /cognitive/embodied/ladder — concreteness-fading ladder validation */
async function postEmbodiedLadder(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, ladderBodySchema)
  sendJson(res, 200, { ok: true, report: validateFadingLadder(body.ladder) })
}

const enactBodySchema = z.object({ session: EnactmentSessionSchema })

/** POST /cognitive/embodied/enact — enactment session scoring */
async function postEmbodiedEnact(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, enactBodySchema)
  sendJson(res, 200, { ok: true, report: scoreEnactmentSession(body.session) })
}

export const embodiedLearningRoutes: Route[] = [
  {
    method: 'GET',
    path: '/cognitive/embodied/scenarios',
    summary: 'list canonical embodied learning scenarios (Goldin-Meadow 2003; Bruner 1966)',
    handler: getEmbodiedScenarios,
  },
  {
    method: 'POST',
    path: '/cognitive/embodied/scenario',
    summary: 'fetch one full embodied scenario by id',
    handler: postEmbodiedScenario,
  },
  {
    method: 'POST',
    path: '/cognitive/embodied/evaluate-plan',
    summary: 'evaluate gesture plan coverage, channels and verbal anchoring',
    handler: postEmbodiedEvaluatePlan,
  },
  {
    method: 'POST',
    path: '/cognitive/embodied/mismatch',
    summary: 'analyze gesture-speech mismatch (Church & Goldin-Meadow 1986)',
    handler: postEmbodiedMismatch,
  },
  {
    method: 'POST',
    path: '/cognitive/embodied/ladder',
    summary: 'validate concreteness-fading ladder structure (Fyfe et al. 2014)',
    handler: postEmbodiedLadder,
  },
  {
    method: 'POST',
    path: '/cognitive/embodied/enact',
    summary: 'score an enactment practice session (Engelkamp & Zimmer 1984)',
    handler: postEmbodiedEnact,
  },
]
