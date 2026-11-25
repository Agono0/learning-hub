/**
 * Implementation Intentions & Habit Formation MCP Tools
 *
 * Exposes the if-then planning engine (Gollwitzer 1999; Lally 2009; Oettingen
 * & Gollwitzer 2010 MCII) to external AI agents:
 * 1. ii_list_templates — canonical plan templates + obstacle library
 * 2. ii_evaluate_plan — rubric scores for one if-then plan
 * 3. ii_project — Lally-curve automaticity projection from adherence
 * 4. ii_instantiate — draft a plan from a template
 * 5. ii_generate_deck — FSRS-6 bridge cards
 */

import { z } from 'zod'
import { json, tool, type RegisteredTool } from '../tool-kit'
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

export const implementationIntentionTools: RegisteredTool[] = [
  tool(
    'ii_list_templates',
    'Lists canonical implementation-intention plan templates across life domains, the MCII obstacle library, and the Lally et al. (2009) automaticity reference constants.',
    {},
    async () => {
      return json({
        templates: getCanonicalPlanTemplates(),
        obstacles: OBSTACLE_LIBRARY,
        domains: listTemplateDomains(),
        reference: {
          medianDays: LALLY_MEDIAN_DAYS,
          rangeDays: LALLY_RANGE_DAYS,
          curve: AUTOMATICITY_CURVE_DEFAULTS,
        },
      })
    },
  ),

  tool(
    'ii_evaluate_plan',
    'Scores one if-then plan on the implementation-intention rubric: trigger specificity, action operationality, cue reliability, and MCII obstacle coverage, with rationales (Gollwitzer & Sheeran 2006).',
    { plan: IfThenPlanSchema },
    async ({ plan }) => json({ quality: evaluatePlanQuality(plan) }),
  ),

  tool(
    'ii_project',
    'Projects habit automaticity from an adherence record on the Lally et al. (2009) asymptotic curve (median 66 days to 95%, range 18-254).',
    {
      adherence: z.array(AdherenceDaySchema).default([]),
      complexityFactor: z.number().min(0.25).max(3).default(1),
    },
    async ({ adherence, complexityFactor }) =>
      json({ projection: projectAutomaticity(adherence, complexityFactor) }),
  ),

  tool(
    'ii_instantiate',
    'Drafts an if-then plan from a canonical template for a learner-supplied goal; the learner fills the bracketed slots in their own words.',
    {
      templateId: z.string().min(1),
      goal: z.string().min(1),
    },
    async ({ templateId, goal }) => json({ plan: instantiateTemplate(templateId, goal) }),
  ),

  tool(
    'ii_generate_deck',
    'Generates FSRS-6 cards: one plan-anatomy card per template plus one MCII obstacle drill per library entry.',
    { templateIds: z.array(z.string()).optional() },
    async ({ templateIds }) => {
      const cards = generateIIFSRSCards(templateIds)
      return json({ count: cards.length, cards })
    },
  ),
]
