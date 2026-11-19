import { describe, expect, it } from 'vitest'
import {
  calculateFamilyResemblance,
  calculatePrototypeEuclideanDistance,
  classifyWithPrototypeModel,
  comparePrototypeAndExemplarModels,
  computeCategoryPrototype,
  evaluateStimulusPrototypeDistance,
} from '../src/categorization/prototype-distance'

describe('prototype centroid abstraction (Reed 1972, Rosch 1975)', () => {
  it('computes feature means and variances for category centroid', () => {
    const exemplars = [
      [0.8, 0.6],
      [0.9, 0.8],
      [0.7, 0.7],
    ]
    const prototype = computeCategoryPrototype('Birds', exemplars)

    expect(prototype.category).toBe('Birds')
    expect(prototype.exemplarCount).toBe(3)
    // Mean Dim 0: (0.8 + 0.9 + 0.7) / 3 = 0.8
    expect(prototype.featureMeans[0]).toBeCloseTo(0.8, 3)
    // Mean Dim 1: (0.6 + 0.8 + 0.7) / 3 = 0.7
    expect(prototype.featureMeans[1]).toBeCloseTo(0.7, 3)
    expect(prototype.featureVariances[0]).toBeGreaterThan(0)
  })

  it('computes Euclidean distance to prototype centroid', () => {
    const prototype = {
      category: 'Birds',
      featureMeans: [0.5, 0.5],
      featureVariances: [0.01, 0.01],
      exemplarCount: 10,
    }

    // Distance from [0.5, 0.9] to [0.5, 0.5] is 0.4
    const dist = calculatePrototypeEuclideanDistance([0.5, 0.9], prototype)
    expect(dist).toBeCloseTo(0.4, 4)
  })

  it('classifies stimulus using prototype similarity', () => {
    const prototypes = {
      CategoryA: {
        category: 'CategoryA',
        featureMeans: [0.9, 0.9],
        featureVariances: [0.02, 0.02],
        exemplarCount: 5,
      },
      CategoryB: {
        category: 'CategoryB',
        featureMeans: [0.1, 0.1],
        featureVariances: [0.02, 0.02],
        exemplarCount: 5,
      },
    }

    const { predictedCategory, probabilities } = classifyWithPrototypeModel(
      [0.85, 0.85],
      prototypes,
      3.0,
    )
    expect(predictedCategory).toBe('CategoryA')
    expect(probabilities['CategoryA']).toBeGreaterThan(0.9)
  })
})

describe('Rosch-Mervis family resemblance & typicality gradient', () => {
  it('computes family resemblance score (within-minus-between similarity)', () => {
    const exemplars = [
      { category: 'A', features: [0.9, 0.9] },
      { category: 'A', features: [0.8, 0.85] },
      { category: 'B', features: [0.1, 0.1] },
      { category: 'B', features: [0.2, 0.15] },
    ]

    // Probe right in Category A cluster
    const frA = calculateFamilyResemblance([0.85, 0.88], 'A', exemplars)
    expect(frA).toBeGreaterThan(1.0)

    // Probe in between
    const frMid = calculateFamilyResemblance([0.5, 0.5], 'A', exemplars)
    expect(frMid).toBeLessThan(frA)
  })

  it('evaluates stimulus prototype distance and assigns 1-7 typicality score', () => {
    const prototypes = {
      A: {
        category: 'A',
        featureMeans: [1.0, 1.0],
        featureVariances: [0.01, 0.01],
        exemplarCount: 5,
      },
      B: {
        category: 'B',
        featureMeans: [0.0, 0.0],
        featureVariances: [0.01, 0.01],
        exemplarCount: 5,
      },
    }

    const evalCore = evaluateStimulusPrototypeDistance('core-item', [0.98, 0.98], prototypes)
    expect(evalCore.closestPrototypeCategory).toBe('A')
    expect(evalCore.typicalityScore).toBeGreaterThanOrEqual(6.0)
    expect(evalCore.isPrototypeCore).toBe(true)

    const evalPerimeter = evaluateStimulusPrototypeDistance(
      'perimeter-item',
      [0.55, 0.55],
      prototypes,
    )
    expect(evalPerimeter.typicalityScore).toBeLessThan(4.5)
  })
})

describe('prototype vs exemplar arbitration (Smith & Minda 2000 AIC/BIC)', () => {
  it('arbitrates model preference via AIC and evidence ratio', () => {
    const prototypes = {
      A: {
        category: 'A',
        featureMeans: [0.8, 0.8],
        featureVariances: [0.01, 0.01],
        exemplarCount: 2,
      },
      B: {
        category: 'B',
        featureMeans: [0.2, 0.2],
        featureVariances: [0.01, 0.01],
        exemplarCount: 2,
      },
    }
    const exemplars = [
      { id: 'exA1', category: 'A', features: [0.8, 0.8] },
      { id: 'exA2', category: 'A', features: [0.85, 0.75] },
      { id: 'exB1', category: 'B', features: [0.2, 0.2] },
      { id: 'exB2', category: 'B', features: [0.15, 0.25] },
    ]

    const trials = [
      { features: [0.82, 0.78], participantChoice: 'A' },
      { features: [0.18, 0.22], participantChoice: 'B' },
    ]

    const comparison = comparePrototypeAndExemplarModels(trials, prototypes, exemplars)
    expect(['prototype', 'exemplar', 'undifferentiated']).toContain(comparison.preferredModel)
    expect(comparison.evidenceRatio).toBeGreaterThanOrEqual(1.0)
    expect(comparison.subsystemSummary).toBeTruthy()
  })
})
