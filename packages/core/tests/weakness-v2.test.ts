import { describe, expect, it } from 'vitest'
import {
  detectConfusionPairs,
  calculateTopicRetentionForecast,
  decomposeLeechCard,
  RevlogReviewEntry,
} from '../src/weakness'

describe('weakness-v2', () => {
  describe('detectConfusionPairs', () => {
    it('detects cards that repeatedly fail in close sequence', () => {
      const baseTime = new Date('2026-11-08T10:00:00Z').getTime()
      const events: RevlogReviewEntry[] = [
        // Session 1: card 101 and 102 fail together within 1 minute
        { cardId: 101, grade: 1, createdAt: new Date(baseTime).toISOString() },
        { cardId: 102, grade: 1, createdAt: new Date(baseTime + 30000).toISOString() },
        // Session 2: card 101 and 102 fail together again
        { cardId: 101, grade: 1, createdAt: new Date(baseTime + 3600000).toISOString() },
        { cardId: 102, grade: 1, createdAt: new Date(baseTime + 3600000 + 45000).toISOString() },
        // Card 103 passed
        { cardId: 103, grade: 3, createdAt: new Date(baseTime + 7200000).toISOString() },
      ]

      const previews = new Map<number, string>([
        [101, 'Mitosis vs Meiosis stages'],
        [102, 'Prophase I crossover dynamics'],
      ])

      const pairs = detectConfusionPairs(events, previews, 2, 5 * 60 * 1000)
      expect(pairs).toHaveLength(1)
      expect(pairs[0].cardIdA).toBe(101)
      expect(pairs[0].cardIdB).toBe(102)
      expect(pairs[0].failCoOccurrenceCount).toBe(2)
      expect(pairs[0].interferenceProbability).toBeGreaterThan(0.5)
      expect(pairs[0].contrastPrompt).toContain('Mitosis vs Meiosis')
    })

    it('ignores pairs that fail outside the time window', () => {
      const baseTime = new Date('2026-11-08T10:00:00Z').getTime()
      const events: RevlogReviewEntry[] = [
        { cardId: 201, grade: 1, createdAt: new Date(baseTime).toISOString() },
        // 10 minutes later (default window is 5 min)
        { cardId: 202, grade: 1, createdAt: new Date(baseTime + 10 * 60 * 1000).toISOString() },
      ]
      const previews = new Map<number, string>()
      const pairs = detectConfusionPairs(events, previews, 1, 5 * 60 * 1000)
      expect(pairs).toHaveLength(0)
    })

    it('returns empty array when there are no reviews or no failures', () => {
      expect(detectConfusionPairs([], new Map())).toEqual([])
      const successes: RevlogReviewEntry[] = [
        { cardId: 1, grade: 3, createdAt: new Date().toISOString() },
        { cardId: 2, grade: 4, createdAt: new Date().toISOString() },
      ]
      expect(detectConfusionPairs(successes, new Map())).toEqual([])
    })
  })

  describe('calculateTopicRetentionForecast', () => {
    it('projects future retrievability decay over 7, 14, and 30 days', () => {
      const now = new Date('2026-11-08T12:00:00Z').getTime()
      const decks = [
        { id: 1, name: 'Cell Biology' },
        { id: 2, name: 'Empty Topic' },
      ]
      const cards = [
        // Urgent card (due in past)
        { deckId: 1, stability: 5, due: new Date(now - 86400000).toISOString() },
        // Fresh card due today
        { deckId: 1, stability: 10, due: new Date(now).toISOString() },
      ]

      const forecasts = calculateTopicRetentionForecast(decks, cards, now)
      expect(forecasts).toHaveLength(2)

      const bio = forecasts.find((f) => f.deckId === 1)!
      expect(bio.deckName).toBe('Cell Biology')
      expect(bio.urgentCardsCount).toBe(2) // both due <= now
      expect(bio.currentRetention).toBeLessThanOrEqual(1.0)
      expect(bio.projectedRetention7d).toBeLessThan(bio.currentRetention)
      expect(bio.projectedRetention14d).toBeLessThanOrEqual(bio.projectedRetention7d)
      expect(bio.projectedRetention30d).toBeLessThanOrEqual(bio.projectedRetention14d)

      const empty = forecasts.find((f) => f.deckId === 2)!
      expect(empty.urgentCardsCount).toBe(0)
      expect(empty.currentRetention).toBe(1.0)
    })

    it('models forward decay accurately for cards due in future or with lastReview', () => {
      const now = new Date('2026-11-08T12:00:00Z').getTime()
      const decks = [{ id: 10, name: 'Advanced Physics' }]
      const cards = [
        // Card reviewed 2 days ago, stability 14, due in 12 days
        {
          deckId: 10,
          stability: 14,
          due: new Date(now + 12 * 86400000).toISOString(),
          lastReview: new Date(now - 2 * 86400000).toISOString(),
        },
      ]

      const forecasts = calculateTopicRetentionForecast(decks, cards, now)
      const phys = forecasts[0]
      expect(phys.urgentCardsCount).toBe(0)
      // Card has non-zero decay since review
      expect(phys.currentRetention).toBeLessThan(1.0)
      expect(phys.currentRetention).toBeGreaterThan(0.9)
      expect(phys.projectedRetention7d).toBeLessThan(phys.currentRetention)
      expect(phys.projectedRetention30d).toBeLessThan(phys.projectedRetention7d)
    })
  })

  describe('decomposeLeechCard', () => {
    it('splits bulleted list items cleanly without bullet prefixes', () => {
      const leech = {
        id: 77,
        lapses: 6,
        front: 'What are Newton’s three laws of motion?',
        back: '- 1. Law of Inertia\n- 2. Force equals mass times acceleration\n- 3. Action and reaction are equal and opposite',
      }
      const decomposed = decomposeLeechCard(leech)
      expect(decomposed.candidates).toHaveLength(3)
      expect(decomposed.candidates[0].back).not.toMatch(/^[-*•\d.)\s]/)
      expect(decomposed.candidates[0].back).toBe('Law of Inertia')
    })
    it('splits multi-sentence leech card answers into atomic pieces', () => {
      const leech = {
        id: 42,
        lapses: 7,
        front: 'What are the main functions of the liver?',
        back: 'Filters blood and detoxifies chemicals. Produces bile for digestion. Stores glycogen and iron.',
      }

      const decomposed = decomposeLeechCard(leech)
      expect(decomposed.cardId).toBe(42)
      expect(decomposed.lapses).toBe(7)
      expect(decomposed.candidates.length).toBeGreaterThanOrEqual(3)
      expect(decomposed.candidates[0].format).toBe('basic')
      expect(decomposed.candidates[0].front).toContain('Part 1/3')
      expect(decomposed.candidates[0].back).toBe('Filters blood and detoxifies chemicals')
    })

    it('generates cloze and elaborative interrogation for single-fact leeches', () => {
      const leech = {
        id: 99,
        lapses: 5,
        front: 'What is the SI unit of electric capacitance?',
        back: 'Farad',
      }

      const decomposed = decomposeLeechCard(leech)
      expect(decomposed.cardId).toBe(99)
      expect(decomposed.candidates.length).toBe(2)
      expect(decomposed.candidates[0].format).toBe('cloze')
      expect(decomposed.candidates[0].front).toContain('{{c1::Farad}}')
      expect(decomposed.candidates[1].format).toBe('basic')
      expect(decomposed.candidates[1].front).toContain('Why is')
    })
  })
})
