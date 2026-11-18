/**
 * Unit Tests for Collaborative Scripts & Transactive Discourse Engine
 *
 * Verifies:
 * 1. Canonical scenarios integrity and schema compliance
 * 2. Transactive Discourse Index (TDI) and Epistemic Elaboration Depth (EED) calculation
 * 3. Script Compliance Rigor (SCR) across 4-phase macro-script
 * 4. Composite Collaborative Epistemic Index (CEI) & dialectical maturity bands
 * 5. Automated Socratic peer turn generator
 * 6. Calibrated FSRS-6 review deck generation
 */

import { describe, expect, it } from 'vitest'
import {
  CANONICAL_COLLABORATIVE_SCENARIOS,
  evaluateCollaborativeDiscourse,
  generateCollaborativePeerTurn,
  generateCollaborativeFSRSDeck,
  type DiscourseSubmission,
} from '../src/collaborative'

describe('Collaborative Scripts & Transactive Discourse Engine', () => {
  it('loads all 5 canonical collaborative scenarios with valid schema structures', () => {
    expect(CANONICAL_COLLABORATIVE_SCENARIOS).toHaveLength(5)

    for (const scenario of CANONICAL_COLLABORATIVE_SCENARIOS) {
      expect(scenario.id).toBeDefined()
      expect(scenario.title).toBeDefined()
      expect(scenario.domain).toBeDefined()
      expect(scenario.competingPerspectives.length).toBeGreaterThanOrEqual(2)
      expect(scenario.invariantsForSynthesis.length).toBeGreaterThanOrEqual(1)
      expect(scenario.guidedKingStems.length).toBeGreaterThanOrEqual(3)
      expect(scenario.simulatedPeer.name).toBeDefined()
      expect(scenario.simulatedPeer.counterArguments.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('evaluates high transactivity and causal depth as dialectical_synthesizer', () => {
    const scenario = CANONICAL_COLLABORATIVE_SCENARIOS[0]!
    const submission: DiscourseSubmission = {
      scenarioId: scenario.id,
      learnerInitialPosition:
        'Late-LTP provides the primary protein synthesis substrate for synaptic efficacy, but requires spatial regulation to prevent saturation.',
      dialogueTurns: [
        {
          id: 'turn-1',
          speaker: 'learner',
          role: 'proposer',
          text: 'Because you stated that local protein synthesis at dendritic spines is the sole determinant of retention, how does your proposal account for the BCM paradox where untagged neighboring synapses drift into runaway excitability?',
          speechAct: 'transactive_critique',
          epistemicKeywords: ['bcm_paradox', 'runaway_excitability'],
        },
        {
          id: 'turn-2',
          speaker: 'learner',
          role: 'synthesizer',
          text: 'Building upon your argument, if we integrate Frey-Morris synaptic tagging with homeostatic synaptic scaling, weak stimulation sets a local tag whereas strong stimulation triggers cell-wide PRPs, therefore reconciling local specificity with global dynamic range.',
          speechAct: 'transactive_synthesis',
          epistemicKeywords: ['tag_and_capture', 'homeostatic_scaling'],
        },
      ],
      jointSynthesis:
        'We conclude that memory persistence depends on Frey-Morris Synaptic Tagging & Capture Coordination combined with a BCM sliding threshold: local tags capture global PRPs while homeostatic LTD depotentiates untagged inputs to maintain contrast.',
      individualTransferAnswer:
        'When applying this to artificial neural networks, local gradient updates serve as synaptic tags while global weight decay acts as homeostatic LTD, preventing catastrophic gradient explosion.',
    }

    const evalResult = evaluateCollaborativeDiscourse(scenario, submission)

    expect(evalResult.tdi).toBeGreaterThanOrEqual(80)
    expect(evalResult.eed).toBeGreaterThanOrEqual(70)
    expect(evalResult.scr).toBe(100)
    expect(evalResult.cei).toBeGreaterThanOrEqual(80)
    expect(evalResult.maturityBand).toBe('dialectical_synthesizer')
    expect(evalResult.synthesizedInvariantsIdentified.length).toBeGreaterThanOrEqual(1)
    expect(evalResult.strengths.length).toBeGreaterThanOrEqual(2)
  })

  it('detects cumulative non-transactive discourse and penalizes TDI', () => {
    const scenario = CANONICAL_COLLABORATIVE_SCENARIOS[0]!
    const submission: DiscourseSubmission = {
      scenarioId: scenario.id,
      learnerInitialPosition: 'I like NMDA receptors.',
      dialogueTurns: [
        {
          id: 'turn-1',
          speaker: 'learner',
          role: 'proposer',
          text: 'Yes, that sounds right. Good point.',
          speechAct: 'non_transactive',
          epistemicKeywords: [],
        },
        {
          id: 'turn-2',
          speaker: 'learner',
          role: 'proposer',
          text: 'I also think memories are stored in the brain.',
          speechAct: 'non_transactive',
          epistemicKeywords: [],
        },
      ],
      jointSynthesis: 'We agreed that memory is important.',
      individualTransferAnswer: 'Study more frequently.',
    }

    const evalResult = evaluateCollaborativeDiscourse(scenario, submission)

    expect(evalResult.tdi).toBeLessThanOrEqual(50)
    expect(evalResult.maturityBand).not.toBe('dialectical_synthesizer')
    expect(evalResult.vulnerabilities.length).toBeGreaterThanOrEqual(1)
  })

  it('generates simulated peer response turn with Socratic challenge', () => {
    const scenario = CANONICAL_COLLABORATIVE_SCENARIOS[1]!
    const peerTurn1 = generateCollaborativePeerTurn(
      scenario,
      'We should allow CRDTs everywhere.',
      0,
    )
    expect(peerTurn1.speaker).toBe('peer_partner')
    expect(peerTurn1.text).toContain(scenario.simulatedPeer.initialArgument)

    const peerTurn2 = generateCollaborativePeerTurn(scenario, 'What about boundary conditions?', 1)
    expect(peerTurn2.speaker).toBe('peer_partner')
    expect(peerTurn2.speechAct).toBe('transactive_extension')
  })

  it('synthesizes calibrated FSRS-6 spaced repetition deck scaled by CEI', () => {
    const scenario = CANONICAL_COLLABORATIVE_SCENARIOS[2]!
    const dummyEval = evaluateCollaborativeDiscourse(scenario, {
      scenarioId: scenario.id,
      learnerInitialPosition: 'SAI must be strictly temporary peak-shaving.',
      dialogueTurns: [
        {
          id: 'turn-1',
          speaker: 'learner',
          role: 'synthesizer',
          text: 'Because you stated monsoon risk, if we integrate MacMartin-Keith peak-shaving, we bound sulfur to under 1W/m2 while DACCS scales.',
          speechAct: 'transactive_synthesis',
          epistemicKeywords: [],
        },
      ],
      jointSynthesis: 'Temporary peak-shaving bridge coupled with DACCS mineralization.',
      individualTransferAnswer: 'Transfer to methane abatement governance.',
    })
    dummyEval.cei = 90

    const deck = generateCollaborativeFSRSDeck(scenario, dummyEval)

    expect(deck.scenarioId).toBe(scenario.id)
    expect(deck.cards).toHaveLength(4)
    expect(deck.cards[0]!.fsrsParameters.stability).toBeGreaterThanOrEqual(7.0)
    expect(deck.cards[0]!.fsrsParameters.difficulty).toBeLessThanOrEqual(4.5)
  })
})
