/**
 * Unit Tests for Epistemic Curiosity & Information Gap Engine
 *
 * Grounded in:
 * - George Loewenstein (1994) Information Gap Theory
 * - Daniel Berlyne (1960) Epistemic Collative Variables
 * - Min Jeong Kang et al. (2009, Neuron) Curiosity Dopamine Reward Circuits
 */

import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_CURIOSITY_MYSTERIES,
  calculateEpistemicDeprivationGradient,
  calculateIncidentalPrimingScore,
  calculateLoewensteinEpistemicTension,
  calculateMemoryFacilitationMultiplier,
  evaluateEpistemicDriveStatus,
  InformationGapSession,
} from '../src/curiosity/information-gap-engine'

describe('Epistemic Curiosity & Information Gap Engine', () => {
  it('calculates Loewenstein inverted-U epistemic tension as a function of knowledge and collative weight', () => {
    // Low perceived knowledge (0.1): low tension (unaware of the gap)
    const low = calculateLoewensteinEpistemicTension(0.1, 'incongruity')
    expect(low).toBeLessThan(0.6)

    // Intermediate perceived knowledge (0.5): peak epistemic tension
    const peak = calculateLoewensteinEpistemicTension(0.5, 'incongruity')
    expect(peak).toBeGreaterThan(0.9)

    // Near-complete knowledge (0.95): tension wanes toward satiation
    const nearTotal = calculateLoewensteinEpistemicTension(0.95, 'incongruity')
    expect(nearTotal).toBeLessThan(0.5)
  })

  it('calculates Kang et al. (2009) memory facilitation multiplier', () => {
    // Moderate tension with 0 clues revealed
    const mult1 = calculateMemoryFacilitationMultiplier(0.8, 0, 3)
    expect(mult1).toBeGreaterThanOrEqual(1.5)
    expect(mult1).toBeLessThanOrEqual(1.85)

    // Low tension with all clues revealed
    const mult2 = calculateMemoryFacilitationMultiplier(0.2, 3, 3)
    expect(mult2).toBeGreaterThanOrEqual(1.0)
    expect(mult2).toBeLessThan(mult1)
  })

  it('evaluates epistemic drive status across tension thresholds', () => {
    expect(evaluateEpistemicDriveStatus(0.2, false)).toBe('dormant')
    expect(evaluateEpistemicDriveStatus(0.55, false)).toBe('aroused')
    expect(evaluateEpistemicDriveStatus(0.85, false)).toBe('peak_tension')
    expect(evaluateEpistemicDriveStatus(0.85, true)).toBe('satiated')
  })

  it('calculates Gruber et al. (2014) incidental memory priming score with temporal decay', () => {
    // Peak tension immediate window
    const immediate = calculateIncidentalPrimingScore(1.0, 0)
    expect(immediate).toBeCloseTo(1.45, 2)

    // Decayed window after 120s (half-life)
    const decayed = calculateIncidentalPrimingScore(1.0, 120)
    expect(decayed).toBeLessThan(immediate)
    expect(decayed).toBeGreaterThan(1.0)

    // Low tension minimal priming
    const low = calculateIncidentalPrimingScore(0.1, 0)
    expect(low).toBeLessThan(1.1)
  })

  it('calculates Loewenstein (1994) epistemic deprivation gradient', () => {
    // High clue salience with open gap (k=0.3): steep deprivation gradient
    const steep = calculateEpistemicDeprivationGradient(0.3, 0.9)
    expect(steep).toBeGreaterThan(0.5)

    // Satiated knowledge (k=0.95): gradient flattens
    const flat = calculateEpistemicDeprivationGradient(0.95, 0.9)
    expect(flat).toBeLessThan(0.15)
  })

  it('coordinates full Quantum Delayed-Choice Eraser information gap session', () => {
    const session = new InformationGapSession('quantum_delayed_choice_eraser')
    const mystery = session.getMystery()

    expect(mystery.clues.length).toBe(3)
    expect(mystery.resolverOptions.length).toBe(3)

    // Initial metrics before clues
    const initialMetrics = session.getMetrics()
    expect(initialMetrics.cluesRevealedCount).toBe(0)
    expect(initialMetrics.isResolved).toBe(false)

    // Reveal Clue 1
    const res1 = session.revealClue('clue_entangled_downconversion')
    expect(res1.clue.title).toContain('Down-Conversion')
    expect(res1.newPerceivedKnowledge).toBeGreaterThan(initialMetrics.priorKnowledgeLevel)

    // Reveal Clue 2 & 3
    session.revealClue('clue_delayed_erasure_mechanism')
    const res3 = session.revealClue('clue_coincidence_counter_subensembles')
    expect(res3.memoryFacilitationMultiplier).toBeGreaterThan(1.2)

    // Submit accurate resolution
    const resolution = session.resolveMystery('opt_coincidence_phase_correlation')
    expect(resolution.isAccurate).toBe(true)
    expect(resolution.score).toBe(1.0)
    expect(resolution.feedback).toContain('Flawless quantum closure')

    // Verify satiated state
    const postMetrics = session.getMetrics()
    expect(postMetrics.isResolved).toBe(true)
    expect(postMetrics.epistemicDriveStatus).toBe('satiated')

    // Export FSRS cards
    const cards = session.exportFSRSCards()
    expect(cards.length).toBe(1)
    expect(cards[0].recommendedStabilityMultiplier).toBeGreaterThan(1.0)
    expect(cards[0].kangDopamineRetentionNote).toContain('Kang et al.')
  })

  it('validates Gaussian Copula AAA synthetic CDO mystery suite', () => {
    const session = new InformationGapSession('synthetic_cdo_gaussian_copula')
    const mystery = session.getMystery()

    expect(mystery.collativeVariable).toBe('surprise')

    // Reveal clues
    session.revealClue('clue_tranche_subordination')
    session.revealClue('clue_gaussian_copula_correlation')
    session.revealClue('clue_correlation_jump_to_one')

    // Test inaccurate resolution
    const resErr = session.resolveMystery('opt_printing_money')
    expect(resErr.isAccurate).toBe(false)
    expect(resErr.score).toBe(0.1)

    // Test accurate resolution
    const resAcc = session.resolveMystery('opt_tail_dependence_collapse')
    expect(resAcc.isAccurate).toBe(true)
    expect(resAcc.feedback).toContain('Diversification is an illusion')
  })

  it('validates Antagonistic Pleiotropy evolutionary senescence mystery suite', () => {
    const session = new InformationGapSession('antagonistic_pleiotropy_senescence')
    const mystery = session.getMystery()

    expect(mystery.collativeVariable).toBe('complexity')

    const res = session.resolveMystery('opt_antagonistic_tradeoff')
    expect(res.isAccurate).toBe(true)
    expect(res.score).toBe(1.0)
  })

  it('validates Fermi Paradox & Great Filter astrobiology mystery suite', () => {
    const session = new InformationGapSession('fermi_paradox_great_filter')
    const mystery = session.getMystery()

    expect(mystery.collativeVariable).toBe('ambiguity')
    expect(mystery.clues.length).toBe(3)

    session.revealClue('clue_fermi_timescales')
    session.revealClue('clue_evolutionary_transition_bottlenecks')
    session.revealClue('clue_bostrom_grim_mars_theorem')

    const res = session.resolveMystery('opt_filter_probability_shift')
    expect(res.isAccurate).toBe(true)
    expect(res.score).toBe(1.0)
    expect(res.feedback).toContain('Great Filter invariant')

    const metrics = session.getMetrics()
    expect(metrics.isResolved).toBe(true)
    expect(metrics.epistemicDriveStatus).toBe('satiated')
  })

  it('confirms all calibrated mysteries have complete clues and resolvers', () => {
    for (const mystery of Object.values(CALIBRATED_CURIOSITY_MYSTERIES)) {
      expect(mystery.clues.length).toBeGreaterThanOrEqual(3)
      expect(mystery.resolverOptions.length).toBeGreaterThanOrEqual(2)
      expect(mystery.resolverOptions.some((o) => o.isAccurateResolution)).toBe(true)
    }
  })
})
