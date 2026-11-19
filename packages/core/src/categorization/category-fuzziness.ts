/**
 * Category Fuzziness Indices, Boundary Entropy & Graded Membership
 *
 * Grounded in:
 * - Eleanor Rosch (1975) "Cognitive representations of semantic categories."
 *   Journal of Experimental Psychology: General 104(3): 192-233.
 * - Carolyn B. Mervis & Eleanor Rosch (1981) "Categorization of natural
 *   objects." Annual Review of Psychology 32: 89-115.
 * - Lotfi A. Zadeh (1965) "Fuzzy sets." Information and Control 8(3): 338-353.
 * - Hans Kamp & Barbara Partee (1995) "Prototype theory and compositionality."
 *   Cognition 57(2): 129-191.
 * - James A. Hampton (1998) "Similarity-based categorization and reasoning for
 *   natural categories." Cognition 65: 137-165.
 *
 * Quantifies graded structure, category boundary entropy, fuzzy set membership
 * overlap, and typicality gradients across category systems.
 */

import { z } from 'zod'

// ── Zod Schemas ──────────────────────────────────────────────────────────────

export const categoryMembershipSchema = z.object({
  stimulusId: z.string(),
  assignedCategory: z.string(),
  categoryProbabilities: z.record(z.string(), z.number().min(0).max(1)),
  boundaryEntropy: z.number().min(0),
  normalizedFuzziness: z.number().min(0).max(1),
  classificationMargin: z.number().min(0).max(1),
  typicalityScore: z.number().min(1).max(7),
  isBorderline: z.boolean(),
  fuzzinessBand: z.enum(['crisp', 'low_fuzziness', 'moderate_fuzziness', 'high_fuzziness', 'maximally_ambiguous']),
})
export type CategoryMembership = z.infer<typeof categoryMembershipSchema>

export const categoryOverlapPairSchema = z.object({
  categoryA: z.string(),
  categoryB: z.string(),
  overlapCoefficient: z.number().min(0).max(1),
  sharedBoundaryStimuli: z.array(z.string()),
})
export type CategoryOverlapPair = z.infer<typeof categoryOverlapPairSchema>

export const boundarySharpnessSchema = z.object({
  slope: z.number(),
  inflectionPoint: z.number(),
  rSquared: z.number().min(0).max(1),
  sharpnessTier: z.enum(['cliff_like', 'steep', 'gradual', 'diffuse']),
})
export type BoundarySharpness = z.infer<typeof boundarySharpnessSchema>

export const categorySetFuzzinessSchema = z.object({
  setId: z.string(),
  stimulusCount: z.number().int(),
  overallFuzzinessIndex: z.number().min(0).max(1),
  meanBoundaryEntropy: z.number().min(0),
  categoryOverlaps: z.array(categoryOverlapPairSchema),
  boundarySharpness: boundarySharpnessSchema.optional(),
  borderlineStimuli: z.array(z.string()),
  crispCoreStimuli: z.array(z.string()),
  memberships: z.array(categoryMembershipSchema),
  diagnosticSummary: z.string(),
})
export type CategorySetFuzziness = z.infer<typeof categorySetFuzzinessSchema>

// ── Entropy & Graded Membership Calculations ─────────────────────────────────

/**
 * Calculate Shannon boundary entropy:
 * H(x) = - sum_k p_k * log2(p_k)
 */
export function calculateShannonBoundaryEntropy(probabilities: number[]): number {
  let entropy = 0
  for (const p of probabilities) {
    if (p > 1e-9) {
      entropy -= p * Math.log2(p)
    }
  }
  return Math.max(0, entropy)
}

/**
 * Normalized boundary fuzziness in [0, 1]:
 * H_norm(x) = H(x) / log2(K)
 * where K is the number of competing categories.
 * A value of 0 means perfectly crisp (p = 1 for one category).
 * A value of 1 means maximally ambiguous (uniform distribution across all categories).
 */
export function calculateNormalizedFuzziness(
  probabilities: number[],
  categoryCount?: number,
): number {
  const k = categoryCount ?? probabilities.length
  if (k <= 1) return 0
  const maxEntropy = Math.log2(k)
  if (maxEntropy <= 0) return 0
  const entropy = calculateShannonBoundaryEntropy(probabilities)
  return Math.min(1.0, Math.max(0, entropy / maxEntropy))
}

/**
 * Categorize fuzziness level into semantic bands.
 */
export function classifyFuzzinessBand(
  normalizedFuzziness: number,
): CategoryMembership['fuzzinessBand'] {
  if (normalizedFuzziness < 0.2) return 'crisp'
  if (normalizedFuzziness < 0.4) return 'low_fuzziness'
  if (normalizedFuzziness < 0.65) return 'moderate_fuzziness'
  if (normalizedFuzziness < 0.85) return 'high_fuzziness'
  return 'maximally_ambiguous'
}

/**
 * Compute Rosch typicality score on standard 1-7 Likert scale:
 * 7 = Extremely typical (prototype core), 1 = Extremely atypical / borderline.
 * typicality = 1 + 6 * (margin) * (1 - normalizedFuzziness)
 */
export function predictTypicalityFromProbabilities(
  probabilities: Record<string, number>,
  normalizedFuzziness: number,
): number {
  const values = Object.values(probabilities).sort((a, b) => b - a)
  const top1 = values[0] ?? 0.5
  const top2 = values[1] ?? 0.0
  const margin = Math.max(0, top1 - top2)

  const raw = 1 + 6 * Math.pow(margin, 0.85) * (1 - 0.7 * normalizedFuzziness)
  return Math.min(7.0, Math.max(1.0, Math.round(raw * 100) / 100))
}

/**
 * Evaluate a single stimulus's category membership characteristics.
 */
export function evaluateStimulusMembership(
  stimulusId: string,
  categoryProbabilities: Record<string, number>,
  options?: {
    borderlineThreshold?: number
    empiricalTypicality?: number
  },
): CategoryMembership {
  const entries = Object.entries(categoryProbabilities)
  if (entries.length === 0) {
    return {
      stimulusId,
      assignedCategory: 'unknown',
      categoryProbabilities: {},
      boundaryEntropy: 0,
      normalizedFuzziness: 0,
      classificationMargin: 0,
      typicalityScore: 1,
      isBorderline: false,
      fuzzinessBand: 'crisp',
    }
  }

  // Sort by probability descending
  entries.sort((a, b) => b[1] - a[1])
  const assignedCategory = entries[0]![0]
  const pValues = entries.map((e) => e[1])

  const boundaryEntropy = calculateShannonBoundaryEntropy(pValues)
  const normalizedFuzziness = calculateNormalizedFuzziness(pValues, entries.length)
  const fuzzinessBand = classifyFuzzinessBand(normalizedFuzziness)

  const top1 = pValues[0] ?? 0
  const top2 = pValues[1] ?? 0
  const classificationMargin = Math.max(0, top1 - top2)

  const threshold = options?.borderlineThreshold ?? 0.6
  const isBorderline = normalizedFuzziness >= threshold || classificationMargin < 0.25

  const typicalityScore = options?.empiricalTypicality !== undefined
    ? Math.min(7.0, Math.max(1.0, options.empiricalTypicality))
    : predictTypicalityFromProbabilities(categoryProbabilities, normalizedFuzziness)

  return {
    stimulusId,
    assignedCategory,
    categoryProbabilities,
    boundaryEntropy: Math.round(boundaryEntropy * 10000) / 10000,
    normalizedFuzziness: Math.round(normalizedFuzziness * 10000) / 10000,
    classificationMargin: Math.round(classificationMargin * 10000) / 10000,
    typicalityScore,
    isBorderline,
    fuzzinessBand,
  }
}

// ── Category Overlap & Boundary Sharpness ─────────────────────────────────────

/**
 * Category overlap coefficient (Mervis & Rosch 1981):
 * Overlap(A, B) = sum_x min(mu_A(x), mu_B(x)) / sum_x max(mu_A(x), mu_B(x))
 * A value of 0 indicates disjoint, mutually exclusive categories.
 * Higher values indicate blurred, inter-penetrating semantic boundaries.
 */
export function calculateCategoryOverlap(
  categoryA: string,
  categoryB: string,
  memberships: CategoryMembership[],
): CategoryOverlapPair {
  let minSum = 0
  let maxSum = 0
  const sharedBoundaryStimuli: string[] = []

  for (const m of memberships) {
    const pA = m.categoryProbabilities[categoryA] ?? 0
    const pB = m.categoryProbabilities[categoryB] ?? 0

    const minVal = Math.min(pA, pB)
    const maxVal = Math.max(pA, pB)

    minSum += minVal
    maxSum += maxVal

    // If both categories have significant probability, it's on their shared boundary
    if (minVal > 0.2) {
      sharedBoundaryStimuli.push(m.stimulusId)
    }
  }

  const overlapCoefficient = maxSum > 0 ? minSum / maxSum : 0
  return {
    categoryA,
    categoryB,
    overlapCoefficient: Math.round(overlapCoefficient * 10000) / 10000,
    sharedBoundaryStimuli,
  }
}

/**
 * Estimate boundary sharpness using logistic sigmoid regression over
 * 1D distance-to-boundary vs category membership probability:
 * P(C|d) = 1 / (1 + exp(-slope * (d - d0)))
 */
export function estimateBoundarySharpness(
  distancesToBoundary: number[],
  probabilities: number[],
): BoundarySharpness {
  const n = distancesToBoundary.length
  if (n < 3) {
    return {
      slope: 1.0,
      inflectionPoint: 0.0,
      rSquared: 1.0,
      sharpnessTier: 'gradual',
    }
  }

  // Linearize using logit: ln(p / (1 - p)) = slope * d - slope * d0
  const validPoints: Array<{ d: number; logit: number }> = []
  for (let i = 0; i < n; i++) {
    const p = Math.min(0.999, Math.max(0.001, probabilities[i]!))
    const d = distancesToBoundary[i]!
    validPoints.push({ d, logit: Math.log(p / (1 - p)) })
  }

  let meanD = 0
  let meanLogit = 0
  for (const pt of validPoints) {
    meanD += pt.d
    meanLogit += pt.logit
  }
  meanD /= validPoints.length
  meanLogit /= validPoints.length

  let num = 0
  let den = 0
  for (const pt of validPoints) {
    const dDiff = pt.d - meanD
    const lDiff = pt.logit - meanLogit
    num += dDiff * lDiff
    den += dDiff * dDiff
  }

  const slope = den > 0 ? Math.max(0.1, num / den) : 1.0
  const intercept = meanLogit - slope * meanD
  const inflectionPoint = slope !== 0 ? -intercept / slope : 0

  // Calculate R-squared of fitted logistic
  let ssTot = 0
  let ssRes = 0
  for (let i = 0; i < n; i++) {
    const actualP = probabilities[i]!
    const predLogit = slope * (distancesToBoundary[i]! - inflectionPoint)
    const predP = 1 / (1 + Math.exp(-predLogit))
    ssTot += Math.pow(actualP - 0.5, 2)
    ssRes += Math.pow(actualP - predP, 2)
  }
  const rSquared = ssTot > 0 ? Math.max(0, Math.min(1.0, 1 - ssRes / ssTot)) : 1.0

  let sharpnessTier: BoundarySharpness['sharpnessTier']
  if (slope > 8.0) sharpnessTier = 'cliff_like'
  else if (slope > 4.0) sharpnessTier = 'steep'
  else if (slope > 1.5) sharpnessTier = 'gradual'
  else sharpnessTier = 'diffuse'

  return {
    slope: Math.round(slope * 100) / 100,
    inflectionPoint: Math.round(inflectionPoint * 100) / 100,
    rSquared: Math.round(rSquared * 1000) / 1000,
    sharpnessTier,
  }
}

// ── Holistic Category System Fuzziness Diagnostic ────────────────────────────

/**
 * Compute comprehensive category fuzziness diagnostics for an entire stimulus set.
 */
export function analyzeCategorySetFuzziness(
  setId: string,
  stimuli: Array<{
    id: string
    categoryProbabilities: Record<string, number>
    empiricalTypicality?: number
  }>,
  boundaryDistanceData?: Array<{ distance: number; primaryCategoryProb: number }>,
): CategorySetFuzziness {
  const memberships = stimuli.map((s) =>
    evaluateStimulusMembership(s.id, s.categoryProbabilities, {
      empiricalTypicality: s.empiricalTypicality,
    }),
  )

  const stimulusCount = memberships.length
  let totalEntropy = 0
  let totalNormalizedFuzziness = 0
  const borderlineStimuli: string[] = []
  const crispCoreStimuli: string[] = []

  for (const m of memberships) {
    totalEntropy += m.boundaryEntropy
    totalNormalizedFuzziness += m.normalizedFuzziness
    if (m.isBorderline) borderlineStimuli.push(m.stimulusId)
    if (m.fuzzinessBand === 'crisp' && m.typicalityScore >= 5.5) {
      crispCoreStimuli.push(m.stimulusId)
    }
  }

  const meanBoundaryEntropy = stimulusCount > 0 ? totalEntropy / stimulusCount : 0
  const overallFuzzinessIndex = stimulusCount > 0 ? totalNormalizedFuzziness / stimulusCount : 0

  // Discover all category labels
  const categoryLabels = new Set<string>()
  for (const m of memberships) {
    for (const cat of Object.keys(m.categoryProbabilities)) {
      categoryLabels.add(cat)
    }
  }
  const labelsArr = Array.from(categoryLabels)

  // Pairwise category overlaps
  const categoryOverlaps: CategoryOverlapPair[] = []
  for (let i = 0; i < labelsArr.length; i++) {
    for (let j = i + 1; j < labelsArr.length; j++) {
      categoryOverlaps.push(
        calculateCategoryOverlap(labelsArr[i]!, labelsArr[j]!, memberships),
      )
    }
  }

  // Boundary sharpness if distance data provided
  let boundarySharpness: BoundarySharpness | undefined
  if (boundaryDistanceData && boundaryDistanceData.length >= 3) {
    boundarySharpness = estimateBoundarySharpness(
      boundaryDistanceData.map((d) => d.distance),
      boundaryDistanceData.map((d) => d.primaryCategoryProb),
    )
  }

  let diagnosticSummary: string
  if (overallFuzzinessIndex < 0.2) {
    diagnosticSummary = `Well-defined, crisp conceptual structure (mean fuzziness ${Math.round(overallFuzzinessIndex * 100)}%). Prototype centroids dominate; ${crispCoreStimuli.length} clear core exemplars.`
  } else if (overallFuzzinessIndex < 0.5) {
    diagnosticSummary = `Moderate boundary permeability (fuzziness index ${Math.round(overallFuzzinessIndex * 100)}%). ${borderlineStimuli.length} borderline items require discriminating contrast training.`
  } else {
    diagnosticSummary = `High semantic fuzziness and graded family resemblance (fuzziness index ${Math.round(overallFuzzinessIndex * 100)}%). ${borderlineStimuli.length} borderline items require discriminating contrast training; exemplar-based memory or multidimensional scaling recommended.`
  }

  return {
    setId,
    stimulusCount,
    overallFuzzinessIndex: Math.round(overallFuzzinessIndex * 10000) / 10000,
    meanBoundaryEntropy: Math.round(meanBoundaryEntropy * 10000) / 10000,
    categoryOverlaps,
    boundarySharpness,
    borderlineStimuli,
    crispCoreStimuli,
    memberships,
    diagnosticSummary,
  }
}
