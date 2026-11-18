import { describe, it, expect } from 'vitest'
import {
  CANONICAL_TEXT_PASSAGES,
  TextPassageSchema,
  classifyICAPEngagement,
  evaluateReciprocalSession,
  generatePeerDialogicTurn,
  generateReciprocalFSRSDeck,
  DialogueTurn,
} from '../src/reciprocal-teaching/reciprocal-engine'

describe('Reciprocal Teaching & Dialogic Questioning Engine', () => {
  it('validates all 5 canonical text passages against TextPassageSchema', () => {
    expect(CANONICAL_TEXT_PASSAGES).toHaveLength(5)
    for (const passage of CANONICAL_TEXT_PASSAGES) {
      const parsed = TextPassageSchema.safeParse(passage)
      expect(parsed.success).toBe(true)
      expect(passage.stems.length).toBeGreaterThanOrEqual(4)
      expect(passage.commonMisconceptions.length).toBeGreaterThanOrEqual(2)
      expect(passage.predictivePrompts.length).toBeGreaterThanOrEqual(1)
    }
  })

  it('classifies ICAP engagement correctly across modalities', () => {
    // 1. Passive
    const passiveResult = classifyICAPEngagement('Yes I agree', false)
    expect(passiveResult.icapLevel).toBe('passive')

    // 2. Active
    const activeResult = classifyICAPEngagement(
      'Mitochondria contain their own circular DNA and divide through binary fission like bacteria.',
      false,
    )
    expect(activeResult.icapLevel).toBe('active')

    // 3. Constructive
    const constructiveResult = classifyICAPEngagement(
      'The inner membrane must be bacterial because it contains cardiolipin, whereas eukaryotic outer membranes lack it; consequently, endogenous pinching is falsified.',
      false,
    )
    expect(constructiveResult.icapLevel).toBe('constructive')
    expect(constructiveResult.causalScore).toBeGreaterThanOrEqual(50)

    // 4. Interactive
    const interactiveResult = classifyICAPEngagement(
      'Building on what you said about cardiolipin, how do you reconcile that with the fact that over 95% of mitochondrial proteins are encoded in the host cell nucleus?',
      true,
      {
        id: 't-prev',
        speaker: 'peer_agent',
        role: 'clarifier',
        turnIndex: 0,
        text: 'The cardiolipin in the inner membrane indicates ancestral bacterial descent.',
        timestamp: 1000,
        icapLevel: 'constructive',
        elaborationScore: 70,
      },
    )
    expect(interactiveResult.icapLevel).toBe('interactive')
  })

  it('computes evaluation correctly for an empty session', () => {
    const passage = CANONICAL_TEXT_PASSAGES[0]
    const evaluation = evaluateReciprocalSession([], passage)
    expect(evaluation.userTurnsCount).toBe(0)
    expect(evaluation.icap.passiveRatio).toBe(1)
    expect(evaluation.strategy.rsbs).toBe(0)
    expect(evaluation.rdms).toBeLessThanOrEqual(20)
    expect(evaluation.masteryBand).toBe('novice_passive')
  })

  it('calculates comprehensive RDMS, ICAP distribution, and Shannon entropy RSBS', () => {
    const passage = CANONICAL_TEXT_PASSAGES[0]
    const turns: DialogueTurn[] = [
      {
        id: 'turn-1',
        speaker: 'user',
        role: 'questioner',
        turnIndex: 0,
        text: 'What specific structural evidence causally proves that the inner mitochondrial membrane is bacterial rather than eukaryotic in origin?',
        timestamp: 1000,
        icapLevel: 'constructive',
        elaborationScore: 75,
      },
      {
        id: 'turn-2',
        speaker: 'peer_agent',
        role: 'clarifier',
        turnIndex: 1,
        text: 'Inner membrane cardiolipin demonstrates bacterial origin because eukaryotes lack it.',
        timestamp: 2000,
        icapLevel: 'constructive',
        elaborationScore: 65,
      },
      {
        id: 'turn-3',
        speaker: 'user',
        role: 'clarifier',
        turnIndex: 2,
        text: 'Building on what you said, some believe mitochondria formed by inward membrane pinching, but this is refuted because the outer membrane comes from the host vacuole whereas the inner membrane has cardiolipin.',
        timestamp: 3000,
        icapLevel: 'interactive',
        elaborationScore: 85,
        resolvedMisconceptionId: 'misc-endo-1',
      },
      {
        id: 'turn-4',
        speaker: 'user',
        role: 'summarizer',
        turnIndex: 3,
        text: 'To summarize, symbiogenesis asserts that mitochondria evolved through the fusion of disparate organisms rather than point mutations within a single lineage.',
        timestamp: 4000,
        icapLevel: 'constructive',
        elaborationScore: 70,
      },
      {
        id: 'turn-5',
        speaker: 'user',
        role: 'predictor',
        turnIndex: 4,
        text: 'Consequently, if we treat eukaryotic cells with chloramphenicol, mitochondrial protein synthesis will be halted because they utilize 70S bacterial ribosomes.',
        timestamp: 5000,
        icapLevel: 'interactive',
        elaborationScore: 90,
      },
    ]

    const evaluation = evaluateReciprocalSession(turns, passage)

    expect(evaluation.userTurnsCount).toBe(4)
    // User practiced all 4 roles: questioner, clarifier, summarizer, predictor!
    expect(evaluation.strategy.rsbs).toBe(100)
    expect(evaluation.strategy.neglectedRoles).toHaveLength(0)

    // High interactive & constructive proportion
    expect(evaluation.icap.interactiveRatio).toBe(0.5)
    expect(evaluation.icap.constructiveRatio).toBe(0.5)
    expect(evaluation.icap.ics).toBeGreaterThanOrEqual(80)

    // Metacognitive repair
    expect(evaluation.repair.attemptedRepairs).toBe(1)
    expect(evaluation.repair.successfulRepairs).toBe(1)
    expect(evaluation.repair.mrr).toBe(1)

    // RDMS maturity score
    expect(evaluation.rdms).toBeGreaterThanOrEqual(75)
    expect(evaluation.masteryBand).toMatch(/proficient_constructive|mastery_interactive/)
  })

  it('generates responsive peer dialogic turns for each reciprocal role', () => {
    const passage = CANONICAL_TEXT_PASSAGES[1] // Turing Halting Problem
    const history: DialogueTurn[] = [
      {
        id: 't-1',
        speaker: 'user',
        role: 'questioner',
        turnIndex: 0,
        text: 'Why does the self-application D(D) create an inescapable contradiction?',
        timestamp: 1000,
        icapLevel: 'constructive',
        elaborationScore: 80,
      },
    ]

    // Auto-selected complementary role (clarifier)
    const peerTurn = generatePeerDialogicTurn(passage, history)
    expect(peerTurn.role).toBe('clarifier')
    expect(peerTurn.text).toContain('consider this potential misconception')
    expect(peerTurn.icapLevel).toBe('interactive')

    // Explicitly chosen roles
    const summarizerTurn = generatePeerDialogicTurn(passage, history, 'summarizer')
    expect(summarizerTurn.role).toBe('summarizer')
    expect(summarizerTurn.text).toContain('overarching thesis is that')

    const predictorTurn = generatePeerDialogicTurn(passage, history, 'predictor')
    expect(predictorTurn.role).toBe('predictor')
    expect(predictorTurn.text).toContain('logical next step')
  })

  it('synthesizes calibrated FSRS-6 deck with RDMS-scaled parameters', () => {
    const passage = CANONICAL_TEXT_PASSAGES[4] // Hebbian LTP
    const turns: DialogueTurn[] = [
      {
        id: 't-1',
        speaker: 'user',
        role: 'questioner',
        turnIndex: 0,
        text: 'Why does calcium influx require coincident depolarization to expel magnesium from the NMDA receptor?',
        timestamp: 1000,
        icapLevel: 'constructive',
        elaborationScore: 80,
      },
    ]
    const evaluation = evaluateReciprocalSession(turns, passage)
    const deck = generateReciprocalFSRSDeck(passage, turns, evaluation)

    expect(deck.passageId).toBe('passage-hebbian-ltp')
    expect(deck.cards).toHaveLength(4)

    const roles = deck.cards.map((c) => c.role)
    expect(roles).toEqual(['questioner', 'clarifier', 'summarizer', 'predictor'])

    for (const card of deck.cards) {
      expect(card.front.length).toBeGreaterThan(15)
      expect(card.back.length).toBeGreaterThan(15)
      expect(card.fsrsParameters.stability).toBeGreaterThan(0)
      expect(card.fsrsParameters.difficulty).toBeGreaterThan(0)
      expect(card.tags).toContain('reciprocal-teaching')
      expect(card.tags).toContain('neurobiology')
    }
  })
})
