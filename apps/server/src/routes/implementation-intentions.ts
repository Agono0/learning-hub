/**
 * Learning HUB headless server — IMPLEMENTATION INTENTIONS routes.
 * Same Route[] pattern as the other area modules; composition in ./index.ts.
 *
 * Exposes the if-then planning engine (Gollwitzer 1999; Lally 2009; Oettingen
 * & Gollwitzer 2010) over REST for headless parity with web, MCP and CLI.
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  AdherenceDaySchema,
  AUTOMATICITY_CURVE_DEFAULTS,
  evaluatePlanQuality,
  generateIIFSRSCards,
  getCanonicalPlanTemplates,
  IfThenPlanSchema,
  instantiateTemplate,
  LALLY_MEDIAN_DAYS,
  LALLY_RANGE_DAYS,
  listTemplateDomains,
  OBSTACLE_LIBRARY,
  projectAutomaticity,
} from '@learning-hub/core'
import { sendJson, readJson } from '../http'
import type { Route } from './shared'

const evaluateBodySchema = z.object({ plan: IfThenPlanSchema })

const projectBodySchema = z.object({
  adherence: z.array(AdherenceDaySchema).default([]),
  complexityFactor: z.number().min(0.25).max(3).default(1),
})

const instantiateBodySchema = z.object({
  templateId: z.string().min(1),
  goal: z.string().min(1),
})

const deckBodySchema = z.object({
  templateIds: z.array(z.string().min(1)).optional(),
})

/** GET /discipline/ii/templates — templates, obstacles, reference constants */
function getIiTemplates(_req: IncomingMessage, res: ServerResponse): void {
  sendJson(res, 200, {
    ok: true,
    templates: getCanonicalPlanTemplates(),
    obstacles: OBSTACLE_LIBRARY,
    domains: listTemplateDomains(),
    reference: {
      medianDays: LALLY_MEDIAN_DAYS,
      rangeDays: LALLY_RANGE_DAYS,
      curve: AUTOMATICITY_CURVE_DEFAULTS,
    },
  })
}

/** POST /discipline/ii/evaluate — rubric scores for one if-then plan */
async function postIiEvaluate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, evaluateBodySchema)
  sendJson(res, 200, { ok: true, quality: evaluatePlanQuality(body.plan) })
}

/** POST /discipline/ii/project — Lally-curve automaticity projection */
async function postIiProject(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, projectBodySchema)
  sendJson(res, 200, {
    ok: true,
    projection: projectAutomaticity(body.adherence, body.complexityFactor),
  })
}

/** POST /discipline/ii/instantiate — draft a plan from a template */
async function postIiInstantiate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, instantiateBodySchema)
  sendJson(res, 200, { ok: true, plan: instantiateTemplate(body.templateId, body.goal) })
}

/** POST /discipline/ii/deck — FSRS-6 bridge cards */
async function postIiDeck(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, deckBodySchema)
  const cards = generateIIFSRSCards(body.templateIds)
  sendJson(res, 200, { ok: true, count: cards.length, cards })
}

export const implementationIntentionRoutes: Route[] = [
  {
    method: 'GET',
    path: '/discipline/ii/templates',
    summary: 'list if-then plan templates, obstacle library and Lally constants',
    handler: getIiTemplates,
  },
  {
    method: 'POST',
    path: '/discipline/ii/evaluate',
    summary: 'score one if-then plan on the implementation-intention rubric',
    handler: postIiEvaluate,
  },
  {
    method: 'POST',
    path: '/discipline/ii/project',
    summary: 'project habit automaticity (Lally et al. 2009 curve)',
    handler: postIiProject,
  },
  {
    method: 'POST',
    path: '/discipline/ii/instantiate',
    summary: 'draft an if-then plan from a canonical template',
    handler: postIiInstantiate,
  },
  {
    method: 'POST',
    path: '/discipline/ii/deck',
    summary: 'generate FSRS-6 bridge cards (plan anatomy + obstacle drills)',
    handler: postIiDeck,
  },
]
