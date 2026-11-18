import { describe, expect, it } from 'vitest'
import {
  GedankenScenarioSchema,
  listGedankenScenarios,
  getGedankenScenario,
  perturbExtremeCase,
  simulateMentalAnimation,
  evaluateInquirySession,
  generateModelInquiryFsrsDeck,
  calculateExtremeCaseScore,
  calculateAnimationFidelityScore,
  calculateBridgingAnalogyScore,
  calculateModelModificationScore,
  calculateCompositeModelInquiryIndex,
  determineMaturityTier,
  type InquirySessionInput,
} from '../src/model-inquiry'

describe('Model-Based Scientific Inquiry & Gedankenexperiment Engine (Clement 2008)', () => {
  it('loads and validates all 5 canonical Gedankenexperiment scenarios against Zod schema', () => {
    const scenarios = listGedankenScenarios()
    expect(scenarios).toHaveLength(5)

    for (const scenario of scenarios) {
      const parsed = GedankenScenarioSchema.safeParse(scenario)
      expect(parsed.success).toBe(true)
      expect(scenario.extremeCases.length).toBeGreaterThanOrEqual(2)
      expect(scenario.simulativeSteps.length).toBeGreaterThanOrEqual(4)
      expect(scenario.bridgingAnalogies.length).toBeGreaterThanOrEqual(1)
      expect(scenario.canonicalResolution.keyPrinciples.length).toBeGreaterThanOrEqual(3)
      expect(scenario.fsrsItems.length).toBeGreaterThanOrEqual(2)
    }

    expect(getGedankenScenario('galileo_falling_bodies')).toBeDefined()
    expect(getGedankenScenario('maxwells_demon_entropy')).toBeDefined()
    expect(getGedankenScenario('einsteins_light_chaser')).toBeDefined()
    expect(getGedankenScenario('darwins_natural_selection')).toBeDefined()
    expect(getGedankenScenario('turings_halting_oracle')).toBeDefined()
  })

  it('evaluates extreme case perturbations correctly with asymptotic limit behavior', () => {
    const result = perturbExtremeCase('galileo_falling_bodies', 'ec_feather_cannonball')
    expect(result.valid).toBe(true)
    expect(result.contradictionRevealed).toBe(true)
    expect(result.asymptoticBehavior).toContain('0.001 kg / 100 kg')
    expect(result.consequence).toContain('vacuum')

    // Invalid scenario handling
    const invalidScenario = perturbExtremeCase('non_existent', 'ec_1')
    expect(invalidScenario.valid).toBe(false)

    // Invalid extreme case handling
    const invalidCase = perturbExtremeCase('galileo_falling_bodies', 'non_existent_case')
    expect(invalidCase.valid).toBe(false)
  })

  it('runs mental animation simulation validating causal sequence and exposing contradictions', () => {
    const galileo = getGedankenScenario('galileo_falling_bodies')!
    const stepIds = galileo.simulativeSteps.map((s) => s.id)

    const sim = simulateMentalAnimation('galileo_falling_bodies', stepIds)
    expect(sim.valid).toBe(true)
    expect(sim.fidelityScore).toBe(100)
    expect(sim.observations.length).toBe(5)
    expect(sim.contradictionsExposed.length).toBeGreaterThanOrEqual(2)

    // Reordered/partial sequence
    const partialSim = simulateMentalAnimation('galileo_falling_bodies', [stepIds[0]!, stepIds[4]!])
    expect(partialSim.fidelityScore).toBeLessThan(100)
  })

  it('computes component telemetry scores and assigns cognitive maturity tiers', () => {
    const galileo = getGedankenScenario('galileo_falling_bodies')!

    // 1. Extreme Case score
    const ecdiHigh = calculateExtremeCaseScore(
      galileo,
      ['ec_feather_cannonball', 'ec_split_identical_halves', 'ec_vacuum_medium'],
      {
        ec_feather_cannonball: 'In vacuum they fall at the exact same rate; mass cancels out',
        ec_split_identical_halves: 'Equal speeds for identical halves',
        ec_vacuum_medium: 'Vacuum removes aerodynamic drag',
      },
    )
    expect(ecdiHigh).toBe(100)

    // 2. Animation Fidelity score
    const safHigh = calculateAnimationFidelityScore(
      galileo,
      galileo.simulativeSteps.map((s) => s.id),
      ['Contradiction Branch A', 'Contradiction Branch B', 'Contradiction Simultaneous'],
    )
    expect(safHigh).toBe(100)

    // 3. Bridging Analogy score
    const basHigh = calculateBridgingAnalogyScore(
      galileo,
      'bridge_twin_halves',
      'The symmetrical mass distribution shares identical structural anchor intuition',
    )
    expect(basHigh).toBe(100)

    // 4. Model Modification score
    const mmsHigh = calculateModelModificationScore(
      galileo,
      'The equivalence of inertial mass and gravitational mass ensures that gravitational acceleration is independent of falling mass.',
    )
    expect(mmsHigh).toBeGreaterThanOrEqual(70)

    // 5. Composite MBRI
    const mbri = calculateCompositeModelInquiryIndex(ecdiHigh, safHigh, basHigh, mmsHigh)
    expect(mbri).toBeGreaterThanOrEqual(85)

    const tier = determineMaturityTier(mbri)
    expect(tier.tier).toBe('gedanken_theorist')

    // Low score tier
    const lowTier = determineMaturityTier(25)
    expect(lowTier.tier).toBe('folk_intuition')
  })

  it('evaluates complete learner inquiry session and generates diagnostic feedback', () => {
    const input: InquirySessionInput = {
      scenarioId: 'turings_halting_oracle',
      selectedExtremeCaseIds: ['ec_trivial_loop_check', 'ec_perfect_oracle_assumption'],
      extremeCasePredictions: {
        ec_trivial_loop_check: 'Trivial cases do not generalize to diagonal self-reference',
        ec_perfect_oracle_assumption: 'Leads directly to an impossible logical loop paradox',
      },
      simulativeStepOrder: [
        'step_oracle_definition',
        'step_construct_adversary',
        'step_feed_paradox_to_itself',
        'step_evaluate_branch_1',
        'step_evaluate_branch_2',
        'step_halting_crucible',
      ],
      identifiedContradictions: ['Branch 1 paradox', 'Branch 2 paradox', 'Uncomputable halting'],
      selectedBridgingId: 'bridge_liar_paradox',
      bridgingExplanation:
        'Diagonal inversion mirrors the self-referential structure of the Barber of Seville paradox',
      revisedModelHypothesis:
        'Reductio ad absurdum proof via self-referential diagonalization proves undecidability and limits of formal algorithmic computation.',
    }

    const evaluation = evaluateInquirySession(input)
    expect(evaluation.scenarioId).toBe('turings_halting_oracle')
    expect(evaluation.compositeIndex).toBeGreaterThanOrEqual(80)
    expect(['perturbation_analyst', 'gedanken_theorist']).toContain(evaluation.tier)
    expect(evaluation.feedback.strengths.length).toBeGreaterThan(0)
    expect(evaluation.fsrsCardCount).toBeGreaterThanOrEqual(2)
  })

  it('generates calibrated FSRS-6 spaced repetition cards including synthesis reviews', () => {
    const cards = generateModelInquiryFsrsDeck('einsteins_light_chaser')
    expect(cards.length).toBeGreaterThanOrEqual(2)

    for (const card of cards) {
      expect(card.id).toContain('fsrs_einsteins_light_chaser')
      expect(card.front).toContain('Gedankenexperiment')
      expect(card.back.length).toBeGreaterThan(20)
      expect(card.tags).toContain('gedanken')
      expect(card.initialDifficulty).toBeGreaterThanOrEqual(1)
    }

    // Synthesis card generation when evaluation is below gedanken_theorist
    const input: InquirySessionInput = {
      scenarioId: 'einsteins_light_chaser',
      selectedExtremeCaseIds: [],
    }
    const evalBelow = evaluateInquirySession(input)
    const cardsWithReview = generateModelInquiryFsrsDeck('einsteins_light_chaser', evalBelow)
    expect(cardsWithReview.some((c) => c.id.includes('synthesis_review'))).toBe(true)
  })
})
