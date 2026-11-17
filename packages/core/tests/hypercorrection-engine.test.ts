import { describe, expect, it } from 'vitest'
import {
  calculateGoodmanKruskalGamma,
  calculateMurphyBrierDecomposition,
  evaluateMetacognitiveCalibrationProfile,
  exportHypercorrectionToFSRSCards,
  HypercorrectionSession,
  TrialMetacognitiveRecord,
} from '../src/metacognition'

describe('Dynamic Metacognitive Calibration & Hypercorrection Engine', () => {
  describe('Goodman-Kruskal Gamma (γ) Metacognitive Resolution', () => {
    it('calculates perfect gamma = +1 when high confidence strictly predicts correctness', () => {
      const concordantTrials: TrialMetacognitiveRecord[] = [
        {
          itemId: 'item1',
          selectedOptionId: 'opt1',
          isCorrect: true,
          prospectiveJOL: 0.8,
          retrospectiveConfidence: 0.9,
          responseLatencyMs: 1500,
          epistemicSurpriseScore: 0,
          isHypercorrectionCandidate: false,
        },
        {
          itemId: 'item2',
          selectedOptionId: 'opt2',
          isCorrect: false,
          prospectiveJOL: 0.3,
          retrospectiveConfidence: 0.2,
          responseLatencyMs: 3500,
          epistemicSurpriseScore: 0.2,
          isHypercorrectionCandidate: false,
        },
      ]

      const gamma = calculateGoodmanKruskalGamma(concordantTrials)
      expect(gamma).toBe(1.0)
    })

    it('calculates negative gamma when higher confidence predicts error (illusory confidence)', () => {
      const discordantTrials: TrialMetacognitiveRecord[] = [
        {
          itemId: 'item1',
          selectedOptionId: 'opt1',
          isCorrect: false,
          prospectiveJOL: 0.9,
          retrospectiveConfidence: 0.95,
          responseLatencyMs: 1200,
          epistemicSurpriseScore: 0.95,
          isHypercorrectionCandidate: true,
        },
        {
          itemId: 'item2',
          selectedOptionId: 'opt2',
          isCorrect: true,
          prospectiveJOL: 0.2,
          retrospectiveConfidence: 0.1,
          responseLatencyMs: 4000,
          epistemicSurpriseScore: 0,
          isHypercorrectionCandidate: false,
        },
      ]

      const gamma = calculateGoodmanKruskalGamma(discordantTrials)
      expect(gamma).toBe(-1.0)
    })

    it('returns 0 when there are insufficient trials or all ties', () => {
      expect(calculateGoodmanKruskalGamma([])).toBe(0)
      expect(
        calculateGoodmanKruskalGamma([
          {
            itemId: 'item1',
            selectedOptionId: 'opt1',
            isCorrect: true,
            prospectiveJOL: 0.5,
            retrospectiveConfidence: 0.5,
            responseLatencyMs: 2000,
            epistemicSurpriseScore: 0,
            isHypercorrectionCandidate: false,
          },
        ]),
      ).toBe(0)
    })
  })

  describe('Murphy (1973) Brier Score Partitioning', () => {
    it('decomposes Brier score into reliability, resolution, and uncertainty', () => {
      const trials: TrialMetacognitiveRecord[] = [
        {
          itemId: 't1',
          selectedOptionId: 'o1',
          isCorrect: true,
          prospectiveJOL: 0.8,
          retrospectiveConfidence: 0.9,
          responseLatencyMs: 2000,
          epistemicSurpriseScore: 0,
          isHypercorrectionCandidate: false,
        },
        {
          itemId: 't2',
          selectedOptionId: 'o2',
          isCorrect: true,
          prospectiveJOL: 0.8,
          retrospectiveConfidence: 0.85,
          responseLatencyMs: 2000,
          epistemicSurpriseScore: 0,
          isHypercorrectionCandidate: false,
        },
        {
          itemId: 't3',
          selectedOptionId: 'o3',
          isCorrect: false,
          prospectiveJOL: 0.3,
          retrospectiveConfidence: 0.2,
          responseLatencyMs: 3000,
          epistemicSurpriseScore: 0.2,
          isHypercorrectionCandidate: false,
        },
        {
          itemId: 't4',
          selectedOptionId: 'o4',
          isCorrect: false,
          prospectiveJOL: 0.2,
          retrospectiveConfidence: 0.1,
          responseLatencyMs: 3000,
          epistemicSurpriseScore: 0.1,
          isHypercorrectionCandidate: false,
        },
      ]

      const { decomposition, bins } = calculateMurphyBrierDecomposition(trials)
      expect(decomposition.overallBrier).toBeLessThan(0.1) // Highly accurate calibration
      expect(decomposition.uncertainty).toBe(0.25) // 50% base rate: 0.5 * 0.5 = 0.25
      expect(bins).toHaveLength(5)
    })
  })

  describe('Full Calibration Profile Evaluator', () => {
    it('identifies severe fluency illusion with high overconfidence bias', () => {
      const overconfidentTrials: TrialMetacognitiveRecord[] = [
        {
          itemId: 'crucible_thermal_equilibrium',
          selectedOptionId: 'opt_metal_temp',
          isCorrect: false,
          prospectiveJOL: 0.9,
          retrospectiveConfidence: 0.95,
          responseLatencyMs: 1200,
          epistemicSurpriseScore: 0.95,
          isHypercorrectionCandidate: true,
          detectedIllusion: 'intuitive_physics_bias',
        },
        {
          itemId: 'crucible_conjunction_fallacy',
          selectedOptionId: 'opt_linda_both',
          isCorrect: false,
          prospectiveJOL: 0.85,
          retrospectiveConfidence: 0.9,
          responseLatencyMs: 1400,
          epistemicSurpriseScore: 0.9,
          isHypercorrectionCandidate: true,
          detectedIllusion: 'conjunction_fallacy',
        },
        {
          itemId: 'crucible_monty_hall',
          selectedOptionId: 'opt_monty_equal',
          isCorrect: false,
          prospectiveJOL: 0.8,
          retrospectiveConfidence: 0.85,
          responseLatencyMs: 1100,
          epistemicSurpriseScore: 0.85,
          isHypercorrectionCandidate: true,
          detectedIllusion: 'gambler_fallacy',
        },
      ]

      const profile = evaluateMetacognitiveCalibrationProfile(overconfidentTrials)
      expect(profile.sampleSize).toBe(3)
      expect(profile.overallAccuracy).toBe(0)
      expect(profile.meanConfidence).toBeGreaterThan(0.85)
      expect(profile.absoluteOverconfidenceBias).toBeGreaterThan(0.8)
      expect(profile.status).toBe('severe_fluency_illusion')
      expect(profile.hypercorrectionCount).toBe(3)
      expect(profile.hypercorrectionOpportunityRate).toBe(1.0)
      expect(profile.recommendations.some((r) => r.includes('Hypercorrection Effect'))).toBe(true)
    })

    it('identifies underconfidence impostor status when accuracy exceeds confidence', () => {
      const underconfidentTrials: TrialMetacognitiveRecord[] = [
        {
          itemId: 'crucible_thermal_equilibrium',
          selectedOptionId: 'opt_thermal_cond',
          isCorrect: true,
          prospectiveJOL: 0.2,
          retrospectiveConfidence: 0.3,
          responseLatencyMs: 2500,
          epistemicSurpriseScore: 0,
          isHypercorrectionCandidate: false,
        },
        {
          itemId: 'crucible_monty_hall',
          selectedOptionId: 'opt_monty_switch',
          isCorrect: true,
          prospectiveJOL: 0.3,
          retrospectiveConfidence: 0.35,
          responseLatencyMs: 2500,
          epistemicSurpriseScore: 0,
          isHypercorrectionCandidate: false,
        },
      ]

      const profile = evaluateMetacognitiveCalibrationProfile(underconfidentTrials)
      expect(profile.status).toBe('underconfident_impostor')
      expect(profile.absoluteOverconfidenceBias).toBeLessThan(-0.5)
    })
  })

  describe('HypercorrectionSession State Machine', () => {
    it('progresses through prospective JOL, answer selection, confidence, and feedback', () => {
      const session = new HypercorrectionSession()
      expect(session.getState().phase).toBe('prospective_jol')
      expect(session.getCurrentProblem()?.id).toBe('crucible_thermal_equilibrium')

      // 1. Prospective JOL
      session.submitProspectiveJOL(0.85)
      expect(session.getState().phase).toBe('option_selection')
      expect(session.getState().prospectiveJOL).toBe(0.85)

      // 2. Select option (High-confidence intuitive error)
      session.selectOption('opt_metal_temp')
      expect(session.getState().phase).toBe('confidence_rating')

      // 3. Submit high retrospective confidence -> triggers hypercorrection
      const result = session.submitRetrospectiveConfidence(0.9, 1500)
      expect(result.isHypercorrection).toBe(true)
      expect(result.epistemicSurpriseScore).toBe(0.9)
      expect(session.getState().phase).toBe('feedback_deconstruction')
      expect(session.getState().trials).toHaveLength(1)
      expect(session.getState().profile.hypercorrectionCount).toBe(1)

      // 4. Advance to next problem
      const hasNext = session.advanceToNextProblem()
      expect(hasNext).toBe(true)
      expect(session.getState().phase).toBe('prospective_jol')
      expect(session.getState().currentProblemIndex).toBe(1)
      expect(session.getCurrentProblem()?.id).toBe('crucible_conjunction_fallacy')
    })
  })

  describe('FSRS Hypercorrection Card Generator Bridge', () => {
    it('creates high initial stability cards for high-confidence errors', () => {
      const session = new HypercorrectionSession()
      session.submitProspectiveJOL(0.9)
      session.selectOption('opt_metal_temp')
      session.submitRetrospectiveConfidence(0.95, 1200)

      const cards = exportHypercorrectionToFSRSCards(session.getState().trials)
      expect(cards).toHaveLength(1)
      const card = cards[0]!
      expect(card.tags).toContain('hypercorrection')
      expect(card.tags).toContain('intuitive_physics_bias')
      expect(card.suggestedInitialStability).toBeGreaterThanOrEqual(3.5)
      expect(card.metadata.isHypercorrected).toBe(true)
      expect(card.front).toContain('[Epistemic Crucible — Misconception Repair]')
      expect(card.back).toContain('Zeroth Law of Thermodynamics')
    })
  })
})
