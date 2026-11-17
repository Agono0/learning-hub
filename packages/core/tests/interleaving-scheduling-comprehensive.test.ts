import { describe, expect, it } from 'vitest'
import {
  calculateBlockingFactor,
  calculateCategoryEntropy,
  computeInterleavingSchedule,
  generateDiscriminationPrompt,
  interleavingResultSchema,
  type InterleavingItem,
} from '../src/interleaving/index.js'

describe('Rohrer-Taylor Interleaving & Discrimination Comprehensive Suite', () => {
  describe('Shannon Category Entropy Calculations', () => {
    it('returns 1.0 for perfectly balanced multi-category distributions', () => {
      // 4 categories, equal counts: 2 each -> max entropy
      const categories = ['Math', 'Bio', 'Code', 'Hist', 'Math', 'Bio', 'Code', 'Hist']
      const entropy = calculateCategoryEntropy(categories)
      expect(entropy).toBeCloseTo(1.0, 2)
    })

    it('returns 0.0 for homogeneous single-category distributions', () => {
      const single = ['Math', 'Math', 'Math', 'Math']
      expect(calculateCategoryEntropy(single)).toBe(0.0)
    })

    it('returns intermediate entropy for skewed distributions', () => {
      const skewed = ['Math', 'Math', 'Math', 'Math', 'Bio']
      const entropy = calculateCategoryEntropy(skewed)
      expect(entropy).toBeGreaterThan(0.0)
      expect(entropy).toBeLessThan(0.8)
    })

    it('handles empty or single item lists gracefully', () => {
      expect(calculateCategoryEntropy([])).toBe(0.0)
      expect(calculateCategoryEntropy(['Math'])).toBe(0.0)
    })
  })

  describe('Blocking Factor Calculations (Rohrer & Taylor 2007)', () => {
    it('returns 1.0 for purely blocked sequences', () => {
      const blocked = ['Math', 'Math', 'Math', 'Bio', 'Bio', 'Bio']
      expect(calculateBlockingFactor(blocked)).toBe(0.8)
      const pureBlocked = ['Math', 'Math', 'Math', 'Math']
      expect(calculateBlockingFactor(pureBlocked)).toBe(1.0)
    })

    it('returns 0.0 for completely interleaved sequences with zero adjacent repeats', () => {
      const interleaved = ['Math', 'Bio', 'Code', 'Hist', 'Math', 'Bio']
      expect(calculateBlockingFactor(interleaved)).toBe(0.0)
    })

    it('handles short lists gracefully', () => {
      expect(calculateBlockingFactor([])).toBe(0.0)
      expect(calculateBlockingFactor(['A'])).toBe(0.0)
    })
  })

  describe('Interleaved Schedule Computation Engine', () => {
    const candidatePool: InterleavingItem[] = [
      {
        id: 'm1',
        categoryId: 'Mathematics',
        difficulty: 0.7,
        urgency: 0.9,
        title: 'Calculus derivatives',
      },
      {
        id: 'm2',
        categoryId: 'Mathematics',
        difficulty: 0.5,
        urgency: 0.8,
        title: 'Matrix multiplication',
      },
      { id: 'm3', categoryId: 'Mathematics', difficulty: 0.6, urgency: 0.7, title: 'Eigenvalues' },
      {
        id: 'b1',
        categoryId: 'Biology',
        difficulty: 0.4,
        urgency: 0.85,
        title: 'Cell respiration',
      },
      {
        id: 'b2',
        categoryId: 'Biology',
        difficulty: 0.6,
        urgency: 0.75,
        title: 'Synaptic vesicles',
      },
      { id: 'c1', categoryId: 'ComputerScience', difficulty: 0.8, urgency: 0.95, title: 'B-Trees' },
      {
        id: 'c2',
        categoryId: 'ComputerScience',
        difficulty: 0.5,
        urgency: 0.6,
        title: 'Quicksort',
      },
      {
        id: 'h1',
        categoryId: 'History',
        difficulty: 0.3,
        urgency: 0.5,
        title: 'Industrial revolution',
      },
    ]

    it('enforces maxConsecutiveCategory = 1 strict interleaving constraint', () => {
      const result = computeInterleavingSchedule(candidatePool, {
        maxConsecutiveCategory: 1,
        targetCount: 6,
        urgencyWeight: 0.6,
      })

      expect(interleavingResultSchema.safeParse(result).success).toBe(true)
      expect(result.schedule).toHaveLength(6)

      // Verify no two adjacent items share the same category
      for (let i = 1; i < result.schedule.length; i++) {
        expect(result.schedule[i]!.categoryId).not.toBe(result.schedule[i - 1]!.categoryId)
      }

      expect(result.blockingFactor).toBe(0.0)
      expect(result.categoryEntropy).toBeGreaterThan(0.7)
    })

    it('respects target count and exhausts available candidates', () => {
      const result = computeInterleavingSchedule(candidatePool, {
        targetCount: 4,
      })
      expect(result.schedule).toHaveLength(4)
    })

    it('handles empty pool input gracefully', () => {
      const result = computeInterleavingSchedule([])
      expect(result.schedule).toHaveLength(0)
      expect(result.categoryEntropy).toBe(0)
      expect(result.blockingFactor).toBe(0)
      expect(result.transitionCount).toBe(0)
    })

    it('generates contrastive metacognitive discrimination prompts on category switches', () => {
      const itemA: InterleavingItem = {
        id: '1',
        categoryId: 'Integration',
        difficulty: 0.7,
        urgency: 0.8,
        title: 'Integration by Parts',
      }
      const itemB: InterleavingItem = {
        id: '2',
        categoryId: 'DifferentialEquations',
        difficulty: 0.8,
        urgency: 0.9,
        title: 'Separable First-Order ODE',
      }

      const prompt = generateDiscriminationPrompt(itemA, itemB)
      expect(prompt.sourceCategory).toBe('Integration')
      expect(prompt.targetCategory).toBe('DifferentialEquations')
      expect(prompt.reflectionPrompt).toContain('Notice the shift')
      expect(prompt.discriminationQuestion).toContain('What key discriminating feature')
    })
  })
})
