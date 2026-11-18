/**
 * @file zpd-engine.test.ts
 * @description Unit tests for Dynamic Assessment & Zone of Proximal Development Engine
 */

import { describe, expect, it } from 'vitest'
import {
  calculateZpdMetrics,
  CANONICAL_ZPD_SCENARIOS,
  DynamicAssessmentScenarioSchema,
  evaluateProblemChoice,
  generateFSRSZpdDeck,
  getGraduatedPromptAtTier,
  getZpdScenarioById,
  listZpdScenarios,
  PromptTierEnum,
  TransferDistanceEnum,
  type PromptAttemptEvent,
} from '../src/dynamic-assessment'

describe('Dynamic Assessment & ZPD Engine', () => {
  describe('Canonical Scenarios Validation', () => {
    it('validates all canonical scenarios against DynamicAssessmentScenarioSchema', () => {
      const scenarios = listZpdScenarios()
      expect(scenarios.length).toBeGreaterThanOrEqual(4)

      for (const scenario of scenarios) {
        const parsed = DynamicAssessmentScenarioSchema.safeParse(scenario)
        expect(parsed.success).toBe(true)
        if (!parsed.success) {
          console.error(parsed.error)
        }

        // Validate 5 graduated prompts per problem
        expect(scenario.preTestProblem.prompts).toHaveLength(5)
        expect(scenario.mediatedProblem.prompts).toHaveLength(5)
        expect(scenario.postTestProblem.prompts).toHaveLength(5)

        // Verify tier order 1 through 5
        for (let i = 0; i < 5; i++) {
          expect(scenario.preTestProblem.prompts[i].tierLevel).toBe(i + 1)
          expect(scenario.mediatedProblem.prompts[i].tierLevel).toBe(i + 1)
          expect(scenario.postTestProblem.prompts[i].tierLevel).toBe(i + 1)
        }

        // Verify options and correct indices
        expect(scenario.preTestProblem.options.length).toBeGreaterThanOrEqual(2)
        expect(scenario.preTestProblem.correctOptionIndex).toBeGreaterThanOrEqual(0)
        expect(scenario.preTestProblem.correctOptionIndex).toBeLessThan(
          scenario.preTestProblem.options.length,
        )

        // Verify transfer probes contain near, medium, and far distances
        const distances = scenario.transferProbes.map((p) => p.distance)
        expect(distances).toContain('near')
        expect(distances).toContain('medium')
        expect(distances).toContain('far')
      }
    })

    it('retrieves scenarios by ID or returns undefined for non-existent IDs', () => {
      const dpScenario = getZpdScenarioById('algo_dynamic_programming')
      expect(dpScenario).toBeDefined()
      expect(dpScenario?.domain).toContain('Computer Science')

      const invalid = getZpdScenarioById('non_existent_scenario_xyz')
      expect(invalid).toBeUndefined()
    })
  })

  describe('ZPD & Learning Potential Metrics Calculations', () => {
    it('calculates metrics for high achievers (ADL >= 75)', () => {
      const metrics = calculateZpdMetrics(85, 95, 1, [90, 85, 80])
      expect(metrics.actualDevelopmentalLevel).toBe(85)
      expect(metrics.potentialDevelopmentalLevel).toBe(95)
      expect(metrics.zpdBandwidth).toBe(10)
      expect(metrics.learningPotentialScore).toBeCloseTo((95 - 85) / (100 - 85), 2)
      expect(metrics.typology).toBe('high_achiever')
      expect(metrics.promptEfficiencyScore).toBe(0.8) // 1 prompt consumed -> 1 - 1/5 = 0.8
      expect(metrics.promptsConsumedCount).toBe(1)
    })

    it('calculates metrics for high potential gainers (ADL < 75, LPS >= 0.45)', () => {
      // Pre: 20, Post: 70 -> LPS = (70 - 20) / (100 - 20) = 50 / 80 = 0.625
      const metrics = calculateZpdMetrics(20, 70, 2, [75, 70, 65])
      expect(metrics.actualDevelopmentalLevel).toBe(20)
      expect(metrics.potentialDevelopmentalLevel).toBe(70)
      expect(metrics.zpdBandwidth).toBe(50)
      expect(metrics.learningPotentialScore).toBe(0.625)
      expect(metrics.typology).toBe('high_potential_gainer')
      expect(metrics.promptEfficiencyScore).toBe(0.6) // 2 prompts consumed -> 1 - 2/5 = 0.6
      expect(metrics.cognitiveModifiabilityIndex).toBeGreaterThan(0)
    })

    it('calculates metrics for moderate gainers (ADL < 75, 0.18 <= LPS < 0.45)', () => {
      // Pre: 30, Post: 50 -> LPS = 20 / 70 = 0.2857
      const metrics = calculateZpdMetrics(30, 50, 3, [60, 50, 40])
      expect(metrics.actualDevelopmentalLevel).toBe(30)
      expect(metrics.potentialDevelopmentalLevel).toBe(50)
      expect(metrics.zpdBandwidth).toBe(20)
      expect(metrics.learningPotentialScore).toBeCloseTo(0.286, 2)
      expect(metrics.typology).toBe('moderate_gainer')
      expect(metrics.promptEfficiencyScore).toBe(0.4) // 3 prompts -> 1 - 3/5 = 0.4
    })

    it('calculates metrics for emerging learners (ADL < 75, LPS < 0.18)', () => {
      // Pre: 20, Post: 25 -> LPS = 5 / 80 = 0.0625
      const metrics = calculateZpdMetrics(20, 25, 5, [20, 20, 10])
      expect(metrics.actualDevelopmentalLevel).toBe(20)
      expect(metrics.potentialDevelopmentalLevel).toBe(25)
      expect(metrics.zpdBandwidth).toBe(5)
      expect(metrics.learningPotentialScore).toBeCloseTo(0.063, 2)
      expect(metrics.typology).toBe('emerging_learner')
      expect(metrics.promptEfficiencyScore).toBe(0.0) // 5 prompts -> 1 - 5/5 = 0.0
    })

    it('handles boundary conditions: ADL = 100, zero gains, negative deltas', () => {
      // Perfect initial score
      const ceilingMetrics = calculateZpdMetrics(100, 100, 0, [100, 100, 100])
      expect(ceilingMetrics.learningPotentialScore).toBe(1.0)
      expect(ceilingMetrics.zpdBandwidth).toBe(0)
      expect(ceilingMetrics.promptEfficiencyScore).toBe(1.0)

      // Post test lower than pre test is clamped to ADL
      const clampedMetrics = calculateZpdMetrics(50, 30, 4)
      expect(clampedMetrics.potentialDevelopmentalLevel).toBe(50)
      expect(clampedMetrics.zpdBandwidth).toBe(0)
      expect(clampedMetrics.learningPotentialScore).toBe(0)

      // Prompts consumed out of bounds are clamped to [0, 5]
      const highPrompts = calculateZpdMetrics(40, 60, 10)
      expect(highPrompts.promptsConsumedCount).toBe(5)
      expect(highPrompts.promptEfficiencyScore).toBe(0)

      const negativePrompts = calculateZpdMetrics(40, 60, -3)
      expect(negativePrompts.promptsConsumedCount).toBe(0)
      expect(negativePrompts.promptEfficiencyScore).toBe(1.0)
    })

    it('computes scaffolding decay rate from prompt attempt timestamp events', () => {
      const history: PromptAttemptEvent[] = [
        { tierLevel: 1, timestamp: 1000, timeSpentMs: 5000 },
        { tierLevel: 2, timestamp: 6000, timeSpentMs: 2500 },
        { tierLevel: 3, timestamp: 8500, timeSpentMs: 1250 },
      ]
      const metrics = calculateZpdMetrics(30, 65, 3, [70, 60], history)
      expect(metrics.scaffoldingDecayRate).toBeGreaterThan(0)
    })
  })

  describe('Problem Choice & Graduated Prompts', () => {
    it('evaluates problem choices accurately', () => {
      const scenario = CANONICAL_ZPD_SCENARIOS[0]
      const correctEval = evaluateProblemChoice(
        scenario.preTestProblem,
        scenario.preTestProblem.correctOptionIndex,
      )
      expect(correctEval.isCorrect).toBe(true)
      expect(correctEval.feedback).toContain('Correct')

      const incorrectOption = (scenario.preTestProblem.correctOptionIndex + 1) % 4
      const incorrectEval = evaluateProblemChoice(scenario.preTestProblem, incorrectOption)
      expect(incorrectEval.isCorrect).toBe(false)
      expect(incorrectEval.feedback).toContain('Not quite')
    })

    it('retrieves graduated prompts at designated tiers with clamping', () => {
      const scenario = CANONICAL_ZPD_SCENARIOS[0]
      const promptTier1 = getGraduatedPromptAtTier(scenario.preTestProblem, 1)
      expect(promptTier1).toBeDefined()
      expect(promptTier1?.tier).toBe('tier_1_metacognitive_orientation')

      const promptTier5 = getGraduatedPromptAtTier(scenario.preTestProblem, 5)
      expect(promptTier5).toBeDefined()
      expect(promptTier5?.tier).toBe('tier_5_worked_demonstration')

      // Out-of-bounds clamps to tier 1 or tier 5
      const clampedLow = getGraduatedPromptAtTier(scenario.preTestProblem, -1)
      expect(clampedLow?.tierLevel).toBe(1)

      const clampedHigh = getGraduatedPromptAtTier(scenario.preTestProblem, 99)
      expect(clampedHigh?.tierLevel).toBe(5)
    })
  })

  describe('FSRS-6 Dynamic Flashcard Generation', () => {
    it('generates calibrated flashcards scaling initial stability based on LPS and TAS', () => {
      const scenario = CANONICAL_ZPD_SCENARIOS[0]
      const highGainerMetrics = calculateZpdMetrics(25, 80, 2, [90, 85, 80])
      const lowGainerMetrics = calculateZpdMetrics(25, 30, 5, [30, 20, 10])

      const highCards = generateFSRSZpdDeck(scenario, highGainerMetrics)
      const lowCards = generateFSRSZpdDeck(scenario, lowGainerMetrics)

      expect(highCards.length).toBeGreaterThanOrEqual(6)
      expect(lowCards.length).toBe(highCards.length)

      // High gainer should have longer recommended stability than low gainer
      expect(highCards[0].recommendedStabilityDays).toBeGreaterThan(
        lowCards[0].recommendedStabilityDays,
      )

      for (const card of highCards) {
        expect(card.front).toBeDefined()
        expect(card.back).toBeDefined()
        expect(card.recommendedStabilityDays).toBeGreaterThan(0)
        expect(card.tags).toContain('zpd')
      }
    })
  })

  describe('Zod Schema Enum Integrity', () => {
    it('verifies all PromptTierEnum values', () => {
      const expectedTiers = [
        'tier_1_metacognitive_orientation',
        'tier_2_structural_invariant',
        'tier_3_strategic_heuristic',
        'tier_4_concrete_subgoal',
        'tier_5_worked_demonstration',
      ]
      for (const tier of expectedTiers) {
        expect(PromptTierEnum.safeParse(tier).success).toBe(true)
      }
    })

    it('verifies all TransferDistanceEnum values', () => {
      for (const distance of ['near', 'medium', 'far']) {
        expect(TransferDistanceEnum.safeParse(distance).success).toBe(true)
      }
    })
  })
})
