import { describe, expect, it } from 'vitest'
import {
  applyDoctorAction,
  calculateHealthScore,
  diagnoseDeck,
  type DoctorCardInput,
  type DoctorDeckInput,
} from '../src/doctor'

describe('Deck Doctor domain logic (F-12)', () => {
  const cleanDeck: DoctorDeckInput = {
    id: 1,
    name: 'Neuroscience Foundations',
    description: 'Core concepts of synaptic transmission',
  }

  const healthyCards: DoctorCardInput[] = [
    {
      id: 101,
      deckId: 1,
      type: 'basic',
      content: {
        basic: {
          front: 'What is the primary excitatory neurotransmitter in the CNS?',
          back: 'Glutamate',
        },
      },
      source: 'Kandel Principles of Neural Science',
      tags: ['neuroscience', 'neurochemistry'],
      lapses: 0,
    },
    {
      id: 102,
      deckId: 1,
      type: 'basic',
      content: {
        basic: {
          front: 'What glial cells produce myelin in the peripheral nervous system?',
          back: 'Schwann cells',
        },
      },
      source: 'Kandel Principles of Neural Science',
      tags: ['neuroscience', 'neuroanatomy'],
      lapses: 1,
    },
  ]

  it('healthy deck scores 100 with zero mechanical fix actions', () => {
    const diagnosis = diagnoseDeck({
      deck: cleanDeck,
      cards: healthyCards,
    })

    expect(diagnosis.deckId).toBe(1)
    expect(diagnosis.healthScore).toBe(100)
    expect(diagnosis.stats.totalCards).toBe(2)
    expect(diagnosis.stats.cleanCards).toBe(2)
    expect(diagnosis.stats.leechCount).toBe(0)
    expect(diagnosis.findings).toHaveLength(0)
    expect(diagnosis.actions).toHaveLength(0)
  })

  it('detects leech cards and generates suspend-card action as default recommendation', () => {
    const leechCards: DoctorCardInput[] = [
      ...healthyCards,
      {
        id: 103,
        deckId: 1,
        type: 'basic',
        content: {
          basic: {
            front: 'What is the function of the subthalamic nucleus?',
            back: 'Modulates basal ganglia output via indirect pathway excitation',
          },
        },
        source: 'Neuroanatomy Atlas',
        tags: ['neuroanatomy'],
        lapses: 9, // >= 8 is a leech
      },
    ]

    const diagnosis = diagnoseDeck({
      deck: cleanDeck,
      cards: leechCards,
    })

    expect(diagnosis.stats.leechCount).toBe(1)
    // Leech penalty = 4, score = 96
    expect(diagnosis.healthScore).toBe(96)

    const suspendAction = diagnosis.actions.find(
      (a) => a.kind === 'suspend-card' && a.cardId === 103,
    )
    expect(suspendAction).toBeDefined()
    expect(suspendAction?.rule).toBe('leech-prevention')
  })

  it('flags duplicate / near-duplicate pairs exactly once', () => {
    const dupeCards: DoctorCardInput[] = [
      {
        id: 201,
        deckId: 1,
        type: 'basic',
        content: {
          basic: {
            front: 'What is the speed of light in vacuum?',
            back: '300,000 km/s',
          },
        },
        source: 'Physics Handbook',
        tags: ['physics'],
      },
      {
        id: 202,
        deckId: 1,
        type: 'basic',
        content: {
          basic: {
            front: 'What is the speed of light in vacuum?',
            back: '300,000 km/s',
          },
        },
        source: 'Physics Handbook',
        tags: ['physics'],
      },
    ]

    const diagnosis = diagnoseDeck({
      deck: cleanDeck,
      cards: dupeCards,
    })

    const deleteActions = diagnosis.actions.filter((a) => a.kind === 'delete-card')
    // Sibling interference produces findings on both cards, but Doctor flags the pair ONCE
    expect(deleteActions).toHaveLength(1)
    expect(deleteActions[0]!.cardId).toBe(202) // Deletes the higher ID card
    expect(deleteActions[0]!.rule).toBe('W6-interference')
  })

  it('suggests cloze conversion for sentence-length basic cards', () => {
    const sentenceCard: DoctorCardInput = {
      id: 301,
      deckId: 1,
      type: 'basic',
      content: {
        basic: {
          front: 'What does mitochondria produce?',
          back: 'ATP through cellular aerobic respiration', // 5 words: W11 suggestion
        },
      },
      source: 'Cell Bio',
      tags: ['biology'],
    }

    const diagnosis = diagnoseDeck({
      deck: cleanDeck,
      cards: [sentenceCard],
    })

    const clozeAction = diagnosis.actions.find((a) => a.kind === 'regenerate-cloze')
    expect(clozeAction).toBeDefined()
    expect(clozeAction?.cardId).toBe(301)
  })

  it('groups human-judgment rules into manual guidance with research citations', () => {
    const multiQuestionCard: DoctorCardInput = {
      id: 401,
      deckId: 1,
      type: 'basic',
      content: {
        basic: {
          front: 'What is DNA? And what is RNA?', // W1 multi-question
          back: 'Genetic material',
        },
      },
      source: 'Bio 101',
      tags: ['genetics'],
    }

    const diagnosis = diagnoseDeck({
      deck: cleanDeck,
      cards: [multiQuestionCard],
    })

    const manualAction = diagnosis.actions.find(
      (a) => a.kind === 'manual' && a.rule === 'W1-minimum-information',
    )
    expect(manualAction).toBeDefined()
    if (manualAction?.kind === 'manual') {
      expect(manualAction.cardIds).toContain(401)
      expect(manualAction.hint).toContain('Minimum Information Principle')
    }
  })

  it('flags generic deck names for renaming', () => {
    const untitledDeck: DoctorDeckInput = {
      id: 5,
      name: 'Untitled',
    }

    const diagnosis = diagnoseDeck({
      deck: untitledDeck,
      cards: healthyCards,
    })

    const renameAction = diagnosis.actions.find((a) => a.kind === 'rename-deck')
    expect(renameAction).toBeDefined()
    expect(renameAction?.kind).toBe('rename-deck')
  })

  it('calculates deterministic health scores without time dependencies', () => {
    const score1 = calculateHealthScore({
      errors: 2,
      warns: 3,
      infos: 4,
      leeches: 1,
      totalCards: 20,
    })
    // 100 - (2*5 + 3*2 + 4*0.5 + 1*4) = 100 - (10 + 6 + 2 + 4) = 78
    expect(score1).toBe(78)

    const score2 = calculateHealthScore({
      errors: 25,
      warns: 10,
      infos: 5,
      leeches: 5,
      totalCards: 20,
    })
    expect(score2).toBe(0) // Clamped to 0
  })

  it('applyDoctorAction returns correct DB-neutral operations', () => {
    const cardLookup = (id: number) => healthyCards.find((c) => c.id === id)

    const delOp = applyDoctorAction({
      kind: 'delete-card',
      cardId: 101,
      rule: 'W6-interference',
      reason: 'Duplicate',
    })
    expect(delOp).toEqual({ op: 'delete', cardId: 101 })

    const suspOp = applyDoctorAction({
      kind: 'suspend-card',
      cardId: 102,
      rule: 'leech-prevention',
    })
    expect(suspOp).toEqual({ op: 'update', cardId: 102, patch: { suspended: true } })

    const renameOp = applyDoctorAction({
      kind: 'rename-deck',
      deckId: 1,
      to: 'Neurobiology 101',
      rule: 'deck-naming',
    })
    expect(renameOp).toEqual({ op: 'rename-deck', deckId: 1, name: 'Neurobiology 101' })

    const clozeOp = applyDoctorAction(
      {
        kind: 'regenerate-cloze',
        cardId: 101,
        rule: 'W11-cloze-suggestion',
      },
      cardLookup,
    )
    expect(clozeOp.op).toBe('update')
    if (clozeOp.op === 'update') {
      expect(clozeOp.cardId).toBe(101)
      expect(clozeOp.patch.type).toBe('cloze')
      expect(clozeOp.patch.content?.cloze?.answers).toEqual(['Glutamate'])
    }
  })
})
