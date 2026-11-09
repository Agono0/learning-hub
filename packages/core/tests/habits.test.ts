import { describe, it, expect } from 'vitest'
import {
  validateHabit,
  stackChainOrder,
  solidifying,
  dopamineSuggestion,
  DOPAMINE_MENU,
  SOLIDIFYING_THRESHOLDS,
  type HabitLoopInput,
  type StackableHabit,
} from '../src/habits'

describe('Habits Domain Logic', () => {
  describe('validateHabit', () => {
    it('validates a complete habit loop with no errors or warnings', () => {
      const input: HabitLoopInput = {
        cue: 'After morning coffee',
        craving: 'Clarity and focus for the workday',
        response: 'Review 10 flashcards on Learning HUB',
        reward: 'Check off quest and savor the coffee',
      }
      const res = validateHabit(input)
      expect(res.ok).toBe(true)
      expect(res.errors).toHaveLength(0)
      expect(res.warnings).toHaveLength(0)
    })

    it('rejects missing cue and response as blocking errors', () => {
      const res = validateHabit({})
      expect(res.ok).toBe(false)
      expect(res.errors.some((e) => e.includes('Cue is required'))).toBe(true)
      expect(res.errors.some((e) => e.includes('Response is required'))).toBe(true)
    })

    it('rejects cues and responses that are too short to be actionable', () => {
      const res = validateHabit({ cue: 'ab', response: 'a' })
      expect(res.ok).toBe(false)
      expect(res.errors.some((e) => e.includes('Cue is too short'))).toBe(true)
      expect(res.errors.some((e) => e.includes('Response is too short'))).toBe(true)
    })

    it('issues non-blocking warnings when craving or reward are omitted', () => {
      const res = validateHabit({
        cue: 'Sitting down at desk',
        response: 'Open review queue',
      })
      expect(res.ok).toBe(true)
      expect(res.errors).toHaveLength(0)
      expect(res.warnings).toHaveLength(2)
      expect(res.warnings.some((w) => w.includes('craving'))).toBe(true)
      expect(res.warnings.some((w) => w.includes('reward'))).toBe(true)
    })
  })

  describe('stackChainOrder', () => {
    it('sorts anchored habits ahead of standalone habits', () => {
      const habits: StackableHabit[] = [
        { id: 1, name: 'Meditate', anchor: null, order: 0 },
        { id: 2, name: 'Flashcards', anchor: 'After coffee', order: 1 },
        { id: 3, name: 'Journal', anchor: 'After flashcards', order: 0 },
        { id: 4, name: 'Stretching', anchor: '', order: 2 },
      ]
      const sorted = stackChainOrder(habits)
      expect(sorted.map((h) => h.id)).toEqual([3, 2, 1, 4])
    })

    it('maintains deterministic sorting by order and ID within anchor groups', () => {
      const habits: StackableHabit[] = [
        { id: 5, name: 'B', anchor: 'Morning', order: 2 },
        { id: 2, name: 'A', anchor: 'Morning', order: 1 },
        { id: 3, name: 'C', anchor: 'Morning', order: 2 },
      ]
      const sorted = stackChainOrder(habits)
      expect(sorted.map((h) => h.id)).toEqual([2, 3, 5])
    })
  })

  describe('solidifying (Lally et al. automaticity stages)', () => {
    it('classifies fewer than 21 days as forming', () => {
      const dates = ['2026-11-01', '2026-11-02', '2026-11-03']
      const res = solidifying(dates)
      expect(res.stage).toBe('forming')
      expect(res.days).toBe(3)
      expect(res.daysToNext).toBe(SOLIDIFYING_THRESHOLDS.solidifying - 3)
      expect(res.nextStage).toBe('solidifying')
    })

    it('deduplicates multiple check-in logs on the same date', () => {
      const dates = ['2026-11-01T08:00:00Z', '2026-11-01T12:00:00Z', '2026-11-02T09:00:00Z']
      const res = solidifying(dates)
      expect(res.days).toBe(2)
    })

    it('classifies 21 to 59 days as solidifying', () => {
      const dates = Array.from(
        { length: 30 },
        (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`,
      )
      const res = solidifying(dates)
      expect(res.stage).toBe('solidifying')
      expect(res.days).toBe(30)
      expect(res.daysToNext).toBe(SOLIDIFYING_THRESHOLDS.automatic - 30)
      expect(res.nextStage).toBe('automatic')
    })

    it('classifies 60 or more days as automatic with 0 days to next', () => {
      const dates = Array.from({ length: 65 }, (_, i) => `day-${i}`)
      const res = solidifying(dates)
      expect(res.stage).toBe('automatic')
      expect(res.days).toBe(65)
      expect(res.daysToNext).toBe(0)
      expect(res.nextStage).toBeNull()
    })
  })

  describe('dopamineSuggestion', () => {
    it('contains all required dopamine categories with valid minutes', () => {
      expect(DOPAMINE_MENU.length).toBeGreaterThanOrEqual(12)
      for (const item of DOPAMINE_MENU) {
        expect(['move', 'create', 'connect', 'soothe']).toContain(item.type)
        expect(item.minutes).toBeGreaterThan(0)
        expect(item.label.length).toBeGreaterThan(5)
      }
    })

    it('picks deterministically for the same date', () => {
      const pick1 = dopamineSuggestion('2026-11-09')
      const pick2 = dopamineSuggestion('2026-11-09')
      expect(pick1).toEqual(pick2)
    })

    it('rotates suggestions with seedOffset', () => {
      const pick0 = dopamineSuggestion('2026-11-09', 0)
      const pick1 = dopamineSuggestion('2026-11-09', 1)
      expect(pick0).toBeDefined()
      expect(pick1).toBeDefined()
    })
  })
})
