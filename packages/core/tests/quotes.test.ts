import { describe, it, expect } from 'vitest'
import { dailyQuote, milestoneQuote, MILESTONE_TAGS, type QuoteLike } from '../src/quotes'

describe('Quotes Selection Logic', () => {
  const sampleQuotes: QuoteLike[] = [
    {
      id: 1,
      text: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.',
      author: 'Will Durant',
      tags: ['discipline', 'habits'],
    },
    {
      id: 2,
      text: 'Live as if you were to die tomorrow. Learn as if you were to live forever.',
      author: 'Mahatma Gandhi',
      tags: ['learning', 'persistence'],
    },
    {
      id: 3,
      text: 'The impediment to action advances action. What stands in the way becomes the way.',
      author: 'Marcus Aurelius',
      tags: ['persistence', 'adversity'],
    },
    {
      id: 4,
      text: 'An investment in knowledge pays the best interest.',
      author: 'Benjamin Franklin',
      tags: ['mastery', 'wisdom'],
    },
  ]

  describe('dailyQuote', () => {
    it('picks deterministically for the same date string', () => {
      const q1 = dailyQuote(sampleQuotes, '2026-11-09')
      const q2 = dailyQuote(sampleQuotes, '2026-11-09')
      expect(q1).toEqual(q2)
      expect(q1.text).toBeDefined()
    })

    it('works with Date objects', () => {
      const date = new Date('2026-11-09T14:30:00Z')
      const q = dailyQuote(sampleQuotes, date)
      expect(q).toBeDefined()
      expect(sampleQuotes).toContain(q)
    })

    it('throws when the quotes pool is empty', () => {
      expect(() => dailyQuote([], '2026-11-09')).toThrow('no quotes available')
    })

    it('rotates quotes predictably across different dates', () => {
      const picks = new Set<number>()
      for (let day = 1; day <= 20; day++) {
        const d = `2026-11-${String(day).padStart(2, '0')}`
        const q = dailyQuote(sampleQuotes, d)
        if (q.id) picks.add(q.id)
      }
      expect(picks.size).toBeGreaterThan(1)
    })
  })

  describe('milestoneQuote', () => {
    it('prefers quotes matching milestone tags for level-up', () => {
      const q = milestoneQuote(sampleQuotes, 'level-up')
      expect(q).toBeDefined()
      // level-up prefers ['mastery', 'discipline']
      const hasPreferredTag = (q.tags ?? []).some((t) => MILESTONE_TAGS['level-up']?.includes(t))
      expect(hasPreferredTag).toBe(true)
    })

    it('prefers quotes matching milestone tags for streak', () => {
      const q = milestoneQuote(sampleQuotes, 'streak')
      expect(q).toBeDefined()
      // streak prefers ['persistence', 'discipline']
      const hasPreferredTag = (q.tags ?? []).some((t) => MILESTONE_TAGS['streak']?.includes(t))
      expect(hasPreferredTag).toBe(true)
    })

    it('falls back to the whole quotes pool when no tagged quotes match', () => {
      const untaggedQuotes: QuoteLike[] = [
        {
          id: 10,
          text: 'Nature does not hurry, yet everything is accomplished.',
          author: 'Lao Tzu',
          tags: ['nature'],
        },
      ]
      const q = milestoneQuote(untaggedQuotes, 'level-up')
      expect(q.id).toBe(10)
    })

    it('throws when the milestone quotes pool is empty', () => {
      expect(() => milestoneQuote([], 'streak')).toThrow('no quotes available')
    })

    it('is deterministic for the same milestone kind', () => {
      const pick1 = milestoneQuote(sampleQuotes, 'achievement')
      const pick2 = milestoneQuote(sampleQuotes, 'achievement')
      expect(pick1).toEqual(pick2)
    })
  })
})
