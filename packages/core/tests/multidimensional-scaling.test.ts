import { describe, expect, it } from 'vitest'
import {
  calculateKruskalStress,
  classicalMds,
  classifyKruskalStress,
  confusionMatrixToDissimilarity,
  doubleCenterDistanceMatrix,
  featureVectorsToDissimilarity,
  isotonicRegressionPAVA,
  performMultidimensionalScaling,
  symmetricEigenDecomposition,
} from '../src/categorization/multidimensional-scaling'

describe('classical metric MDS (Torgerson 1952, Gower 1966)', () => {
  it('double centers a squared distance matrix preserving zero diagonals', () => {
    // 3 points in 1D at positions 0, 1, 3
    // Distances: (0,1)=1, (0,3)=3, (1,3)=2
    // D^2:
    // [0, 1, 9]
    // [1, 0, 4]
    // [9, 4, 0]
    const D2 = [
      [0, 1, 9],
      [1, 0, 4],
      [9, 4, 0],
    ]
    const B = doubleCenterDistanceMatrix(D2)
    expect(B).toHaveLength(3)

    // Row sums of double centered matrix B must equal zero
    for (let i = 0; i < 3; i++) {
      const rowSum = B[i]!.reduce((sum, v) => sum + v, 0)
      expect(Math.abs(rowSum)).toBeLessThan(1e-10)
    }
  })

  it('computes symmetric eigendecomposition matching analytical coordinates', () => {
    // Symmetric positive semi-definite matrix
    const matrix = [
      [2, 1],
      [1, 2],
    ]
    const { eigenvalues, eigenvectors } = symmetricEigenDecomposition(matrix, 2)
    expect(eigenvalues).toHaveLength(2)
    expect(eigenvectors).toHaveLength(2)
    // Dominant eigenvalue of [[2, 1], [1, 2]] is 3, second is 1
    expect(eigenvalues[0]).toBeCloseTo(3, 1)
    expect(eigenvalues[1]).toBeCloseTo(1, 1)
  })

  it('recovers 2D relative spatial positions from an exact distance matrix', () => {
    // 4 points on a 2D rectangle: (0,0), (2,0), (2,1), (0,1)
    const points = [
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
    ]
    const distMatrix = featureVectorsToDissimilarity(points)
    const result = classicalMds(distMatrix, 2)

    expect(result.coordinates).toHaveLength(4)
    expect(result.totalVarianceExplained).toBeGreaterThan(0.99)

    // Inter-point distances in recovered space should match original distances
    const d01Recovered = Math.hypot(
      result.coordinates[0]![0]! - result.coordinates[1]![0]!,
      result.coordinates[0]![1]! - result.coordinates[1]![1]!,
    )
    expect(d01Recovered).toBeCloseTo(2.0, 1)
  })
})

describe('monotone regression & Kruskal Stress-1 (Shepard 1962, Kruskal 1964)', () => {
  it('corrects non-monotonic sequence using PAVA', () => {
    // Input pairs with a monotonicity violation
    const pairs = [
      { observed: 1.0, distance: 2.5, index: 0 },
      { observed: 2.0, distance: 1.5, index: 1 }, // violator: distance decreases while observed increases
      { observed: 3.0, distance: 4.0, index: 2 },
    ]
    const disparities = isotonicRegressionPAVA(pairs)
    expect(disparities).toHaveLength(3)
    // Disparities must be monotonically non-decreasing
    expect(disparities[0]).toBeLessThanOrEqual(disparities[1]!)
    expect(disparities[1]).toBeLessThanOrEqual(disparities[2]!)
    // First two elements should be merged to their average (2.5 + 1.5) / 2 = 2.0
    expect(disparities[0]).toBeCloseTo(2.0, 4)
    expect(disparities[1]).toBeCloseTo(2.0, 4)
  })

  it('computes Kruskal Stress-1 correctly', () => {
    const distances = [2.0, 4.0]
    const disparities = [2.0, 4.0] // perfect fit
    expect(calculateKruskalStress(distances, disparities)).toBe(0)

    const imperfectDisparities = [1.0, 5.0]
    const stress = calculateKruskalStress(distances, imperfectDisparities)
    expect(stress).toBeGreaterThan(0)
    expect(stress).toBeLessThan(0.5)
  })

  it('classifies stress into psychometric fit tiers', () => {
    expect(classifyKruskalStress(0.01)).toBe('perfect')
    expect(classifyKruskalStress(0.04)).toBe('excellent')
    expect(classifyKruskalStress(0.08)).toBe('good')
    expect(classifyKruskalStress(0.15)).toBe('fair')
    expect(classifyKruskalStress(0.25)).toBe('poor')
  })
})

describe('full multidimensional scaling & psychological space recovery', () => {
  it('runs MDS optimization and returns converged low-stress coordinates', () => {
    // Square configuration: 4 stimuli
    const D = [
      [0.0, 1.0, 1.414, 1.0],
      [1.0, 0.0, 1.0, 1.414],
      [1.414, 1.0, 0.0, 1.0],
      [1.0, 1.414, 1.0, 0.0],
    ]
    const mds = performMultidimensionalScaling(D, {
      targetDimensions: 2,
      maxIterations: 100,
    })

    expect(mds.dimensionCount).toBe(2)
    expect(mds.coordinates).toHaveLength(4)
    expect(mds.stress).toBeLessThan(0.05)
    expect(mds.shepardPoints).toHaveLength(6) // 4 choose 2 = 6 pairs
  })

  it('converts stimulus confusion matrices to psychological space (Shepard 1957, 1987)', () => {
    const confusion = {
      labels: ['StimulusA', 'StimulusB', 'StimulusC'],
      probabilities: [
        [0.85, 0.12, 0.03],
        [0.10, 0.82, 0.08],
        [0.02, 0.07, 0.91],
      ],
    }
    const { labels, dissimilarityMatrix } = confusionMatrixToDissimilarity(confusion)
    expect(labels).toEqual(['StimulusA', 'StimulusB', 'StimulusC'])
    expect(dissimilarityMatrix).toHaveLength(3)
    // Diagonal must be 0
    expect(dissimilarityMatrix[0]![0]).toBe(0)
    // A and B have high mutual confusion => low psychological distance
    // A and C have low mutual confusion => high psychological distance
    expect(dissimilarityMatrix[0]![1]).toBeLessThan(dissimilarityMatrix[0]![2]!)
  })
})
