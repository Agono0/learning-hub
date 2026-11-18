import { describe, expect, it } from 'vitest'
import * as core from '../src/index'

/**
 * TD-02 structural contract: every /cognitive/* route's input schema is
 * exported from @learning-hub/core so server, MCP and CLI share a single
 * source of truth (docs/tech-debt.md TD-02).
 *
 * This test pins the exported schema names per domain — if a schema is
 * removed from core, the hosts lose their shared contract and this test
 * fails with an actionable message.
 */
describe('TD-02 contract schemas exported from core', () => {
  const requiredSchemas: [string, string][] = [
    // system-dynamics
    ['systemDynamicsSimulateInputSchema', 'system-dynamics'],
    ['systemDynamicsEvaluateInputSchema', 'system-dynamics'],
    ['systemDynamicsDeckInputSchema', 'system-dynamics'],
    // difficulty-audit
    ['difficultyAuditInputSchema', 'difficulty-audit'],
    // analogy
    ['structureMappingAttemptSchema', 'analogy'],
    ['analogyEvaluateInputSchema', 'analogy'],
    // flexibility
    ['crissCrossStepAttemptSchema', 'flexibility'],
    ['flexibilityEvaluateInputSchema', 'flexibility'],
    // interactivity
    ['interactivityAnalysisInputSchema', 'interactivity'],
    // equilibrium
    ['equilibriumSessionStateSchema', 'equilibrium'],
    ['equilibriumEvaluateInputSchema', 'equilibrium'],
    // causal
    ['counterfactualQueryInputSchema', 'causal'],
    // skills
    ['skillsAuditInputSchema', 'skills'],
    ['skillsRunInputSchema', 'skills'],
    ['skillsCatalogQuerySchema', 'skills'],
    // epistemic
    ['epistemicAnalyzeInputSchema', 'epistemic'],
    // srl
    ['srlEvaluateInputSchema', 'srl'],
    // threshold
    ['liminalEvaluateInputSchema', 'threshold'],
    // successive-relearning
    ['relearningSavingsInputSchema', 'successive-relearning'],
    // cer
    ['cerCounterInputSchema', 'argumentation'],
    ['cerDeckInputSchema', 'argumentation'],
    // anchored
    ['anchoredSensitivityInputSchema', 'anchored'],
    ['anchoredDeckInputSchema', 'anchored'],
    // contrasting
    ['contrastingDeckInputSchema', 'contrasting'],
    // collaborative
    ['collaborativePartnerInputSchema', 'collaborative'],
    ['collaborativeDeckInputSchema', 'collaborative'],
    // generation
    ['generationChallengeInputSchema', 'generation'],
    // invariance
    ['invarianceAttemptSchema', 'interleaving'],
    ['invariancePlanQuerySchema', 'interleaving'],
    // pre-existing (PR #81 + earlier)
    ['generationTrialInputSchema', 'generation'],
    ['PaasMentalEffortInputSchema', 'interactivity'],
    ['judgmentOfLearningSchema', 'metacognition'],
    ['selfReportedBehaviorSchema', 'difficulty-audit'],
    ['sleepProfileSchema', 'tmr'],
  ]

  it.each(requiredSchemas)('%s is exported from core (%s)', (name, domain) => {
    expect(
      core,
      `${name} must be exported from @learning-hub/core (used by server routes.ts, MCP tools, and CLI for the ${domain} domain)`,
    ).toHaveProperty(name)
  })

  it('exports at least 30 cognitive route input schemas', () => {
    const exported = requiredSchemas.filter(
      ([name]) => typeof (core as Record<string, unknown>)[name] !== 'undefined',
    )
    expect(exported.length).toBeGreaterThanOrEqual(30)
  })
})
