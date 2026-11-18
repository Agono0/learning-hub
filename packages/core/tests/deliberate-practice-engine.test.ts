/**
 * Unit Tests for Deliberate Practice & Progressive Error Recovery Engine
 *
 * Verifies K. Anders Ericsson's Deliberate Practice Theory (1993),
 * Kurt VanLehn's (1990) Impasse-Driven Learning & Schema Bug Repair,
 * and Nina Keith & Michael Frese's (2008) Error Management Training.
 */

import { describe, expect, it } from 'vitest'
import {
  analyzeErrorTaxonomy,
  calculateDeliberateEffortIndex,
  calculateZPDFrontier,
  DeliberatePracticeSession,
} from '../src/deliberate/deliberate-practice-engine'

describe('Deliberate Practice & Progressive Error Recovery Engine', () => {
  it('calculates dynamic ZPD frontier and enforces the 65-85% optimal sweet spot', () => {
    // 1. Optimal sweet spot: 4/5 correct (80%)
    const optimal = calculateZPDFrontier([true, true, true, false, true], 'intermediate')
    expect(optimal.rollingAccuracy).toBe(0.8)
    expect(optimal.isOptimalZPD).toBe(true)
    expect(optimal.recommendation).toBe('maintain_deliberate_sweet_spot')

    // 2. High automated accuracy (>85%): Triggers expansion
    const advanced = calculateZPDFrontier([true, true, true, true, true], 'intermediate')
    expect(advanced.rollingAccuracy).toBe(1.0)
    expect(advanced.isOptimalZPD).toBe(false)
    expect(advanced.recommendation).toBe('expand_difficulty')

    // 3. Struggling accuracy (<65%): Triggers micro-scaffolding
    const struggling = calculateZPDFrontier([false, true, false, false, true], 'intermediate')
    expect(struggling.rollingAccuracy).toBe(0.4)
    expect(struggling.isOptimalZPD).toBe(false)
    expect(struggling.recommendation).toBe('inject_micro_scaffold')
  })

  it('analyzes error taxonomy according to Kurt VanLehn bug classification', () => {
    const recordedErrors = [
      'misconception' as const,
      'misconception' as const,
      'procedural_lapse' as const,
      'boundary_oversight' as const,
    ]

    const taxonomy = analyzeErrorTaxonomy(recordedErrors)
    expect(taxonomy.totalErrors).toBe(4)
    expect(taxonomy.misconceptionCount).toBe(2)
    expect(taxonomy.proceduralLapseCount).toBe(1)
    expect(taxonomy.boundaryOversightCount).toBe(1)
    expect(taxonomy.attentionalSlipCount).toBe(0)
    expect(taxonomy.predominantBugClass).toBe('misconception')
    expect(taxonomy.meanBugSeverity).toBeGreaterThanOrEqual(3.0) // (4+4+3+2)/4 = 3.25
  })

  it('calculates Ericsson deliberate effort index and assigns mastery tiers', () => {
    // 1. Moderate effort
    const moderate = calculateDeliberateEffortIndex(10, 8, 4)
    expect(moderate.totalFocusedReps).toBe(10)
    expect(moderate.deficitTargetingRate).toBe(0.8)
    expect(moderate.deliberateEffortIndex).toBeGreaterThan(12)
    expect(moderate.deliberateMasteryGrade).toBe('Proficient')

    // 2. High effort frontier specialist
    const frontier = calculateDeliberateEffortIndex(20, 18, 12)
    expect(frontier.deliberateEffortIndex).toBeGreaterThan(25)
    expect(frontier.deliberateMasteryGrade).toBe('Frontier Specialist')

    // 3. Master craftsman
    const master = calculateDeliberateEffortIndex(30, 28, 20)
    expect(master.deliberateEffortIndex).toBeGreaterThanOrEqual(40)
    expect(master.deliberateMasteryGrade).toBe('Master Craftsman')
  })

  it('coordinates full deliberate practice session with VanLehn impasse repair and FSRS deck', () => {
    const session = new DeliberatePracticeSession('lock_free_concurrency')
    const suite = session.getSuite()
    expect(suite.drills.length).toBeGreaterThan(0)

    expect(session.getCurrentTier()).toBe('foundational')

    // Submit correct answer for drill 1
    const res1 = session.submitAnswer('drill_cas_retry_loop', 'opt_reread_head')
    expect(res1.isCorrect).toBe(true)

    // Submit procedural lapse answer for drill 1
    const res2 = session.submitAnswer('drill_cas_retry_loop', 'opt_cached_head')
    expect(res2.isCorrect).toBe(false)
    expect(res2.bugClass).toBe('procedural_lapse')

    // Submit misconception answer for drill 2 (should trigger impasse checkpoint)
    const res3 = session.submitAnswer('drill_aba_generation_tag', 'opt_pointer_hash')
    expect(res3.isCorrect).toBe(false)
    expect(res3.bugClass).toBe('misconception')
    expect(res3.triggeredImpasseId).toBe('impasse_aba_stack_pop')

    // Record repair of the impasse
    const repaired = session.recordImpasseRepair('impasse_aba_stack_pop')
    expect(repaired).toBe(true)

    const effort = session.getDeliberateEffort()
    expect(effort.totalFocusedReps).toBe(3)
    expect(effort.impasseRepairsCompleted).toBe(1)

    // Export FSRS cards
    const cards = session.exportFSRSCards(4.0)
    expect(cards.length).toBeGreaterThan(0)

    const card = cards[0]
    expect(card.emtReframingMnemonic).toContain('Errors are information')
    expect(card.recommendedStabilityMultiplier).toBeGreaterThan(0.6)
  })

  it('validates deep learning numerical stability and Log-Sum-Exp suite', () => {
    const session = new DeliberatePracticeSession('deep_learning_numerical_stability')
    const suite = session.getSuite()

    expect(suite.drills.length).toBe(3)
    expect(suite.impasseCheckpoints.length).toBe(1)

    // Correct answer for Log-Sum-Exp
    const res = session.submitAnswer('drill_log_sum_exp', 'opt_subtract_max')
    expect(res.isCorrect).toBe(true)
    expect(res.feedback).toContain('bounds the maximum exponent')

    // Error for LayerNorm division by zero
    const resErr = session.submitAnswer('drill_layernorm_epsilon', 'opt_underflow_loss')
    expect(resErr.isCorrect).toBe(false)
    expect(resErr.bugClass).toBe('misconception')
  })

  it('validates clinical diagnostic de-biasing suite (Croskerry 2002, Groopman 2007)', () => {
    const session = new DeliberatePracticeSession('clinical_diagnostic_debiasing')
    const suite = session.getSuite()

    expect(suite.drills.length).toBe(3)
    expect(suite.impasseCheckpoints.length).toBe(1)

    // Test Bayesian base rate neglect
    const resBayes = session.submitAnswer('drill_base_rate_neglect', 'opt_bayes_approx')
    expect(resBayes.isCorrect).toBe(true)
    expect(resBayes.feedback).toContain('Bayesian calibration')

    // Test anchoring bias procedural lapse
    const resAnchor = session.submitAnswer('drill_anchoring_triage', 'opt_antiemetic_first')
    expect(resAnchor.isCorrect).toBe(false)
    expect(resAnchor.bugClass).toBe('procedural_lapse')

    // Test premature closure boundary oversight triggering pulmonary embolism impasse
    const resClosure = session.submitAnswer('drill_base_rate_neglect', 'opt_ninety_five')
    expect(resClosure.isCorrect).toBe(false)
    expect(resClosure.bugClass).toBe('boundary_oversight')
    expect(resClosure.triggeredImpasseId).toBe('impasse_premature_closure_pe')

    // Verify impasse repair
    expect(session.recordImpasseRepair('impasse_premature_closure_pe')).toBe(true)
    const cards = session.exportFSRSCards()
    expect(cards.length).toBeGreaterThan(0)
  })
})
