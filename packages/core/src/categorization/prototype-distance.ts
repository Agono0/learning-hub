/**
 * Prototype Euclidean Distance, Centroid Abstraction & Family Resemblance
 *
 * Grounded in:
 * - Stephen K. Reed (1972) "Pattern recognition and categorization."
 *   Cognitive Psychology 3(3): 382-407.
 * - Eleanor Rosch & Carolyn B. Mervis (1975) "Family resemblances: Studies in the
 *   internal structure of categories." Cognitive Psychology 7(4): 573-605.
 * - Eleanor Rosch (1975) "Cognitive representations of semantic categories."
 *   Journal of Experimental Psychology: General 104(3): 192-233.
 * - J. David Smith & John Paul Minda (2000) "Thirty categorization results in
 *   search of a model." Journal of Experimental Psychology: Learning, Memory,
 *   and Cognition 26(1): 3-27.
 *
 * Implements central tendency prototype abstraction, Euclidean distance in
 * psychological space, Rosch-Mervis family resemblance indices, and prototype
 * vs exemplar model arbitration (AIC/BIC).
 */

import { z } from 'zod'

// ── Zod Schemas ──────────────────────────────────────────────────────────────

export const prototypeCentroidSchema = z.object({
  category: z.string(),
  featureMeans: z.array(z.number()),
  featureVariances: z.array(z.number()),
  exemplarCount: z.number().int().min(1),
})
export type PrototypeCentroid = z.infer<typeof prototypeCentroidSchema>

export const prototypeDistanceEvaluationSchema = z.object({
  stimulusId: z.string(),
  distancesToPrototypes: z.record(z.string(), z.number()),
  closestPrototypeCategory: z.string(),
  prototypeClassificationProbabilities: z.record(z.string(), z.number()),
  typicalityScore: z.number().min(1).max(7),
  familyResemblanceScore: z.number(),
  isPrototypeCore: z.boolean(),
})
export type PrototypeDistanceEvaluation = z.infer<typeof prototypeDistanceEvaluationSchema>

export const prototypeVsExemplarComparisonSchema = z.object({
  preferredModel: z.enum(['prototype', 'exemplar', 'undifferentiated']),
  prototypeLogLikelihood: z.number(),
  exemplarLogLikelihood: z.number(),
  prototypeAic: z.number(),
  exemplarAic: z.number(),
  deltaAic: z.number(), // AIC_proto - AIC_exemplar (negative favours prototype)
  deltaBic: z.number(),
  evidenceRatio: z.number(), // Relative likelihood exp(0.5 * |deltaAic|)
  subsystemSummary: z.string(),
})
export type PrototypeVsExemplarComparison = z.infer<typeof prototypeVsExemplarComparisonSchema>

// ── Prototype Centroid & Distance Computation ─────────────────────────────────

/**
 * Compute the feature centroid (mean feature vector) and variance
 * for a category from its studied exemplars (Reed 1972).
 */
export function computeCategoryPrototype(
  category: string,
  exemplarFeatures: number[][],
): PrototypeCentroid {
  const count = exemplarFeatures.length
  if (count === 0) {
    return {
      category,
      featureMeans: [],
      featureVariances: [],
      exemplarCount: 0,
    }
  }

  const dims = exemplarFeatures[0]!.length
  const sums = new Array<number>(dims).fill(0)
  const sqSums = new Array<number>(dims).fill(0)

  for (const vec of exemplarFeatures) {
    for (let d = 0; d < dims; d++) {
      const val = vec[d] ?? 0
      sums[d] += val
      sqSums[d] += val * val
    }
  }

  const featureMeans: number[] = []
  const featureVariances: number[] = []

  for (let d = 0; d < dims; d++) {
    const mean = sums[d]! / count
    const variance = count > 1 ? (sqSums[d]! - count * mean * mean) / (count - 1) : 0
    featureMeans.push(Math.round(mean * 10000) / 10000)
    featureVariances.push(Math.round(Math.max(0, variance) * 10000) / 10000)
  }

  return {
    category,
    featureMeans,
    featureVariances,
    exemplarCount: count,
  }
}

/**
 * Compute Euclidean distance from a stimulus to category prototype:
 * d(x, P_K) = sqrt( sum_m (x_m - P_{Km})^2 )
 */
export function calculatePrototypeEuclideanDistance(
  stimulus: number[],
  prototype: PrototypeCentroid,
  dimensionWeights?: number[],
): number {
  const dims = Math.min(stimulus.length, prototype.featureMeans.length)
  let sum = 0

  for (let d = 0; d < dims; d++) {
    const diff = (stimulus[d] ?? 0) - (prototype.featureMeans[d] ?? 0)
    const w = dimensionWeights ? dimensionWeights[d] ?? 1 : 1
    sum += w * diff * diff
  }

  return Math.sqrt(sum)
}

/**
 * Predict classification probability based on prototype Euclidean distance (Reed 1972):
 * P(C_K | x) = exp( - gamma * d(x, P_K) ) / sum_L exp( - gamma * d(x, P_L) )
 */
export function classifyWithPrototypeModel(
  stimulus: number[],
  prototypes: Record<string, PrototypeCentroid>,
  gamma = 3.0,
): { predictedCategory: string; probabilities: Record<string, number>; distances: Record<string, number> } {
  const distances: Record<string, number> = {}
  const similarities: Record<string, number> = {}
  let totalSim = 0

  for (const [cat, proto] of Object.entries(prototypes)) {
    const dist = calculatePrototypeEuclideanDistance(stimulus, proto)
    distances[cat] = dist
    const sim = Math.exp(-gamma * dist)
    similarities[cat] = sim
    totalSim += sim
  }

  const probabilities: Record<string, number> = {}
  let bestCat = Object.keys(prototypes)[0] ?? 'A'
  let bestProb = 0

  for (const [cat, sim] of Object.entries(similarities)) {
    const prob = totalSim > 0 ? sim / totalSim : 1 / Object.keys(prototypes).length
    probabilities[cat] = Math.round(prob * 10000) / 10000
    if (prob > bestProb) {
      bestProb = prob
      bestCat = cat
    }
  }

  return { predictedCategory: bestCat, probabilities, distances }
}

// ── Family Resemblance & Typicality Gradient (Rosch 1975) ─────────────────────

/**
 * Calculate Rosch & Mervis (1975) family resemblance score:
 * Sum of similarities to all members of the target category minus sum of
 * similarities to members of contrasting categories:
 * FR(x) = sum_{j in Own} sim(x, x_j) - sum_{k in Other} sim(x, x_k)
 */
export function calculateFamilyResemblance(
  targetFeatures: number[],
  targetCategory: string,
  allExemplars: Array<{ category: string; features: number[] }>,
  gamma = 2.0,
): number {
  let ownSim = 0
  let otherSim = 0

  for (const ex of allExemplars) {
    let distSq = 0
    for (let d = 0; d < targetFeatures.length; d++) {
      const diff = (targetFeatures[d] ?? 0) - (ex.features[d] ?? 0)
      distSq += diff * diff
    }
    const sim = Math.exp(-gamma * Math.sqrt(distSq))

    if (ex.category === targetCategory) {
      ownSim += sim
    } else {
      otherSim += sim
    }
  }

  return Math.round((ownSim - otherSim) * 100) / 100
}

/**
 * Evaluate comprehensive prototype-distance telemetry for a stimulus.
 */
export function evaluateStimulusPrototypeDistance(
  stimulusId: string,
  features: number[],
  prototypes: Record<string, PrototypeCentroid>,
  allExemplars?: Array<{ category: string; features: number[] }>,
  gamma = 3.0,
): PrototypeDistanceEvaluation {
  const { predictedCategory, probabilities, distances } = classifyWithPrototypeModel(
    features,
    prototypes,
    gamma,
  )

  const distToTarget = distances[predictedCategory] ?? 1.0
  // Typicality is inversely related to distance from prototype: scale 1-7 (Rosch 1975)
  const typicalityRaw = 7 - 5 * Math.tanh(distToTarget * 2.5)
  const typicalityScore = Math.min(7, Math.max(1, Math.round(typicalityRaw * 10) / 10))

  const familyResemblanceScore = allExemplars
    ? calculateFamilyResemblance(features, predictedCategory, allExemplars, gamma)
    : 0

  const isPrototypeCore = typicalityScore >= 5.8 && distToTarget < 0.25

  return {
    stimulusId,
    distancesToPrototypes: distances,
    closestPrototypeCategory: predictedCategory,
    prototypeClassificationProbabilities: probabilities,
    typicalityScore,
    familyResemblanceScore,
    isPrototypeCore,
  }
}

// ── Prototype vs Exemplar Model Comparison (AIC/BIC) ──────────────────────────

/**
 * Rigorously arbitrate between prototype abstraction (Reed 1972) and
 * exemplar memory (Nosofsky 1986 GCM) via AIC and BIC information criteria
 * (Smith & Minda 2000).
 */
export function comparePrototypeAndExemplarModels(
  trials: Array<{ features: number[]; participantChoice: string }>,
  prototypes: Record<string, PrototypeCentroid>,
  exemplars: Array<{ id: string; category: string; features: number[] }>,
  options?: {
    gammaProto?: number
    gcmSensitivity?: number
  },
): PrototypeVsExemplarComparison {
  const n = trials.length
  if (n === 0) {
    return {
      preferredModel: 'undifferentiated',
      prototypeLogLikelihood: 0,
      exemplarLogLikelihood: 0,
      prototypeAic: 0,
      exemplarAic: 0,
      deltaAic: 0,
      deltaBic: 0,
      evidenceRatio: 1.0,
      subsystemSummary: 'No trial data available for model comparison.',
    }
  }

  const gamma = options?.gammaProto ?? 3.0
  const c = options?.gcmSensitivity ?? 3.0

  // 1. Prototype Model Log-Likelihood (k = 1 parameter: gamma)
  let protoLL = 0
  for (const t of trials) {
    const { probabilities } = classifyWithPrototypeModel(t.features, prototypes, gamma)
    const pChoice = probabilities[t.participantChoice] ?? 1e-6
    protoLL += Math.log(Math.max(1e-6, pChoice))
  }

  // 2. Exemplar Model Log-Likelihood (k = 2 parameters: c, r)
  let exemplarLL = 0
  for (const t of trials) {
    let ownEv = 0
    let otherEv = 0
    for (const ex of exemplars) {
      let dist = 0
      for (let d = 0; d < t.features.length; d++) {
        dist += Math.abs((t.features[d] ?? 0) - (ex.features[d] ?? 0))
      }
      const sim = Math.exp(-c * dist)
      if (ex.category === t.participantChoice) ownEv += sim
      else otherEv += sim
    }
    const pExemplar = ownEv + otherEv > 0 ? ownEv / (ownEv + otherEv) : 0.5
    exemplarLL += Math.log(Math.max(1e-6, pExemplar))
  }

  const kProto = 1
  const kExemplar = 2
  const lnN = Math.log(n)

  const protoAic = 2 * kProto - 2 * protoLL
  const exemplarAic = 2 * kExemplar - 2 * exemplarLL
  const deltaAic = protoAic - exemplarAic

  const protoBic = kProto * lnN - 2 * protoLL
  const exemplarBic = kExemplar * lnN - 2 * exemplarLL
  const deltaBic = protoBic - exemplarBic

  // Evidence ratio: relative likelihood of best model
  const evidenceRatio = Math.round(Math.exp(0.5 * Math.abs(deltaAic)) * 100) / 100

  let preferredModel: PrototypeVsExemplarComparison['preferredModel']
  if (Math.abs(deltaAic) < 2.0) {
    preferredModel = 'undifferentiated'
  } else if (deltaAic < 0) {
    preferredModel = 'prototype'
  } else {
    preferredModel = 'exemplar'
  }

  let subsystemSummary: string
  if (preferredModel === 'prototype') {
    subsystemSummary = `Participant data strongly favors prototype abstraction (AIC advantage ${Math.abs(deltaAic).toFixed(1)}, evidence ratio ${evidenceRatio}:1). Mental representations correspond to central tendency centroids rather than raw instance storage (Reed 1972).`
  } else if (preferredModel === 'exemplar') {
    subsystemSummary = `Participant data strongly favors exemplar storage (GCM advantage ${Math.abs(deltaAic).toFixed(1)}, evidence ratio ${evidenceRatio}:1). Sensitivity to exceptions and non-linear boundary items confirms instance-based representation (Nosofsky 1986).`
  } else {
    subsystemSummary = `Models are indistinguishable (delta AIC ${Math.abs(deltaAic).toFixed(1)} < 2.0). Performance aligns equally with prototype centroids and exemplar instances.`
  }

  return {
    preferredModel,
    prototypeLogLikelihood: Math.round(protoLL * 100) / 100,
    exemplarLogLikelihood: Math.round(exemplarLL * 100) / 100,
    prototypeAic: Math.round(protoAic * 100) / 100,
    exemplarAic: Math.round(exemplarAic * 100) / 100,
    deltaAic: Math.round(deltaAic * 100) / 100,
    deltaBic: Math.round(deltaBic * 100) / 100,
    evidenceRatio,
    subsystemSummary,
  }
}
