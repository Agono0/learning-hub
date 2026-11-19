import { describe, expect, it } from 'vitest'
import {
  analyzeCategorySetFuzziness,
  calculateCategoryOverlap,
  calculateNormalizedFuzziness,
  calculateShannonBoundaryEntropy,
  classifyFuzzinessBand,
  estimateBoundarySharpness,
  evaluateStimulusMembership,
  predictTypicalityFromProbabilities,
} from '../src/categorization/category-fuzziness'

describe('boundary entropy & fuzziness quantification (Zadeh 1965, Rosch 1975)', () => {
  it('computes Shannon boundary entropy: zero for crisp, 1.0 for binary 50/50', () => {
    // Pure categorical assignment: p = [1.0, 0.0] => H = 0
    expect(calculateShannonBoundaryEntropy([1.0, 0.0])).toBe(0)

    // Maximally ambiguous binary boundary: p = [0.5, 0.5] => H = 1.0
    expect(calculateShannonBoundaryEntropy([0.5, 0.5])).toBeCloseTo(1.0, 4)

    // Intermediate probability: p = [0.8, 0.2]
    const hInter = calculateShannonBoundaryEntropy([0.8, 0.2])
    expect(hInter).toBeGreaterThan(0.5)
    expect(hInter).toBeLessThan(0.8)
  })

  it('normalizes fuzziness into [0, 1] range regardless of category count', () => {
    // 3-category uniform split: p = [1/3, 1/3, 1/3] => normalized fuzziness = 1.0
    const norm3 = calculateNormalizedFuzziness([1 / 3, 1 / 3, 1 / 3], 3)
    expect(norm3).toBeCloseTo(1.0, 4)

    // Single dominating category
    const normCrisp = calculateNormalizedFuzziness([0.98, 0.01, 0.01], 3)
    expect(normCrisp).toBeLessThan(0.15)
  })

  it('maps fuzziness indices into semantic bands', () => {
    expect(classifyFuzzinessBand(0.05)).toBe('crisp')
    expect(classifyFuzzinessBand(0.25)).toBe('low_fuzziness')
    expect(classifyFuzzinessBand(0.5)).toBe('moderate_fuzziness')
    expect(classifyFuzzinessBand(0.75)).toBe('high_fuzziness')
    expect(classifyFuzzinessBand(0.95)).toBe('maximally_ambiguous')
  })

  it('predicts typicality scores (1-7 scale) inversely proportional to fuzziness', () => {
    // Clear prototype member: margin = 0.9, fuzziness = 0.05
    const typHigh = predictTypicalityFromProbabilities({ Bird: 0.95, Mammal: 0.05 }, 0.05)
    expect(typHigh).toBeGreaterThan(5.5)

    // Borderline ambiguous member: margin = 0.05, fuzziness = 0.9
    const typLow = predictTypicalityFromProbabilities({ Bird: 0.52, Mammal: 0.48 }, 0.9)
    expect(typLow).toBeLessThan(2.5)
  })
})

describe('category overlap & boundary sharpness (Mervis & Rosch 1981)', () => {
  it('computes category overlap coefficient', () => {
    const memberships = [
      evaluateStimulusMembership('item-1', { A: 0.95, B: 0.05 }),
      evaluateStimulusMembership('item-2', { A: 0.85, B: 0.15 }),
      evaluateStimulusMembership('item-3', { A: 0.55, B: 0.45 }), // boundary
      evaluateStimulusMembership('item-4', { A: 0.1, B: 0.9 }),
      evaluateStimulusMembership('item-5', { A: 0.02, B: 0.98 }),
    ]

    const overlap = calculateCategoryOverlap('A', 'B', memberships)
    expect(overlap.categoryA).toBe('A')
    expect(overlap.categoryB).toBe('B')
    expect(overlap.overlapCoefficient).toBeGreaterThan(0)
    expect(overlap.overlapCoefficient).toBeLessThan(0.5)
    expect(overlap.sharedBoundaryStimuli).toContain('item-3')
  })

  it('estimates logistic boundary sharpness slope', () => {
    // Sharp boundary: distance moves from -2 to +2 with steep step
    const distances = [-2, -1, -0.2, 0.2, 1, 2]
    const probs = [0.01, 0.05, 0.35, 0.65, 0.95, 0.99]
    const sharpness = estimateBoundarySharpness(distances, probs)

    expect(sharpness.slope).toBeGreaterThan(1.0)
    expect(sharpness.rSquared).toBeGreaterThan(0.8)
    expect(['steep', 'cliff_like', 'gradual']).toContain(sharpness.sharpnessTier)
  })
})

describe('holistic category system analysis', () => {
  it('evaluates entire category set identifying core and borderline stimuli', () => {
    const stimuli = [
      {
        id: 'robin',
        categoryProbabilities: { Bird: 0.98, Mammal: 0.02 },
        empiricalTypicality: 6.8,
      },
      { id: 'eagle', categoryProbabilities: { Bird: 0.9, Mammal: 0.1 }, empiricalTypicality: 6.1 },
      {
        id: 'penguin',
        categoryProbabilities: { Bird: 0.72, Mammal: 0.28 },
        empiricalTypicality: 4.2,
      },
      { id: 'bat', categoryProbabilities: { Bird: 0.48, Mammal: 0.52 }, empiricalTypicality: 2.1 }, // borderline
      { id: 'dog', categoryProbabilities: { Bird: 0.01, Mammal: 0.99 }, empiricalTypicality: 6.9 },
    ]

    const analysis = analyzeCategorySetFuzziness('birds-vs-mammals', stimuli)
    expect(analysis.setId).toBe('birds-vs-mammals')
    expect(analysis.stimulusCount).toBe(5)
    expect(analysis.borderlineStimuli).toContain('bat')
    expect(analysis.crispCoreStimuli).toContain('robin')
    expect(analysis.diagnosticSummary).toContain('borderline')
  })
})
