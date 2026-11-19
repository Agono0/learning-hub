/**
 * Multidimensional Scaling (MDS) & Psychological Space Recovery
 *
 * Grounded in:
 * - Roger N. Shepard (1962) "The analysis of proximities: Multidimensional
 *   scaling with an unknown distance function." Psychometrika 27: 125-140.
 * - Roger N. Shepard (1987) "Toward a universal law of generalization for
 *   psychological science." Science 237: 1317-1323.
 * - Joseph B. Kruskal (1964) "Multidimensional scaling by optimizing
 *   goodness of fit to a nonmetric hypothesis." Psychometrika 29: 1-27.
 * - Warren S. Torgerson (1952) "Multidimensional scaling: I. Theory and
 *   method." Psychometrika 17: 401-419.
 *
 * Recovers metric psychological coordinates from empirical proximity,
 * confusion, or dissimilarity matrices via classical (Torgerson-Gower)
 * double centering and non-metric Shepard-Kruskal stress optimization.
 */

import { z } from 'zod'

// ── Zod Schemas ──────────────────────────────────────────────────────────────

export const mdsMetricTypeSchema = z.enum(['euclidean', 'manhattan', 'minkowski'])
export type MdsMetricType = z.infer<typeof mdsMetricTypeSchema>

export const mdsConfigurationSchema = z.object({
  targetDimensions: z.number().int().min(1).max(10).default(2),
  maxIterations: z.number().int().min(10).max(2000).default(300),
  stressTolerance: z.number().min(1e-7).max(0.1).default(1e-5),
  learningRate: z.number().min(0.001).max(1.0).default(0.15),
  metric: mdsMetricTypeSchema.default('euclidean'),
  minkowskiP: z.number().min(1).max(5).default(2),
  randomSeed: z.number().int().optional(),
})
export type MdsConfiguration = z.infer<typeof mdsConfigurationSchema>

export const shepardPointSchema = z.object({
  i: z.number().int(),
  j: z.number().int(),
  observedDissimilarity: z.number(),
  fittedDistance: z.number(),
  monotoneDisparity: z.number(),
})
export type ShepardPoint = z.infer<typeof shepardPointSchema>

export const mdsResultSchema = z.object({
  coordinates: z.array(z.array(z.number())),
  dimensionCount: z.number().int(),
  stress: z.number(),
  stressCategory: z.enum(['perfect', 'excellent', 'good', 'fair', 'poor']),
  varianceExplained: z.array(z.number()),
  totalVarianceExplained: z.number(),
  iterations: z.number().int(),
  converged: z.boolean(),
  shepardPoints: z.array(shepardPointSchema),
})
export type MdsResult = z.infer<typeof mdsResultSchema>

export const stimulusConfusionMatrixSchema = z.object({
  labels: z.array(z.string()).min(2),
  probabilities: z.array(z.array(z.number().min(0).max(1))),
})
export type StimulusConfusionMatrix = z.infer<typeof stimulusConfusionMatrixSchema>

// ── Classical Metric MDS (Torgerson 1952, Gower 1966) ────────────────────────

/**
 * Perform double centering on a squared distance matrix.
 * B = -0.5 * H * D^(2) * H
 * where H = I - (1/n) * 1 * 1^T is the centering matrix.
 */
export function doubleCenterDistanceMatrix(squaredDistances: number[][]): number[][] {
  const n = squaredDistances.length
  if (n === 0) return []

  const rowMeans = new Array<number>(n).fill(0)
  const colMeans = new Array<number>(n).fill(0)
  let grandMean = 0

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const val = squaredDistances[i]![j]!
      rowMeans[i] += val
      colMeans[j] += val
      grandMean += val
    }
  }

  for (let i = 0; i < n; i++) rowMeans[i] /= n
  for (let j = 0; j < n; j++) colMeans[j] /= n
  grandMean /= n * n

  const B: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      B[i]![j] = -0.5 * (squaredDistances[i]![j]! - rowMeans[i]! - colMeans[j]! + grandMean)
    }
  }

  return B
}

/**
 * Compute the dominant eigenvalues and eigenvectors of a symmetric matrix B
 * using power iteration with Hotelling deflation.
 */
export function symmetricEigenDecomposition(
  matrix: number[][],
  components: number,
  maxIterations = 500,
  epsilon = 1e-9,
): { eigenvalues: number[]; eigenvectors: number[][] } {
  const n = matrix.length
  const k = Math.min(components, n)
  const eigenvalues: number[] = []
  const eigenvectors: number[][] = []

  // Deep clone matrix for deflation
  const A: number[][] = matrix.map((row) => [...row])

  for (let c = 0; c < k; c++) {
    // Deterministic pseudo-random initialization vector
    let v = Array.from({ length: n }, (_, idx) => Math.sin((c + 1) * 31 + idx * 17) + 0.5)
    const norm = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0)) || 1
    v = v.map((val) => val / norm)

    let lambda = 0
    let iter = 0
    while (iter < maxIterations) {
      // Multiply: w = A * v
      const w = new Array<number>(n).fill(0)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          w[i] += A[i]![j]! * v[j]!
        }
      }

      // Rayleigh quotient
      const newLambda = v.reduce((sum, val, idx) => sum + val * w[idx]!, 0)
      const newNorm = Math.sqrt(w.reduce((sum, val) => sum + val * val, 0)) || 1
      const newV = w.map((val) => val / newNorm)

      // Convergence check
      let diff = 0
      for (let i = 0; i < n; i++) {
        diff += Math.abs(newV[i]! - v[i]!)
      }

      v = newV
      lambda = newLambda
      iter++
      if (diff < epsilon && iter > 5) break
    }

    eigenvalues.push(Math.max(0, lambda))
    eigenvectors.push(v)

    // Deflate: A = A - lambda * (v * v^T)
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        A[i]![j] -= lambda * v[i]! * v[j]!
      }
    }
  }

  return { eigenvalues, eigenvectors }
}

/**
 * Classical Metric Multidimensional Scaling (Principal Coordinate Analysis).
 * Reconstructs continuous coordinates in targetDimensions from a symmetric
 * distance matrix D.
 */
export function classicalMds(
  dissimilarityMatrix: number[][],
  targetDimensions = 2,
): {
  coordinates: number[][]
  varianceExplained: number[]
  totalVarianceExplained: number
} {
  const n = dissimilarityMatrix.length
  if (n <= 1) {
    return {
      coordinates: dissimilarityMatrix.map(() => new Array(targetDimensions).fill(0)),
      varianceExplained: new Array(targetDimensions).fill(0),
      totalVarianceExplained: 0,
    }
  }

  // Form squared distance matrix
  const D2: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => Math.pow(dissimilarityMatrix[i]![j]!, 2)),
  )

  const B = doubleCenterDistanceMatrix(D2)
  const { eigenvalues, eigenvectors } = symmetricEigenDecomposition(B, targetDimensions)

  const totalPositiveEigen = eigenvalues.reduce((sum, l) => sum + Math.max(0, l), 0) || 1
  const varianceExplained = eigenvalues.map((l) => Math.max(0, l) / totalPositiveEigen)
  const totalVarianceExplained = varianceExplained.reduce((sum, val) => sum + val, 0)

  // X = E * sqrt(Lambda)
  const coordinates: number[][] = Array.from({ length: n }, () =>
    new Array(targetDimensions).fill(0),
  )
  for (let dim = 0; dim < targetDimensions; dim++) {
    const scale = Math.sqrt(Math.max(0, eigenvalues[dim] ?? 0))
    const vec = eigenvectors[dim]
    if (vec) {
      for (let i = 0; i < n; i++) {
        coordinates[i]![dim] = vec[i]! * scale
      }
    }
  }

  return { coordinates, varianceExplained, totalVarianceExplained }
}

// ── Kruskal Non-Metric MDS & Monotone Regression (PAVA) ───────────────────────

/**
 * Pool Adjacent Violators Algorithm (PAVA) for isotonic regression.
 * Fits monotonic disparities d̂_ij to input dissimilarities while preserving
 * rank order (Kruskal 1964).
 */
export function isotonicRegressionPAVA(
  pairs: Array<{ observed: number; distance: number; index: number }>,
): number[] {
  // Sort pairs by observed dissimilarity
  const sorted = [...pairs].sort((a, b) => a.observed - b.observed)
  const m = sorted.length
  if (m === 0) return []

  // Blocks of violators: { weight, sum, value, indices }
  interface Block {
    weight: number
    sum: number
    value: number
    indices: number[]
  }

  const blocks: Block[] = []
  for (let i = 0; i < m; i++) {
    const item = sorted[i]!
    let curr: Block = {
      weight: 1,
      sum: item.distance,
      value: item.distance,
      indices: [item.index],
    }

    while (blocks.length > 0) {
      const prev = blocks[blocks.length - 1]!
      if (prev.value <= curr.value) break
      // Violator detected: merge with previous block
      blocks.pop()
      const mergedWeight = prev.weight + curr.weight
      const mergedSum = prev.sum + curr.sum
      curr = {
        weight: mergedWeight,
        sum: mergedSum,
        value: mergedSum / mergedWeight,
        indices: [...prev.indices, ...curr.indices],
      }
    }
    blocks.push(curr)
  }

  const result = new Array<number>(m).fill(0)
  for (const block of blocks) {
    for (const originalIdx of block.indices) {
      result[originalIdx] = block.value
    }
  }

  return result
}

/**
 * Compute Euclidean distance between two coordinate vectors.
 */
export function vectorDistance(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!
    sum += diff * diff
  }
  return Math.sqrt(sum)
}

/**
 * Kruskal's Stress Formula 1:
 * Stress-1 = sqrt( sum( (d_ij - d̂_ij)^2 ) / sum( d_ij^2 ) )
 */
export function calculateKruskalStress(distances: number[], disparities: number[]): number {
  if (distances.length === 0) return 0
  let numerator = 0
  let denominator = 0

  for (let k = 0; k < distances.length; k++) {
    const d = distances[k]!
    const dHat = disparities[k]!
    const diff = d - dHat
    numerator += diff * diff
    denominator += d * d
  }

  if (denominator <= 1e-12) return 0
  return Math.sqrt(numerator / denominator)
}

/**
 * Classify Kruskal's Stress-1 into standard psychometric evaluation bands
 * (Kruskal 1964):
 * Perfect: < 0.025
 * Excellent: 0.025 - 0.05
 * Good: 0.05 - 0.10
 * Fair: 0.10 - 0.20
 * Poor: > 0.20
 */
export function classifyKruskalStress(stress: number): MdsResult['stressCategory'] {
  if (stress < 0.025) return 'perfect'
  if (stress < 0.05) return 'excellent'
  if (stress < 0.1) return 'good'
  if (stress < 0.2) return 'fair'
  return 'poor'
}

/**
 * Full Multidimensional Scaling with classical initialization and
 * iterative non-metric gradient refinement (Shepard 1962, Kruskal 1964).
 */
export function performMultidimensionalScaling(
  dissimilarityMatrix: number[][],
  configPartial?: Partial<MdsConfiguration>,
): MdsResult {
  const config = mdsConfigurationSchema.parse(configPartial ?? {})
  const n = dissimilarityMatrix.length

  if (n <= 1) {
    return {
      coordinates: n === 1 ? [new Array(config.targetDimensions).fill(0)] : [],
      dimensionCount: config.targetDimensions,
      stress: 0,
      stressCategory: 'perfect',
      varianceExplained: new Array(config.targetDimensions).fill(1),
      totalVarianceExplained: 1,
      iterations: 0,
      converged: true,
      shepardPoints: [],
    }
  }

  // 1. Classical MDS initialization
  const initial = classicalMds(dissimilarityMatrix, config.targetDimensions)
  const coordinates = initial.coordinates.map((row) => [...row])

  // Collect pairs (i < j)
  interface PairInfo {
    i: number
    j: number
    observed: number
    pairIndex: number
  }
  const pairList: PairInfo[] = []
  let pairCount = 0
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairList.push({
        i,
        j,
        observed: dissimilarityMatrix[i]![j]!,
        pairIndex: pairCount++,
      })
    }
  }

  let prevStress = 1.0
  let currentStress = 1.0
  let iterations = 0
  let converged = false
  let finalDisparities: number[] = []
  let finalDistances: number[] = []

  // 2. Iterative gradient descent for Stress-1 minimization
  for (let iter = 0; iter < config.maxIterations; iter++) {
    iterations = iter + 1

    // Current distances
    const distances = pairList.map((p) => vectorDistance(coordinates[p.i]!, coordinates[p.j]!))

    // PAVA monotonic regression
    const pavaInputs = pairList.map((p, idx) => ({
      observed: p.observed,
      distance: distances[idx]!,
      index: idx,
    }))
    const disparities = isotonicRegressionPAVA(pavaInputs)
    currentStress = calculateKruskalStress(distances, disparities)

    if (Math.abs(prevStress - currentStress) < config.stressTolerance) {
      converged = true
      finalDisparities = disparities
      finalDistances = distances
      break
    }
    prevStress = currentStress
    finalDisparities = disparities
    finalDistances = distances

    // Compute gradients: dStress/dx_ia
    // Using Kruskal's normalized gradient update
    const gradients: number[][] = Array.from({ length: n }, () =>
      new Array(config.targetDimensions).fill(0),
    )

    let sumSqDist = 0
    let sumSqDiff = 0
    for (let k = 0; k < pairCount; k++) {
      const d = distances[k]!
      const dHat = disparities[k]!
      sumSqDist += d * d
      sumSqDiff += (d - dHat) * (d - dHat)
    }

    const s = Math.sqrt(sumSqDiff / (sumSqDist || 1))
    const factorNum = sumSqDist > 0 ? 1 / (s * sumSqDist) : 0

    for (let k = 0; k < pairCount; k++) {
      const p = pairList[k]!
      const d = distances[k]!
      const dHat = disparities[k]!
      if (d < 1e-10) continue

      const diff = d - dHat
      const gradTerm = factorNum * diff - (s / (sumSqDist || 1)) * d

      for (let dim = 0; dim < config.targetDimensions; dim++) {
        const coordDiff = (coordinates[p.i]![dim]! - coordinates[p.j]![dim]!) / d
        const step = gradTerm * coordDiff
        gradients[p.i]![dim] += step
        gradients[p.j]![dim] -= step
      }
    }

    // Update coordinates with step decay
    const lr = config.learningRate / (1 + 0.005 * iter)
    for (let i = 0; i < n; i++) {
      for (let dim = 0; dim < config.targetDimensions; dim++) {
        coordinates[i]![dim] -= lr * gradients[i]![dim]!
      }
    }

    // Center coordinates to prevent drift
    for (let dim = 0; dim < config.targetDimensions; dim++) {
      let mean = 0
      for (let i = 0; i < n; i++) mean += coordinates[i]![dim]!
      mean /= n
      for (let i = 0; i < n; i++) coordinates[i]![dim] -= mean
    }
  }

  // Construct Shepard diagram points
  const shepardPoints: ShepardPoint[] = pairList.map((p, idx) => ({
    i: p.i,
    j: p.j,
    observedDissimilarity: p.observed,
    fittedDistance: finalDistances[idx] ?? 0,
    monotoneDisparity: finalDisparities[idx] ?? 0,
  }))

  return {
    coordinates,
    dimensionCount: config.targetDimensions,
    stress: currentStress,
    stressCategory: classifyKruskalStress(currentStress),
    varianceExplained: initial.varianceExplained,
    totalVarianceExplained: initial.totalVarianceExplained,
    iterations,
    converged,
    shepardPoints,
  }
}

// ── Psychological Space from Confusion Matrices (Shepard 1957, 1987) ─────────

/**
 * Convert an empirical stimulus confusion/identification matrix into a
 * symmetric psychological dissimilarity matrix according to Shepard's
 * universal law of generalization (Shepard 1957, 1987):
 * S_ij = sqrt( (p_ij * p_ji) / (p_ii * p_jj) )
 * D_ij = -ln( S_ij )
 */
export function confusionMatrixToDissimilarity(confusion: StimulusConfusionMatrix): {
  labels: string[]
  dissimilarityMatrix: number[][]
} {
  const n = confusion.labels.length
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      if (i === j) {
        matrix[i]![j] = 0
        continue
      }

      const pii = Math.max(1e-6, confusion.probabilities[i]?.[i] ?? 0.5)
      const pjj = Math.max(1e-6, confusion.probabilities[j]?.[j] ?? 0.5)
      const pij = Math.max(1e-6, confusion.probabilities[i]?.[j] ?? 1e-4)
      const pji = Math.max(1e-6, confusion.probabilities[j]?.[i] ?? 1e-4)

      // Shepard symmetrized similarity ratio
      const similarity = Math.min(1.0, Math.sqrt((pij * pji) / (pii * pjj)))
      // Exponential distance mapping: s = exp(-d) => d = -ln(s)
      const distance = Math.max(0, -Math.log(similarity))

      matrix[i]![j] = distance
      matrix[j]![i] = distance
    }
  }

  return { labels: confusion.labels, dissimilarityMatrix: matrix }
}

/**
 * Compute pairwise Euclidean distance matrix from arbitrary N-dimensional
 * stimulus feature vectors.
 */
export function featureVectorsToDissimilarity(vectors: number[][], weights?: number[]): number[][] {
  const n = vectors.length
  const matrix: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  const dims = vectors[0]?.length ?? 0
  const normalizedWeights = weights ?? new Array(dims).fill(1.0)

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let sum = 0
      for (let d = 0; d < dims; d++) {
        const diff = (vectors[i]![d] ?? 0) - (vectors[j]![d] ?? 0)
        const w = normalizedWeights[d] ?? 1
        sum += w * diff * diff
      }
      const dist = Math.sqrt(sum)
      matrix[i]![j] = dist
      matrix[j]![i] = dist
    }
  }

  return matrix
}
