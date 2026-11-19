/**
 * Generalized Context Model (GCM) Selective Attention Weighting & Space Warping
 *
 * Grounded in:
 * - Robert M. Nosofsky (1986) "Attention, similarity, and the
 *   identification-categorization relationship." Journal of Experimental
 *   Psychology: General 115(1): 39-57.
 * - Robert M. Nosofsky (1987) "Attention and category learning." Journal of
 *   Experimental Psychology: Learning, Memory, and Cognition 13(1): 87-108.
 * - Robert M. Nosofsky (2011) "The Generalized Context Model: An exemplar model
 *   of classification." Formal Approaches in Categorization, pp. 18-49.
 * - Roger N. Shepard (1987) "Toward a universal law of generalization for
 *   psychological science." Science 237: 1317-1323.
 *
 * Implements attention-weighted Minkowski metric distance, exponential similarity
 * decay, response determinism scaling (gamma), category bias (beta), and
 * maximum-likelihood attention weight optimization.
 */

import { z } from 'zod'

// ── Zod Schemas ──────────────────────────────────────────────────────────────

export const gcmParametersSchema = z.object({
  sensitivity: z.number().min(0.01).max(30).default(3.0), // c
  minkowskiR: z.number().min(1).max(2).default(1.0), // r: 1 = city-block (separable), 2 = Euclidean (integral)
  attentionWeights: z.array(z.number().min(0).max(1)).default([0.5, 0.5]), // w_m, sum = 1
  categoryBiases: z.record(z.string(), z.number().min(0).max(1)).default({ A: 0.5, B: 0.5 }), // beta
  responseScaling: z.number().min(0.1).max(10).default(1.0), // gamma
})
export type GcmParameters = z.infer<typeof gcmParametersSchema>

export const gcmExemplarSchema = z.object({
  id: z.string(),
  category: z.string(),
  features: z.array(z.number()),
  presentationFrequency: z.number().min(1).default(1),
})
export type GcmExemplar = z.infer<typeof gcmExemplarSchema>

export const attentionFitResultSchema = z.object({
  fittedWeights: z.array(z.number()),
  fittedSensitivity: z.number(),
  fittedResponseScaling: z.number(),
  logLikelihood: z.number(),
  bic: z.number(),
  aic: z.number(),
  dimensionSalienceRanking: z.array(
    z.object({
      dimensionIndex: z.number().int(),
      weight: z.number(),
      relativeImportance: z.number(),
    }),
  ),
  selectiveAttentionShiftDetected: z.boolean(),
  attendedDimension: z.number().int().optional(),
  distortionDescription: z.string(),
})
export type AttentionFitResult = z.infer<typeof attentionFitResultSchema>

export const gcmClassificationResultSchema = z.object({
  stimulusId: z.string(),
  features: z.array(z.number()),
  predictedCategory: z.string(),
  categoryProbabilities: z.record(z.string(), z.number()),
  exemplarSimilarities: z.record(z.string(), z.number()),
  categoryEvidence: z.record(z.string(), z.number()),
})
export type GcmClassificationResult = z.infer<typeof gcmClassificationResultSchema>

// ── Pure GCM Distance & Similarity Functions ──────────────────────────────────

/**
 * Compute attention-weighted Minkowski distance (Nosofsky 1986):
 * d_ij = c * ( sum_m w_m * |x_im - x_jm|^r )^(1/r)
 */
export function calculateGcmDistance(
  stimulusA: number[],
  stimulusB: number[],
  parameters: GcmParameters,
): number {
  const { sensitivity, minkowskiR, attentionWeights } = parameters
  const dims = Math.min(stimulusA.length, stimulusB.length, attentionWeights.length)

  let sum = 0
  for (let m = 0; m < dims; m++) {
    const diff = Math.abs((stimulusA[m] ?? 0) - (stimulusB[m] ?? 0))
    const w = attentionWeights[m] ?? 0
    sum += w * Math.pow(diff, minkowskiR)
  }

  const rawDist = Math.pow(sum, 1 / minkowskiR)
  return sensitivity * rawDist
}

/**
 * Compute Shepard exponential similarity from GCM distance:
 * s_ij = exp( - d_ij )
 */
export function calculateGcmSimilarity(
  stimulusA: number[],
  stimulusB: number[],
  parameters: GcmParameters,
): number {
  const dist = calculateGcmDistance(stimulusA, stimulusB, parameters)
  return Math.exp(-dist)
}

/**
 * Classify a target stimulus against stored exemplars using GCM (Nosofsky 1986):
 * P(C_K | x_i) = beta_K * ( sum_{j in C_K} freq_j * s_ij )^gamma /
 *               sum_L [ beta_L * ( sum_{k in C_L} freq_k * s_ik )^gamma ]
 */
export function classifyWithGcm(
  targetFeatures: number[],
  exemplars: GcmExemplar[],
  parameters: GcmParameters,
  categories = ['A', 'B'],
  targetId = 'probe',
): GcmClassificationResult {
  const exemplarSimilarities: Record<string, number> = {}
  const rawCategoryEvidence: Record<string, number> = {}

  for (const cat of categories) {
    rawCategoryEvidence[cat] = 0
  }

  for (const ex of exemplars) {
    const sim = calculateGcmSimilarity(targetFeatures, ex.features, parameters)
    exemplarSimilarities[ex.id] = sim
    const weightedSim = sim * ex.presentationFrequency
    rawCategoryEvidence[ex.category] = (rawCategoryEvidence[ex.category] ?? 0) + weightedSim
  }

  // Apply response scaling (gamma) and category bias (beta)
  const scaledEvidence: Record<string, number> = {}
  let totalScaled = 0

  for (const cat of categories) {
    const raw = rawCategoryEvidence[cat] ?? 0
    const beta = parameters.categoryBiases[cat] ?? (1 / categories.length)
    const scaled = beta * Math.pow(raw, parameters.responseScaling)
    scaledEvidence[cat] = scaled
    totalScaled += scaled
  }

  const categoryProbabilities: Record<string, number> = {}
  let bestCat = categories[0] ?? 'A'
  let bestProb = 0

  for (const cat of categories) {
    const prob = totalScaled > 0 ? (scaledEvidence[cat] ?? 0) / totalScaled : 1 / categories.length
    categoryProbabilities[cat] = Math.round(prob * 10000) / 10000
    if (prob > bestProb) {
      bestProb = prob
      bestCat = cat
    }
  }

  return {
    stimulusId: targetId,
    features: targetFeatures,
    predictedCategory: bestCat,
    categoryProbabilities,
    exemplarSimilarities,
    categoryEvidence: rawCategoryEvidence,
  }
}

// ── Attention Optimization & Maximum Likelihood Estimation ────────────────────

/**
 * Compute Log-Likelihood of observed human classification responses
 * given candidate GCM parameters:
 * LL = sum_t ln( P( choice_t | features_t ) )
 */
export function evaluateGcmLogLikelihood(
  trials: Array<{ features: number[]; participantChoice: string }>,
  exemplars: GcmExemplar[],
  parameters: GcmParameters,
  categories = ['A', 'B'],
): number {
  let ll = 0
  for (const trial of trials) {
    const classification = classifyWithGcm(trial.features, exemplars, parameters, categories)
    const pChoice = classification.categoryProbabilities[trial.participantChoice] ?? 1e-6
    ll += Math.log(Math.max(1e-6, pChoice))
  }
  return ll
}

/**
 * Grid-based maximum-likelihood fit for selective attention weights w_m
 * and sensitivity c (Nosofsky 1986).
 */
export function fitGcmAttentionWeights(
  trials: Array<{ features: number[]; participantChoice: string }>,
  exemplars: GcmExemplar[],
  dimensionCount: number,
  options?: {
    categories?: string[]
    minkowskiR?: number
    cGrid?: number[]
    weightSteps?: number
  },
): AttentionFitResult {
  const categories = options?.categories ?? ['A', 'B']
  const minkowskiR = options?.minkowskiR ?? 1.0
  const cGrid = options?.cGrid ?? [0.5, 1.0, 2.0, 3.5, 5.0, 8.0, 12.0]
  const steps = options?.weightSteps ?? 20 // 0.05 step for 2D

  let bestLL = -Infinity
  let bestWeights = new Array(dimensionCount).fill(1 / dimensionCount)
  let bestC = 3.0
  const bestGamma = 1.0

  if (dimensionCount === 2) {
    // 2D simplex search: w1 in [0, 1], w2 = 1 - w1
    for (const c of cGrid) {
      for (let s = 0; s <= steps; s++) {
        const w0 = s / steps
        const w1 = 1 - w0
        const candidateWeights = [w0, w1]

        const params: GcmParameters = {
          sensitivity: c,
          minkowskiR,
          attentionWeights: candidateWeights,
          categoryBiases: { A: 0.5, B: 0.5 },
          responseScaling: bestGamma,
        }

        const ll = evaluateGcmLogLikelihood(trials, exemplars, params, categories)
        if (ll > bestLL) {
          bestLL = ll
          bestWeights = candidateWeights
          bestC = c
        }
      }
    }
  } else {
    // Multidimensional: test uniform + single-dimension spotlight candidates
    const candidates: number[][] = [
      new Array(dimensionCount).fill(1 / dimensionCount),
    ]

    for (let d = 0; d < dimensionCount; d++) {
      const spot = new Array(dimensionCount).fill((1 - 0.7) / (dimensionCount - 1))
      spot[d] = 0.7
      candidates.push(spot)

      const pure = new Array(dimensionCount).fill(0)
      pure[d] = 1.0
      candidates.push(pure)
    }

    for (const c of cGrid) {
      for (const w of candidates) {
        const params: GcmParameters = {
          sensitivity: c,
          minkowskiR,
          attentionWeights: w,
          categoryBiases: { A: 0.5, B: 0.5 },
          responseScaling: bestGamma,
        }
        const ll = evaluateGcmLogLikelihood(trials, exemplars, params, categories)
        if (ll > bestLL) {
          bestLL = ll
          bestWeights = w
          bestC = c
        }
      }
    }
  }

  // Model comparison metrics
  const n = trials.length
  const k = dimensionCount // free attention weights (k-1) + c (1) = dimensionCount free parameters
  const aic = 2 * k - 2 * bestLL
  const bic = k * Math.log(Math.max(1, n)) - 2 * bestLL

  // Dimension salience ranking
  const ranking = bestWeights
    .map((w, idx) => ({
      dimensionIndex: idx,
      weight: Math.round(w * 1000) / 1000,
      relativeImportance: Math.round(w * dimensionCount * 100) / 100,
    }))
    .sort((a, b) => b.weight - a.weight)

  const topWeight = ranking[0]?.weight ?? (1 / dimensionCount)
  const selectiveAttentionShiftDetected = topWeight > 0.65
  const attendedDimension = selectiveAttentionShiftDetected ? ranking[0]?.dimensionIndex : undefined

  let distortionDescription: string
  if (selectiveAttentionShiftDetected && attendedDimension !== undefined) {
    distortionDescription = `Selective attention is heavily concentrated on Dimension ${attendedDimension + 1} (${(topWeight * 100).toFixed(0)}% weight). Psychological space is stretched along this dimension and collapsed along others (Nosofsky 1986).`
  } else {
    distortionDescription = `Attention is distributed relatively evenly across dimensions (max weight ${(topWeight * 100).toFixed(0)}%). Integral multi-feature processing observed.`
  }

  return {
    fittedWeights: bestWeights.map((w) => Math.round(w * 1000) / 1000),
    fittedSensitivity: bestC,
    fittedResponseScaling: bestGamma,
    logLikelihood: Math.round(bestLL * 100) / 100,
    bic: Math.round(bic * 100) / 100,
    aic: Math.round(aic * 100) / 100,
    dimensionSalienceRanking: ranking,
    selectiveAttentionShiftDetected,
    attendedDimension,
    distortionDescription,
  }
}
