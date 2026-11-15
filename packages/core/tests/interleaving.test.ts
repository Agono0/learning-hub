import { describe, expect, it } from 'vitest'
import {
  calculateBlockingFactor,
  calculateCategoryEntropy,
  computeInterleavingSchedule,
  generateDiscriminationPrompt,
  type InterleavingItem,
} from '../src/interleaving/index'

describe('Interleaving Practice Scheduler & Discrimination Engine', () => {
  it('calculates entropy and blocking factor correctly', () => {
    // Perfectly blocked sequence
    const blocked = ['math', 'math', 'math', 'history', 'history']
    const blockedFactor = calculateBlockingFactor(blocked)
    expect(blockedFactor).toBe(3 / 4) // 3 repeats out of 4 transitions

    // Interleaved sequence
    const interleaved = ['math', 'history', 'math', 'history', 'code']
    const interleavedFactor = calculateBlockingFactor(interleaved)
    expect(interleavedFactor).toBe(0)

    // Shannon entropy of multi-category sequence
    const entropy = calculateCategoryEntropy(interleaved)
    expect(entropy).toBeGreaterThan(0.9) // high distribution spread
  })

  it('interleaves candidates from different categories and avoids consecutive clustering', () => {
    const items: InterleavingItem[] = [
      { id: '1', categoryId: 'calculus', difficulty: 0.8, urgency: 0.9, title: 'Derivatives' },
      { id: '2', categoryId: 'calculus', difficulty: 0.7, urgency: 0.8, title: 'Integrals' },
      { id: '3', categoryId: 'calculus', difficulty: 0.6, urgency: 0.7, title: 'Series' },
      { id: '4', categoryId: 'linear_algebra', difficulty: 0.5, urgency: 0.6, title: 'Matrices' },
      {
        id: '5',
        categoryId: 'linear_algebra',
        difficulty: 0.6,
        urgency: 0.5,
        title: 'Eigenvalues',
      },
      { id: '6', categoryId: 'probability', difficulty: 0.4, urgency: 0.4, title: 'Bayes Rule' },
    ]

    const result = computeInterleavingSchedule(items, { maxConsecutiveCategory: 1 })

    expect(result.schedule.length).toBe(6)
    // Invariant: no two adjacent items should have the same category
    for (let i = 1; i < result.schedule.length; i++) {
      expect(result.schedule[i].categoryId).not.toBe(result.schedule[i - 1].categoryId)
    }

    expect(result.blockingFactor).toBe(0)
    expect(result.transitionCount).toBe(5)
    expect(result.discriminationPrompts.length).toBe(5)
  })

  it('generates reflective discrimination prompts on category switch', () => {
    const prev: InterleavingItem = {
      id: 'item-a',
      categoryId: 'chemistry',
      difficulty: 0.5,
      urgency: 0.6,
      title: 'Covalent Bonding',
    }
    const curr: InterleavingItem = {
      id: 'item-b',
      categoryId: 'physics',
      difficulty: 0.7,
      urgency: 0.8,
      title: 'Electromagnetic Field',
    }

    const prompt = generateDiscriminationPrompt(prev, curr)
    expect(prompt.sourceCategory).toBe('chemistry')
    expect(prompt.targetCategory).toBe('physics')
    expect(prompt.reflectionPrompt).toContain('chemistry')
    expect(prompt.reflectionPrompt).toContain('physics')
    expect(prompt.discriminationQuestion).toContain('Electromagnetic Field')
  })

  it('handles empty or single-item pools gracefully', () => {
    const emptyResult = computeInterleavingSchedule([])
    expect(emptyResult.schedule).toEqual([])
    expect(emptyResult.categoryEntropy).toBe(0)
    expect(emptyResult.blockingFactor).toBe(0)

    const single: InterleavingItem[] = [
      { id: 'single', categoryId: 'art', difficulty: 0.5, urgency: 0.5, title: 'Color Theory' },
    ]
    const singleResult = computeInterleavingSchedule(single)
    expect(singleResult.schedule.length).toBe(1)
    expect(singleResult.blockingFactor).toBe(0)
  })
})
