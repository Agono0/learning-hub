/**
 * @file apps/web/src/server/handlers/implementation-intentions/route.ts
 * @description Runtime-neutral API handler for the Implementation Intentions
 * & Habit Formation Studio.
 *
 * - GET  /api/implementation-intentions — plan templates, obstacle library,
 *          and Lally et al. (2009) reference constants.
 * - POST /api/implementation-intentions — actions:
 *     evaluate_plan   → rubric scores for one if-then plan.
 *     project         → automaticity projection from an adherence record.
 *     instantiate     → draft a plan from a template.
 *     generate_deck   → FSRS-6 bridge cards.
 *
 * Rule 2 (runtime-neutral) and Rule 5 (zod at boundaries) compliant.
 */

import { z } from 'zod'
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
} from '@learning-hub/core/implementation-intentions'
import { readJson, withRoute } from '@/lib/api'

const ActionSchema = z.object({
  action: z
    .enum(['evaluate_plan', 'project', 'instantiate', 'generate_deck'])
    .default('evaluate_plan'),
  plan: IfThenPlanSchema.optional(),
  templateId: z.string().min(1).optional(),
  goal: z.string().min(1).optional(),
  adherence: z.array(AdherenceDaySchema).optional(),
  complexityFactor: z.number().min(0.25).max(3).default(1),
  templateIds: z.array(z.string().min(1)).optional(),
})

/** GET /api/implementation-intentions — templates, obstacles, constants. */
export const GET = withRoute(async () => {
  return Response.json({
    templates: getCanonicalPlanTemplates(),
    obstacles: OBSTACLE_LIBRARY,
    domains: listTemplateDomains(),
    reference: {
      medianDays: LALLY_MEDIAN_DAYS,
      rangeDays: LALLY_RANGE_DAYS,
      curve: AUTOMATICITY_CURVE_DEFAULTS,
    },
  })
})

/** POST /api/implementation-intentions — run the requested studio action. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, ActionSchema)

  switch (body.action) {
    case 'evaluate_plan': {
      if (!body.plan) return Response.json({ error: 'plan is required' }, { status: 400 })
      return Response.json({ quality: evaluatePlanQuality(body.plan) })
    }
    case 'project': {
      return Response.json({
        projection: projectAutomaticity(body.adherence ?? [], body.complexityFactor),
      })
    }
    case 'instantiate': {
      if (!body.templateId || !body.goal) {
        return Response.json({ error: 'templateId and goal are required' }, { status: 400 })
      }
      return Response.json({ plan: instantiateTemplate(body.templateId, body.goal) })
    }
    case 'generate_deck':
    default: {
      const cards = generateIIFSRSCards(body.templateIds)
      return Response.json({ cards, count: cards.length })
    }
  }
})
