/**
 * Agent A — games module tests: matching pairs and category mapping.
 */
import { describe, expect, it } from 'vitest'
import {
  calculateMatchingAccuracy,
  cardSides,
  evaluateMatchingGame,
  generateMapping,
  generateMatchingPairs,
  gradeForAccuracy,
  type GameCard,
} from '../src/games'

function gameCard(overrides: Partial<GameCard> = {}): GameCard {
  return {
    id: 1,
    type: 'basic',
    content: { basic: { front: 'front', back: 'back' } },
    tags: [],
    ...overrides,
  }
}

describe('cardSides', () => {
  it('extracts sides per format', () => {
    expect(cardSides({ basic: { front: 'Q', back: 'A' } })).toEqual({ left: 'Q', right: 'A' })
    expect(cardSides({ mcq: { question: 'Q', options: ['a', 'b'], correctIndex: 1 } })).toEqual({
      left: 'Q',
      right: 'b',
    })
    expect(cardSides({ typein: { question: 'Q', acceptedAnswers: ['x', 'xx'] } })).toEqual({
      left: 'Q',
      right: 'x',
    })
    expect(cardSides({ cloze: { text: 'a {{c1::b}} c', answers: ['b'], mode: 'basic' } })).toEqual({
      left: 'a ___ c',
      right: 'b',
    })
    expect(cardSides({ grammar: { sentence: 'S', pattern: 'P', target: 'T' } })).toEqual({
      left: 'S',
      right: 'T',
    })
    expect(
      cardSides({
        proof_step: { theorem: 'T', proofSteps: ['s1'], stepIndex: 0, justification: 'hyp' },
      }),
    ).toEqual({ left: 'T — step 1', right: 'hyp' })
  })

  it('returns null for occlusion and empty content', () => {
    expect(cardSides({ occlusion: { imageId: 1, rects: [] } })).toBeNull()
    expect(cardSides({})).toBeNull()
  })
})

describe('generateMatchingPairs', () => {
  const cards = [
    gameCard({ id: 1, content: { basic: { front: 'Q1', back: 'A1' } } }),
    gameCard({ id: 2, content: { basic: { front: 'Q2', back: 'A2' } } }),
    gameCard({ id: 3, content: { basic: { front: 'Q3', back: 'A3' } } }),
    gameCard({ id: 4, content: { occlusion: { imageId: 9, rects: [] } } }), // unplayable
    gameCard({ id: 5, content: { basic: { front: 'Q5', back: '' } } }), // empty back
  ]

  it('builds pairs only from playable cards and shuffles', () => {
    const out = generateMatchingPairs(cards, { rng: () => 0.5 })
    expect(out.pairs).toHaveLength(3)
    expect(out.pairs.map((p) => p.cardId).sort()).toEqual([1, 2, 3])
    // lefts stable, rights is a permutation of the same pairs
    expect(out.lefts).toEqual(out.pairs)
    expect([...out.rights].sort((a, b) => a.cardId - b.cardId)).toEqual(
      [...out.pairs].sort((a, b) => a.cardId - b.cardId),
    )
  })

  it('caps at maxPairs', () => {
    const out = generateMatchingPairs(cards, { maxPairs: 2, rng: () => 0.5 })
    expect(out.pairs).toHaveLength(2)
  })

  it('works with a deterministic rng for reproducible boards', () => {
    const a = generateMatchingPairs(cards, { rng: () => 0.3 })
    const b = generateMatchingPairs(cards, { rng: () => 0.3 })
    expect(a.pairs).toEqual(b.pairs)
  })
})

describe('generateMapping', () => {
  const cards = [
    gameCard({ id: 1, tags: ['verbs'], content: { basic: { front: 'aller', back: 'to go' } } }),
    gameCard({ id: 2, tags: ['verbs'], content: { basic: { front: 'finir', back: 'to finish' } } }),
    gameCard({ id: 3, tags: ['nouns'], content: { basic: { front: 'maison', back: 'house' } } }),
    gameCard({ id: 4, tags: ['nouns'], content: { basic: { front: 'livre', back: 'book' } } }),
    gameCard({
      id: 5,
      tags: ['ai'],
      content: { basic: { front: 'utility', back: 'tag skipped' } },
    }),
  ]

  it('groups by first meaningful tag and reports playability', () => {
    const game = generateMapping(cards)
    expect(game.categories.sort()).toEqual(['nouns', 'verbs'])
    expect(game.items).toHaveLength(4)
    expect(game.playable).toBe(true)
    expect(game.items.find((i) => i.cardId === 1)?.category).toBe('verbs')
    expect(game.items.find((i) => i.cardId === 3)?.category).toBe('nouns')
    expect(game.items.find((i) => i.cardId === 5)).toBeUndefined()
  })

  it('reports playable=false for fewer than 2 categories', () => {
    const single = cards.filter((c) => (c.tags ?? []).includes('verbs'))
    expect(generateMapping(single).playable).toBe(false)
  })

  it('caps items round-robin across categories', () => {
    const game = generateMapping(cards, { maxItems: 3 })
    expect(game.items).toHaveLength(3)
    const counts = new Map<string, number>()
    for (const item of game.items) counts.set(item.category, (counts.get(item.category) ?? 0) + 1)
    expect(counts.get('verbs')).toBe(2)
    expect(counts.get('nouns')).toBe(1)
  })
})

describe('calculateMatchingAccuracy (DEF-007)', () => {
  it('calculates accuracy accurately from pairs and misses', () => {
    expect(calculateMatchingAccuracy(4, 0)).toBe(1.0)
    expect(calculateMatchingAccuracy(4, 1)).toBe(0.8)
    expect(calculateMatchingAccuracy(4, 4)).toBe(0.5)
    expect(calculateMatchingAccuracy(4, 6)).toBe(0.4)
    expect(calculateMatchingAccuracy(4, 10)).toBeCloseTo(0.2857, 3)
    expect(calculateMatchingAccuracy(0, 5)).toBe(0)
    expect(calculateMatchingAccuracy(4, -2)).toBe(1.0)
  })
})

describe('gradeForAccuracy (DEF-007)', () => {
  it('maps accuracy to correct FSRS grade thresholds', () => {
    expect(gradeForAccuracy(1.0)).toBe(4)
    expect(gradeForAccuracy(0.9)).toBe(4)
    expect(gradeForAccuracy(0.89)).toBe(3)
    expect(gradeForAccuracy(0.7)).toBe(3)
    expect(gradeForAccuracy(0.69)).toBe(2)
    expect(gradeForAccuracy(0.4)).toBe(2)
    expect(gradeForAccuracy(0.39)).toBe(1)
    expect(gradeForAccuracy(0.0)).toBe(1)
  })
})

describe('calculateMatchingXp & evaluateMatchingGame (DEF-007)', () => {
  it('evaluates round with speed bonus and high accuracy', () => {
    const res = evaluateMatchingGame({ pairs: 4, misses: 0, timeMs: 10000 })
    expect(res.accuracy).toBe(1)
    expect(res.scorePct).toBe(100)
    expect(res.grade).toBe(4)
    expect(res.speedBonus).toBe(true)
    // 4 * 2 (base) + 5 (recall) + 5 (speed) = 18 XP
    expect(res.xp).toBe(18)
    expect(res.totalAttempts).toBe(4)
  })

  it('evaluates round with misses and lower grade', () => {
    const res = evaluateMatchingGame({ pairs: 4, misses: 4, timeMs: 30000 })
    expect(res.accuracy).toBe(0.5)
    expect(res.scorePct).toBe(50)
    expect(res.grade).toBe(2)
    expect(res.speedBonus).toBe(false)
    // 4 * 2 (base) + 0 (recall, grade < 3) + 0 (speed) = 8 XP
    expect(res.xp).toBe(8)
    expect(res.totalAttempts).toBe(8)
  })

  it('evaluates round with severe lapses', () => {
    const res = evaluateMatchingGame({ pairs: 4, misses: 7, timeMs: 40000 })
    expect(res.accuracy).toBeCloseTo(0.364, 2)
    expect(res.scorePct).toBe(36)
    expect(res.grade).toBe(1)
    expect(res.xp).toBe(8)
  })
})
