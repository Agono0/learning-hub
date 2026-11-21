/**
 * @file markov-engine.ts
 * @description Stochastic & Markovian Adaptive Assessment Engine
 *
 * Implements:
 * - Jean-Claude Falmagne & Jean-Paul Doignon (1988) "A Class of Markov Chains for Adaptive Assessment"
 * - Bayesian state probability distribution updating with slip (β) and guess (η) parameters
 * - Half-split item selection (bisection of probability mass)
 * - Shannon mutual information and entropy reduction maximization
 * - Diagnostic state estimation and confidence intervals
 *
 * @module @learning-hub/core/knowledge-space
 */

import type {
  AdaptiveAssessmentSession,
  AssessmentResponseStep,
  KnowledgeStructure,
  LearnerDiagnosis,
  KSTItem,
} from './types'
import { computeFringes } from './structure'

// ============================================================================
// 1. SESSION INITIALIZATION
// ============================================================================

/**
 * Initializes a new Markovian adaptive assessment session.
 *
 * @param structure The knowledge structure
 * @param priorDistributionType 'uniform' | 'difficulty_weighted'
 */
export function initializeMarkovianSession(
  structure: KnowledgeStructure,
  priorDistributionType: 'uniform' | 'difficulty_weighted' = 'uniform',
): AdaptiveAssessmentSession {
  const m = structure.states.length
  const stateProbabilities: Record<string, number> = {}

  if (priorDistributionType === 'uniform') {
    const uniformProb = 1 / m
    for (const state of structure.states) {
      stateProbabilities[state.stateId] = uniformProb
    }
  } else {
    // Difficulty weighted: states near median difficulty have higher prior
    const domainSize = structure.domainItems.length
    const targetMedian = domainSize / 2
    let sumWeight = 0

    for (const state of structure.states) {
      const dist = Math.abs(state.level - targetMedian)
      const weight = Math.exp(-0.5 * (dist / 2) ** 2)
      stateProbabilities[state.stateId] = weight
      sumWeight += weight
    }

    for (const state of structure.states) {
      stateProbabilities[state.stateId] /= sumWeight
    }
  }

  const itemMasteryProbabilities = calculateItemMasteryProbabilities(stateProbabilities, structure)
  const currentEntropy = calculateShannonEntropy(stateProbabilities)

  // Find most likely state
  let mostLikelyStateId = structure.states[0]!.stateId
  let maxP = -1
  for (const [sId, p] of Object.entries(stateProbabilities)) {
    if (p > maxP) {
      maxP = p
      mostLikelyStateId = sId
    }
  }

  const initialSession: AdaptiveAssessmentSession = {
    sessionId: `kst-session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    domainId: structure.domainId,
    step: 0,
    history: [],
    stateProbabilities,
    itemMasteryProbabilities,
    currentEntropy,
    mostLikelyStateId,
    confidence: maxP,
    nextSuggestedItemId: null,
    isTerminated: false,
    terminationReason: 'in_progress',
  }

  initialSession.nextSuggestedItemId = selectOptimalNextItem(initialSession, structure)
  return initialSession
}

// ============================================================================
// 2. BAYESIAN POSTERIOR UPDATING
// ============================================================================

/**
 * Updates the posterior state probabilities after observing a learner's response.
 *
 * Response Likelihood:
 * If q ∈ K:
 *   P(R = 1 | K) = 1 - β_q
 *   P(R = 0 | K) = β_q
 * If q ∉ K:
 *   P(R = 1 | K) = η_q
 *   P(R = 0 | K) = 1 - η_q
 */
export function updateBeliefPosterior(
  session: AdaptiveAssessmentSession,
  structure: KnowledgeStructure,
  response: {
    itemId: string
    isCorrect: boolean
    responseTimeMs?: number
  },
): AdaptiveAssessmentSession {
  if (session.isTerminated) return session

  const item = structure.domainItems.find((i) => i.id === response.itemId)
  if (!item) {
    throw new Error(`Item with id '${response.itemId}' not found in domain items.`)
  }

  const beta = item.slipProbability // slip: know but fail
  const eta = item.guessProbability // guess: don't know but succeed

  const priorProbabilities = { ...session.stateProbabilities }
  const priorEntropy = session.currentEntropy
  const posteriorProbabilities: Record<string, number> = {}

  let totalLikelihoodMass = 0

  // 1. Calculate unnormalized posterior for each state K in K
  for (const state of structure.states) {
    const knowsItem = state.itemIds.includes(item.id)
    let likelihood: number

    if (response.isCorrect) {
      likelihood = knowsItem ? 1 - beta : eta
    } else {
      likelihood = knowsItem ? beta : 1 - eta
    }

    const prior = priorProbabilities[state.stateId] || 0
    const unnormalized = prior * likelihood
    posteriorProbabilities[state.stateId] = unnormalized
    totalLikelihoodMass += unnormalized
  }

  // 2. Normalize posterior
  if (totalLikelihoodMass > 0) {
    for (const state of structure.states) {
      posteriorProbabilities[state.stateId] =
        (posteriorProbabilities[state.stateId] || 0) / totalLikelihoodMass
    }
  }

  const posteriorEntropy = calculateShannonEntropy(posteriorProbabilities)
  const itemMasteryProbabilities = calculateItemMasteryProbabilities(
    posteriorProbabilities,
    structure,
  )

  // 3. Find most likely state
  let mostLikelyStateId = structure.states[0]!.stateId
  let maxP = -1
  for (const [sId, p] of Object.entries(posteriorProbabilities)) {
    if (p > maxP) {
      maxP = p
      mostLikelyStateId = sId
    }
  }

  const nextStep = session.step + 1
  const responseStep: AssessmentResponseStep = {
    step: nextStep,
    itemId: item.id,
    isCorrect: response.isCorrect,
    responseTimeMs: response.responseTimeMs || 0,
    priorEntropy,
    posteriorEntropy,
    entropyDelta: priorEntropy - posteriorEntropy,
    suggestedNextItem: null,
  }

  const updatedHistory = [...session.history, responseStep]

  // 4. Check termination criteria
  let isTerminated = false
  let terminationReason: AdaptiveAssessmentSession['terminationReason'] = 'in_progress'

  const maxSteps = Math.min(structure.domainItems.length + 2, 15)
  if (maxP >= 0.85) {
    isTerminated = true
    terminationReason = 'confidence_threshold'
  } else if (posteriorEntropy <= 0.45 && updatedHistory.length >= 3) {
    isTerminated = true
    terminationReason = 'entropy_threshold'
  } else if (updatedHistory.length >= maxSteps) {
    isTerminated = true
    terminationReason = 'max_steps'
  }

  const updatedSession: AdaptiveAssessmentSession = {
    ...session,
    step: nextStep,
    history: updatedHistory,
    stateProbabilities: posteriorProbabilities,
    itemMasteryProbabilities,
    currentEntropy: posteriorEntropy,
    mostLikelyStateId,
    confidence: maxP,
    nextSuggestedItemId: null,
    isTerminated,
    terminationReason,
  }

  if (!isTerminated) {
    const nextItem = selectOptimalNextItem(updatedSession, structure)
    updatedSession.nextSuggestedItemId = nextItem
    responseStep.suggestedNextItem = nextItem
  }

  return updatedSession
}

// ============================================================================
// 3. OPTIMAL ITEM SELECTION (Half-Split & Information Gain)
// ============================================================================

/**
 * Selects the optimal next assessment item using the Half-Split rule
 * (bisection of probability mass closest to 0.5) or Maximum Mutual Information.
 */
export function selectOptimalNextItem(
  session: AdaptiveAssessmentSession,
  structure: KnowledgeStructure,
  strategy: 'half_split' | 'max_entropy' = 'half_split',
): string | null {
  const answeredItemIds = new Set(session.history.map((h) => h.itemId))
  const candidateItems = structure.domainItems.filter((i) => !answeredItemIds.has(i.id))

  if (candidateItems.length === 0) return null

  if (strategy === 'half_split') {
    let bestItem: KSTItem | null = null
    let minDistanceToHalf = Infinity

    for (const item of candidateItems) {
      const p = session.itemMasteryProbabilities[item.id] ?? 0.5
      const distance = Math.abs(p - 0.5)

      if (distance < minDistanceToHalf) {
        minDistanceToHalf = distance
        bestItem = item
      }
    }

    return bestItem?.id || candidateItems[0]!.id
  }

  // Maximum Expected Information Gain
  let bestItem: KSTItem | null = null
  let maxInformationGain = -Infinity

  for (const item of candidateItems) {
    const infoGain = calculateExpectedInformationGain(session, structure, item)
    if (infoGain > maxInformationGain) {
      maxInformationGain = infoGain
      bestItem = item
    }
  }

  return bestItem?.id || candidateItems[0]!.id
}

/**
 * Computes the expected Shannon information gain I(K; R_q) for an item q.
 */
export function calculateExpectedInformationGain(
  session: AdaptiveAssessmentSession,
  structure: KnowledgeStructure,
  item: KSTItem,
): number {
  const currentEntropy = session.currentEntropy
  const beta = item.slipProbability
  const eta = item.guessProbability

  // Marginal probability of correct answer P(R = 1)
  let pCorrect = 0
  for (const state of structure.states) {
    const prior = session.stateProbabilities[state.stateId] || 0
    const knows = state.itemIds.includes(item.id)
    const likelihood = knows ? 1 - beta : eta
    pCorrect += prior * likelihood
  }
  const pIncorrect = 1 - pCorrect

  if (pCorrect <= 0 || pIncorrect <= 0) return 0

  // Posterior entropy if correct
  const postProbCorrect: Record<string, number> = {}
  for (const state of structure.states) {
    const prior = session.stateProbabilities[state.stateId] || 0
    const knows = state.itemIds.includes(item.id)
    const likelihood = knows ? 1 - beta : eta
    postProbCorrect[state.stateId] = (prior * likelihood) / pCorrect
  }
  const entropyCorrect = calculateShannonEntropy(postProbCorrect)

  // Posterior entropy if incorrect
  const postProbIncorrect: Record<string, number> = {}
  for (const state of structure.states) {
    const prior = session.stateProbabilities[state.stateId] || 0
    const knows = state.itemIds.includes(item.id)
    const likelihood = knows ? beta : 1 - eta
    postProbIncorrect[state.stateId] = (prior * likelihood) / pIncorrect
  }
  const entropyIncorrect = calculateShannonEntropy(postProbIncorrect)

  const expectedPostEntropy = pCorrect * entropyCorrect + pIncorrect * entropyIncorrect
  return Math.max(0, currentEntropy - expectedPostEntropy)
}

// ============================================================================
// 4. ENTROPY & PROBABILITY HELPERS
// ============================================================================

export function calculateItemMasteryProbabilities(
  stateProbabilities: Record<string, number>,
  structure: KnowledgeStructure,
): Record<string, number> {
  const itemProbabilities: Record<string, number> = {}

  for (const item of structure.domainItems) {
    let sum = 0
    for (const state of structure.states) {
      if (state.itemIds.includes(item.id)) {
        sum += stateProbabilities[state.stateId] || 0
      }
    }
    itemProbabilities[item.id] = Math.min(1.0, Math.max(0.0, sum))
  }

  return itemProbabilities
}

export function calculateShannonEntropy(probabilities: Record<string, number>): number {
  let entropy = 0
  for (const p of Object.values(probabilities)) {
    if (p > 1e-12) {
      entropy -= p * Math.log2(p)
    }
  }
  return Math.max(0, entropy)
}

// ============================================================================
// 5. DIAGNOSIS GENERATION
// ============================================================================

/**
 * Produces a full learner diagnosis from an active or completed assessment session.
 */
export function diagnoseLearner(
  session: AdaptiveAssessmentSession,
  structure: KnowledgeStructure,
): LearnerDiagnosis {
  const diagnosedState =
    structure.states.find((s) => s.stateId === session.mostLikelyStateId) || structure.states[0]!

  const fringes = computeFringes(diagnosedState.itemIds, structure)
  const itemMap = new Map(structure.domainItems.map((i) => [i.id, i]))

  const masteredItems = diagnosedState.itemIds
    .map((id) => itemMap.get(id)!)
    .filter((item): item is KSTItem => Boolean(item))

  const readyToLearnItems = fringes.outerFringe
    .map((id) => itemMap.get(id)!)
    .filter((item): item is KSTItem => Boolean(item))

  // Find prerequisite gaps for unmastered items not yet in outer fringe
  const prerequisiteGaps: Array<{ itemId: string; missingPrerequisites: string[] }> = []
  const masteredSet = new Set(diagnosedState.itemIds)

  for (const item of structure.domainItems) {
    if (!masteredSet.has(item.id) && !fringes.outerFringe.includes(item.id)) {
      // Find what prerequisites are missing for this item
      const missing: string[] = []
      for (const req of item.skillsRequired) {
        if (!masteredSet.has(req)) {
          missing.push(req)
        }
      }
      if (missing.length > 0) {
        prerequisiteGaps.push({
          itemId: item.id,
          missingPrerequisites: missing,
        })
      }
    }
  }

  return {
    diagnosedState,
    confidence: session.confidence,
    entropy: session.currentEntropy,
    innerFringe: fringes.innerFringe,
    outerFringe: fringes.outerFringe,
    masteredItems,
    readyToLearnItems,
    prerequisiteGaps,
  }
}
