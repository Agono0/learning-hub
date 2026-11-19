/**
 * Ashby COVIS (Competition between Verbal and Implicit Systems) Dual-System Model
 *
 * Grounded in:
 * - F. Gregory Ashby, L. Angela Alfonso-Reese, A. U. Turken, & E. M. Waldron (1998)
 *   "A neuropsychological theory of multiple systems in category learning."
 *   Psychological Review 105(3): 442-481.
 * - F. Gregory Ashby & Vivian V. Valentin (2017) "Multiple systems of perceptual
 *   category learning." Handbook of Categorization in Cognitive Science, pp. 157-186.
 * - F. Gregory Ashby & W. Todd Maddox (2005) "Human category learning."
 *   Annual Review of Psychology 56: 149-178.
 * - F. Gregory Ashby & W. Todd Maddox (2011) "Human category learning 2.0."
 *   Annals of the New York Academy of Sciences 1224: 147-161.
 *
 * Simulates and arbitrates the competition between the explicit, verbalizable
 * hypothesis-testing system (PFC / head of caudate) and the implicit, procedural
 * reinforcement-learning system (striatum / dopamine-mediated plasticity).
 */

import { z } from 'zod'

// ── Zod Schemas ──────────────────────────────────────────────────────────────

export const explicitRuleTypeSchema = z.enum([
  'unidimensional_threshold',
  'conjunctive_boundary',
  'disjunctive_boundary',
])
export type ExplicitRuleType = z.infer<typeof explicitRuleTypeSchema>

export const verbalHypothesisSchema = z.object({
  id: z.string(),
  ruleType: explicitRuleTypeSchema,
  dimensionIndex: z.number().int().min(0),
  secondaryDimensionIndex: z.number().int().min(0).optional(),
  threshold: z.number(),
  secondaryThreshold: z.number().optional(),
  direction: z.enum(['greater_than_or_equal', 'less_than']),
  secondaryDirection: z.enum(['greater_than_or_equal', 'less_than']).optional(),
  targetCategory: z.string(),
  alternateCategory: z.string(),
  description: z.string(),
  salienceWeight: z.number().min(0).default(1.0),
  consecutiveSuccesses: z.number().int().min(0).default(0),
  consecutiveFailures: z.number().int().min(0).default(0),
})
export type VerbalHypothesis = z.infer<typeof verbalHypothesisSchema>

export const covisTrialTelemetrySchema = z.object({
  trialNumber: z.number().int().min(1),
  stimulusId: z.string(),
  stimulusFeatures: z.array(z.number()),
  participantChoice: z.string().optional(),
  correctCategory: z.string(),
  verbalChoice: z.string(),
  verbalConfidence: z.number().min(0).max(1),
  proceduralChoice: z.string(),
  proceduralConfidence: z.number().min(0).max(1),
  systemsInConflict: z.boolean(),
  arbitratedSystem: z.enum(['verbal', 'procedural']),
  arbitratedChoice: z.string(),
  verbalTrust: z.number().min(0).max(1),
  proceduralTrust: z.number().min(0).max(1),
  activeRuleId: z.string(),
  ruleSwitched: z.boolean(),
})
export type CovisTrialTelemetry = z.infer<typeof covisTrialTelemetrySchema>

export const covisSessionEvaluationSchema = z.object({
  totalTrials: z.number().int(),
  verbalAccuracy: z.number().min(0).max(1),
  proceduralAccuracy: z.number().min(0).max(1),
  overallSystemAccuracy: z.number().min(0).max(1),
  participantAgreementWithVerbal: z.number().min(0).max(1),
  participantAgreementWithProcedural: z.number().min(0).max(1),
  conflictTrialCount: z.number().int(),
  conflictResolutionBias: z.enum(['verbal_dominant', 'procedural_dominant', 'balanced_hybrid']),
  automaticityTransitionIndex: z.number().min(0).max(1),
  ruleSwitchCount: z.number().int(),
  bestFittingSystem: z.enum(['verbal', 'procedural', 'dual_system']),
  logLikelihoodVerbal: z.number(),
  logLikelihoodProcedural: z.number(),
  logLikelihoodDual: z.number(),
  aicDifference: z.number(),
  bicDifference: z.number(),
  trials: z.array(covisTrialTelemetrySchema),
  neurocognitiveInsight: z.string(),
})
export type CovisSessionEvaluation = z.infer<typeof covisSessionEvaluationSchema>

// ── Explicit Verbal System (PFC / Executive Working Memory) ───────────────────

/**
 * Evaluate an explicit verbal rule on a stimulus feature vector.
 */
export function evaluateVerbalRule(
  rule: VerbalHypothesis,
  features: number[],
): { choice: string; confidence: number } {
  const d1 = features[rule.dimensionIndex] ?? 0
  const pass1 =
    rule.direction === 'greater_than_or_equal' ? d1 >= rule.threshold : d1 < rule.threshold

  let matches = pass1

  if (
    rule.ruleType === 'conjunctive_boundary' &&
    rule.secondaryDimensionIndex !== undefined &&
    rule.secondaryThreshold !== undefined
  ) {
    const d2 = features[rule.secondaryDimensionIndex] ?? 0
    const pass2 =
      rule.secondaryDirection === 'greater_than_or_equal'
        ? d2 >= rule.secondaryThreshold
        : d2 < rule.secondaryThreshold
    matches = pass1 && pass2
  } else if (
    rule.ruleType === 'disjunctive_boundary' &&
    rule.secondaryDimensionIndex !== undefined &&
    rule.secondaryThreshold !== undefined
  ) {
    const d2 = features[rule.secondaryDimensionIndex] ?? 0
    const pass2 =
      rule.secondaryDirection === 'greater_than_or_equal'
        ? d2 >= rule.secondaryThreshold
        : d2 < rule.secondaryThreshold
    matches = pass1 || pass2
  }

  const choice = matches ? rule.targetCategory : rule.alternateCategory

  // Distance from boundary determines verbal confidence
  const dist = Math.abs(d1 - rule.threshold)
  const confidence = Math.min(0.99, Math.max(0.55, 0.5 + 0.5 * Math.tanh(dist * 3)))

  return { choice, confidence }
}

/**
 * Generate candidate verbal hypothesis pool for a stimulus dimension space.
 */
export function generateCandidateRulePool(
  dimensionCount: number,
  categoryA: string,
  categoryB: string,
  featureMin = 0.0,
  featureMax = 1.0,
  granularity = 4,
): VerbalHypothesis[] {
  const pool: VerbalHypothesis[] = []
  const step = (featureMax - featureMin) / (granularity + 1)

  let idCounter = 1

  // 1. Unidimensional threshold rules (1D)
  for (let dim = 0; dim < dimensionCount; dim++) {
    for (let g = 1; g <= granularity; g++) {
      const threshold = featureMin + g * step
      // Dir 1: >= threshold -> A
      pool.push({
        id: `rule-1d-d${dim}-g${idCounter++}`,
        ruleType: 'unidimensional_threshold',
        dimensionIndex: dim,
        threshold: Math.round(threshold * 100) / 100,
        direction: 'greater_than_or_equal',
        targetCategory: categoryA,
        alternateCategory: categoryB,
        description: `Dim ${dim + 1} >= ${threshold.toFixed(2)} -> ${categoryA}`,
        salienceWeight: 1.0,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
      })

      // Dir 2: < threshold -> A
      pool.push({
        id: `rule-1d-d${dim}-l${idCounter++}`,
        ruleType: 'unidimensional_threshold',
        dimensionIndex: dim,
        threshold: Math.round(threshold * 100) / 100,
        direction: 'less_than',
        targetCategory: categoryA,
        alternateCategory: categoryB,
        description: `Dim ${dim + 1} < ${threshold.toFixed(2)} -> ${categoryA}`,
        salienceWeight: 1.0,
        consecutiveSuccesses: 0,
        consecutiveFailures: 0,
      })
    }
  }

  // 2. Conjunctive 2D rules if dimensionCount >= 2
  if (dimensionCount >= 2) {
    const mid = (featureMin + featureMax) / 2
    for (let d1 = 0; d1 < Math.min(3, dimensionCount); d1++) {
      for (let d2 = d1 + 1; d2 < Math.min(3, dimensionCount); d2++) {
        pool.push({
          id: `rule-2d-conj-${idCounter++}`,
          ruleType: 'conjunctive_boundary',
          dimensionIndex: d1,
          secondaryDimensionIndex: d2,
          threshold: mid,
          secondaryThreshold: mid,
          direction: 'greater_than_or_equal',
          secondaryDirection: 'greater_than_or_equal',
          targetCategory: categoryA,
          alternateCategory: categoryB,
          description: `Dim ${d1 + 1} >= ${mid.toFixed(2)} AND Dim ${d2 + 1} >= ${mid.toFixed(2)} -> ${categoryA}`,
          salienceWeight: 0.7, // Working memory complexity discount
          consecutiveSuccesses: 0,
          consecutiveFailures: 0,
        })
      }
    }
  }

  return pool
}

// ── Implicit Procedural System (Striatum / Dopamine RL) ────────────────────────

export interface ProceduralWeightState {
  categoryCentroids: Record<string, number[]>
  prototypeWeights: Record<string, number>
  learningRate: number
  sensitivity: number
}

/**
 * Initialize procedural system state.
 */
export function initProceduralState(
  categories: string[],
  dimensionCount: number,
  learningRate = 0.08,
  sensitivity = 2.5,
): ProceduralWeightState {
  const categoryCentroids: Record<string, number[]> = {}
  const prototypeWeights: Record<string, number> = {}

  for (const cat of categories) {
    categoryCentroids[cat] = new Array(dimensionCount).fill(0.5)
    prototypeWeights[cat] = 1.0
  }

  return {
    categoryCentroids,
    prototypeWeights,
    learningRate,
    sensitivity,
  }
}

/**
 * Compute procedural system choice and activation via radial basis similarity:
 * Act(C) = Weight_C * exp( - sensitivity * ||x - Centroid_C||^2 )
 */
export function evaluateProceduralSystem(
  state: ProceduralWeightState,
  features: number[],
  categories: string[],
): { choice: string; confidence: number; categoryProbabilities: Record<string, number> } {
  const activations: Record<string, number> = {}
  let totalAct = 0

  for (const cat of categories) {
    const centroid = state.categoryCentroids[cat] ?? new Array(features.length).fill(0.5)
    let distSq = 0
    for (let i = 0; i < features.length; i++) {
      const diff = (features[i] ?? 0) - (centroid[i] ?? 0)
      distSq += diff * diff
    }
    const act = (state.prototypeWeights[cat] ?? 1.0) * Math.exp(-state.sensitivity * distSq)
    activations[cat] = act
    totalAct += act
  }

  const categoryProbabilities: Record<string, number> = {}
  let bestCat = categories[0] ?? 'A'
  let bestProb = 0

  for (const cat of categories) {
    const prob = totalAct > 0 ? (activations[cat] ?? 0) / totalAct : 1 / categories.length
    categoryProbabilities[cat] = prob
    if (prob > bestProb) {
      bestProb = prob
      bestCat = cat
    }
  }

  return {
    choice: bestCat,
    confidence: bestProb,
    categoryProbabilities,
  }
}

/**
 * Update procedural system weights using dopamine reinforcement learning
 * prediction error delta = Reward - P(Choice):
 * Centroid_C += learningRate * delta * (features - Centroid_C)
 */
export function updateProceduralState(
  state: ProceduralWeightState,
  features: number[],
  correctCategory: string,
  chosenCategory: string,
  wasCorrect: boolean,
): ProceduralWeightState {
  const newState: ProceduralWeightState = {
    categoryCentroids: { ...state.categoryCentroids },
    prototypeWeights: { ...state.prototypeWeights },
    learningRate: state.learningRate,
    sensitivity: state.sensitivity,
  }

  const reward = wasCorrect ? 1.0 : 0.0
  const centroid = [
    ...(newState.categoryCentroids[correctCategory] ?? new Array(features.length).fill(0.5)),
  ]

  // Prediction error delta
  const delta = reward - (chosenCategory === correctCategory ? 0.7 : 0.3)

  for (let i = 0; i < features.length; i++) {
    centroid[i] += newState.learningRate * delta * ((features[i] ?? 0) - centroid[i]!)
  }
  newState.categoryCentroids[correctCategory] = centroid

  // Reinforce prototype weight
  if (wasCorrect) {
    newState.prototypeWeights[correctCategory] =
      (newState.prototypeWeights[correctCategory] ?? 1) + 0.02
  }

  return newState
}

// ── COVIS System Competition & Arbitration Gating ─────────────────────────────

/**
 * Compute the arbitration gate probability that the verbal system controls
 * the behavioral response on trial t (Ashby et al. 1998):
 * P(System = Verbal) = 1 / ( 1 + exp( - lambda * (Trust_Verbal - Trust_Procedural) ) )
 */
export function calculateArbitrationGate(
  verbalTrust: number,
  proceduralTrust: number,
  lambda = 4.0,
): { verbalGateProb: number; winningSystem: 'verbal' | 'procedural' } {
  const diff = verbalTrust - proceduralTrust
  const verbalGateProb = 1 / (1 + Math.exp(-lambda * diff))
  const winningSystem = verbalGateProb >= 0.5 ? 'verbal' : 'procedural'
  return { verbalGateProb, winningSystem }
}

/**
 * Simulate or evaluate a full categorization session through Ashby's COVIS
 * dual-system model.
 */
export function evaluateCovisSession(
  stimuli: Array<{
    id: string
    features: number[]
    correctCategory: string
    participantChoice?: string
  }>,
  options?: {
    categories?: string[]
    initialRulePool?: VerbalHypothesis[]
    proceduralLearningRate?: number
    ruleSwitchThreshold?: number // Consecutive failures before rule switch (default 2)
  },
): CovisSessionEvaluation {
  const categories = options?.categories ?? ['A', 'B']
  const catA = categories[0] ?? 'A'
  const catB = categories[1] ?? 'B'
  const dimensionCount = stimuli[0]?.features.length ?? 2

  const rulePool = options?.initialRulePool ?? generateCandidateRulePool(dimensionCount, catA, catB)
  let activeRuleIndex = 0

  let proceduralState = initProceduralState(
    categories,
    dimensionCount,
    options?.proceduralLearningRate ?? 0.08,
  )

  const ruleSwitchThreshold = options?.ruleSwitchThreshold ?? 2

  let verbalTrust = 0.65 // Initial bias towards verbal rules (Ashby 1998)
  let proceduralTrust = 0.35

  const trials: CovisTrialTelemetry[] = []
  let verbalCorrectCount = 0
  let proceduralCorrectCount = 0
  let arbitratedCorrectCount = 0
  let participantVerbalAgreements = 0
  let participantProceduralAgreements = 0
  let conflictTrialCount = 0
  let ruleSwitchCount = 0

  let llVerbal = 0
  let llProcedural = 0
  let llDual = 0

  for (let t = 0; t < stimuli.length; t++) {
    const stim = stimuli[t]!
    const activeRule = rulePool[activeRuleIndex]!

    // 1. Evaluate Verbal System
    const verbalResult = evaluateVerbalRule(activeRule, stim.features)

    // 2. Evaluate Procedural System
    const proceduralResult = evaluateProceduralSystem(proceduralState, stim.features, categories)

    // 3. Detect System Conflict
    const systemsInConflict = verbalResult.choice !== proceduralResult.choice
    if (systemsInConflict) conflictTrialCount++

    // 4. Arbitrate Gating
    const { verbalGateProb, winningSystem } = calculateArbitrationGate(verbalTrust, proceduralTrust)
    const arbitratedChoice =
      winningSystem === 'verbal' ? verbalResult.choice : proceduralResult.choice

    const verbalWasCorrect = verbalResult.choice === stim.correctCategory
    const proceduralWasCorrect = proceduralResult.choice === stim.correctCategory
    const arbitratedWasCorrect = arbitratedChoice === stim.correctCategory

    if (verbalWasCorrect) verbalCorrectCount++
    if (proceduralWasCorrect) proceduralCorrectCount++
    if (arbitratedWasCorrect) arbitratedCorrectCount++

    // Participant telemetry if present
    if (stim.participantChoice) {
      if (stim.participantChoice === verbalResult.choice) participantVerbalAgreements++
      if (stim.participantChoice === proceduralResult.choice) participantProceduralAgreements++

      // Log likelihoods
      const pVerbal =
        stim.participantChoice === verbalResult.choice
          ? verbalResult.confidence
          : 1 - verbalResult.confidence
      const pProcedural =
        stim.participantChoice === proceduralResult.choice
          ? proceduralResult.confidence
          : 1 - proceduralResult.confidence
      const pDual = verbalGateProb * pVerbal + (1 - verbalGateProb) * pProcedural

      llVerbal += Math.log(Math.max(1e-6, pVerbal))
      llProcedural += Math.log(Math.max(1e-6, pProcedural))
      llDual += Math.log(Math.max(1e-6, pDual))
    }

    // 5. Update Verbal System (Win-Stay, Lose-Shift hypothesis testing)
    let ruleSwitched = false
    if (verbalWasCorrect) {
      activeRule.consecutiveSuccesses++
      activeRule.consecutiveFailures = 0
      verbalTrust = Math.min(0.95, verbalTrust + 0.04)
    } else {
      activeRule.consecutiveFailures++
      activeRule.consecutiveSuccesses = 0
      verbalTrust = Math.max(0.1, verbalTrust - 0.08)

      // Lose-Shift: switch hypothesis if consecutive failures reached
      if (activeRule.consecutiveFailures >= ruleSwitchThreshold) {
        ruleSwitched = true
        ruleSwitchCount++
        // Select next most salient rule
        activeRuleIndex = (activeRuleIndex + 1) % rulePool.length
      }
    }

    // 6. Update Procedural System (Dopamine RL plasticity)
    proceduralState = updateProceduralState(
      proceduralState,
      stim.features,
      stim.correctCategory,
      proceduralResult.choice,
      proceduralWasCorrect,
    )
    if (proceduralWasCorrect) {
      proceduralTrust = Math.min(0.95, proceduralTrust + 0.03)
    } else {
      proceduralTrust = Math.max(0.1, proceduralTrust - 0.03)
    }

    trials.push({
      trialNumber: t + 1,
      stimulusId: stim.id,
      stimulusFeatures: stim.features,
      participantChoice: stim.participantChoice,
      correctCategory: stim.correctCategory,
      verbalChoice: verbalResult.choice,
      verbalConfidence: Math.round(verbalResult.confidence * 1000) / 1000,
      proceduralChoice: proceduralResult.choice,
      proceduralConfidence: Math.round(proceduralResult.confidence * 1000) / 1000,
      systemsInConflict,
      arbitratedSystem: winningSystem,
      arbitratedChoice,
      verbalTrust: Math.round(verbalTrust * 1000) / 1000,
      proceduralTrust: Math.round(proceduralTrust * 1000) / 1000,
      activeRuleId: activeRule.id,
      ruleSwitched,
    })
  }

  const totalTrials = stimuli.length
  const verbalAccuracy = totalTrials > 0 ? verbalCorrectCount / totalTrials : 0
  const proceduralAccuracy = totalTrials > 0 ? proceduralCorrectCount / totalTrials : 0
  const overallSystemAccuracy = totalTrials > 0 ? arbitratedCorrectCount / totalTrials : 0

  const participantAgreementWithVerbal =
    totalTrials > 0 ? participantVerbalAgreements / totalTrials : 0
  const participantAgreementWithProcedural =
    totalTrials > 0 ? participantProceduralAgreements / totalTrials : 0

  // Automaticity transition index: ratio of procedural dominance in final third vs first third
  const third = Math.max(1, Math.floor(totalTrials / 3))
  const firstThirdProcedural =
    trials.slice(0, third).filter((t) => t.arbitratedSystem === 'procedural').length / third
  const finalThirdProcedural =
    trials.slice(totalTrials - third).filter((t) => t.arbitratedSystem === 'procedural').length /
    third
  const automaticityTransitionIndex = Math.min(
    1.0,
    Math.max(0, finalThirdProcedural - firstThirdProcedural + 0.5),
  )

  let conflictResolutionBias: CovisSessionEvaluation['conflictResolutionBias']
  if (participantAgreementWithVerbal > participantAgreementWithProcedural + 0.15) {
    conflictResolutionBias = 'verbal_dominant'
  } else if (participantAgreementWithProcedural > participantAgreementWithVerbal + 0.15) {
    conflictResolutionBias = 'procedural_dominant'
  } else {
    conflictResolutionBias = 'balanced_hybrid'
  }

  // Model comparison: AIC = 2k - 2ln(L)
  // Verbal: k = 2 (threshold + confidence)
  // Procedural: k = 2 (learningRate + sensitivity)
  // Dual: k = 4
  const aicVerbal = 2 * 2 - 2 * llVerbal
  const aicProcedural = 2 * 2 - 2 * llProcedural
  const aicDual = 2 * 4 - 2 * llDual

  const bestAic = Math.min(aicVerbal, aicProcedural, aicDual)
  let bestFittingSystem: CovisSessionEvaluation['bestFittingSystem']
  if (bestAic === aicDual) bestFittingSystem = 'dual_system'
  else if (bestAic === aicVerbal) bestFittingSystem = 'verbal'
  else bestFittingSystem = 'procedural'

  // BIC = k ln(n) - 2ln(L)
  const lnN = Math.log(Math.max(1, totalTrials))
  const bicVerbal = 2 * lnN - 2 * llVerbal
  const bicDual = 4 * lnN - 2 * llDual

  let neurocognitiveInsight: string
  if (bestFittingSystem === 'verbal') {
    neurocognitiveInsight = `Participant behaves primarily via explicit hypothesis-testing (prefrontal working-memory system). High rule consistency with ${ruleSwitchCount} rule revisions.`
  } else if (bestFittingSystem === 'procedural') {
    neurocognitiveInsight = `Participant behavior is governed by striatal implicit procedural integration. Performance does not align with unidimensional verbal rules; information integration observed.`
  } else {
    neurocognitiveInsight = `Dual-system competition detected (COVIS arbitration). Early trials engage conscious verbal hypotheses, transferring to automatic procedural execution as automaticity index reached ${(automaticityTransitionIndex * 100).toFixed(0)}%.`
  }

  return {
    totalTrials,
    verbalAccuracy: Math.round(verbalAccuracy * 1000) / 1000,
    proceduralAccuracy: Math.round(proceduralAccuracy * 1000) / 1000,
    overallSystemAccuracy: Math.round(overallSystemAccuracy * 1000) / 1000,
    participantAgreementWithVerbal: Math.round(participantAgreementWithVerbal * 1000) / 1000,
    participantAgreementWithProcedural:
      Math.round(participantAgreementWithProcedural * 1000) / 1000,
    conflictTrialCount,
    conflictResolutionBias,
    automaticityTransitionIndex: Math.round(automaticityTransitionIndex * 1000) / 1000,
    ruleSwitchCount,
    bestFittingSystem,
    logLikelihoodVerbal: Math.round(llVerbal * 100) / 100,
    logLikelihoodProcedural: Math.round(llProcedural * 100) / 100,
    logLikelihoodDual: Math.round(llDual * 100) / 100,
    aicDifference: Math.round((aicVerbal - aicProcedural) * 100) / 100,
    bicDifference: Math.round((bicVerbal - bicDual) * 100) / 100,
    trials,
    neurocognitiveInsight,
  }
}
