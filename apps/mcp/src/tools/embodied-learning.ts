/**
 * Embodied Learning & Gesture MCP Tools
 *
 * Exposes the embodied-cognition practice engine to external AI agents
 * (Claude Desktop, Cursor, Antigravity CLI, IDE sidecars):
 * 1. scenarios: canonical embodied practice scenarios
 * 2. gesture plans: Goldin-Meadow (2003) gesture coverage evaluation
 * 3. mismatch: gesture-speech mismatch analysis (Church & Goldin-Meadow 1986)
 * 4. ladders: concreteness-fading validation (Bruner 1966; Fyfe et al. 2014)
 * 5. enactment: self-performed-task session scoring (Engelkamp & Zimmer 1984)
 */

import { z } from 'zod'
import { json, tool, type RegisteredTool } from '../tool-kit'
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

export const embodiedLearningTools: RegisteredTool[] = [
  tool(
    'embodied_list_scenarios',
    'Lists the canonical Embodied Learning & Gesture scenarios (fraction division, derivatives, Bayes base rates, sorting, memory palaces, projectile motion).',
    {},
    async () => {
      const scenarios = listEmbodiedScenarios()
      return json({
        count: scenarios.length,
        phases: STUDIO_PHASE_ORDER,
        scenarios: scenarios.map((s) => ({
          id: s.id,
          title: s.title,
          domain: s.domain,
          concept: s.concept,
          whyEmbodied: s.whyEmbodied,
        })),
      })
    },
  ),
  tool(
    'embodied_get_scenario',
    'Returns one full embodied scenario: gesture plan, concreteness-fading ladder, tracing exercise, enactment task, reflection prompts and citations.',
    {
      id: z.string().describe('Scenario id from embodied_list_scenarios.'),
    },
    async ({ id }) => {
      const scenario = getEmbodiedScenario(id)
      if (!scenario) return json({ error: `unknown scenario: ${id}` })
      return json({ scenario })
    },
  ),
  tool(
    'embodied_evaluate_gesture_plan',
    'Evaluates a learner-authored gesture plan against research criteria: element coverage, channel diversity and verbal anchoring (Goldin-Meadow 2003; Cook, Mitchell & Goldin-Meadow 2008).',
    {
      plan: z.array(GestureSpecSchema).min(1).describe('The gesture specs to evaluate.'),
      coreElements: z
        .array(z.string().min(1))
        .min(1)
        .describe('Core elements of the concept that gestures should carry.'),
    },
    async ({ plan, coreElements }) => {
      return json(evaluateGesturePlan(plan, coreElements))
    },
  ),
  tool(
    'embodied_analyze_mismatch',
    'Scores explanation samples for gesture-speech mismatch, a marker of transitional knowledge and readiness to learn (Church & Goldin-Meadow 1986; Perry, Church & Goldin-Meadow 1988).',
    {
      samples: z
        .array(ExplanationSampleSchema)
        .describe('Pairs of what the learner said and what their gesture showed.'),
    },
    async ({ samples }) => {
      return json(analyzeMismatch(samples))
    },
  ),
  tool(
    'embodied_validate_ladder',
    'Validates a concreteness-fading ladder: enactive to iconic to symbolic order, bridging prompts between rungs (Bruner 1966; Fyfe, McNeil, Son & Goldstone 2014).',
    {
      ladder: FadingLadderSchema.describe('The fading ladder to validate.'),
    },
    async ({ ladder }) => {
      return json(validateFadingLadder(ladder))
    },
  ),
  tool(
    'embodied_score_enactment',
    'Scores an enactment practice session: recall rates for self-performed versus verbally studied tasks and the enactment advantage (Engelkamp & Zimmer 1984; Cohen 1981).',
    {
      session: EnactmentSessionSchema.describe('The session outcome to score.'),
    },
    async ({ session }) => {
      return json(scoreEnactmentSession(session))
    },
  ),
]
