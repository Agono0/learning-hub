/**
 * @file hypercorrection-engine.ts
 * @module @learning-hub/core/metacognition
 * @description Dynamic Self-Regulated Metacognitive Calibration & Hypercorrection Engine.
 *
 * Implements:
 * 1. Thomas O. Nelson & Louis Narens (1990) "Metamemory: A Theoretical Framework and New Findings"
 *    - Dual-level metacognitive control architecture (Object-Level vs Meta-Level).
 *    - Prospective Monitoring: Ease-of-Learning (EOL), Judgment-of-Learning (JOL).
 *    - Immediate / Retrospective Monitoring: Feeling-of-Knowing (FOK), Retrospective Confidence Judgments (RCJ).
 * 2. Edward C. Butterfield & Janet Metcalfe (2001, 2006) "The Hypercorrection Effect"
 *    - Epistemic prediction error / cognitive surprise dynamics: errors made with high confidence
 *      elicit an attention surge, P300 event-related potential mobilization, and are corrected
 *      dramatically faster and retained longer than low-confidence errors.
 * 3. Leo A. Goodman & William H. Kruskal (1954, 1972) Gamma Correlation (γ):
 *    - Nonparametric rank correlation measuring metacognitive resolution / discrimination.
 * 4. Allan H. Murphy (1973) Brier Score Partitioning:
 *    - Brier Score = Reliability (Calibration Error) - Resolution + Uncertainty (Base Rate).
 * 5. Asher Koriat & Robert A. Bjork (2005) "Illusions of Competence in Monitoring One's Knowledge":
 *    - Detection of fluency fallacies, intuitive physics heuristics, and lexical familiarity illusions.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// 1. Types & Zod Schemas
// ---------------------------------------------------------------------------

export const cognitiveIllusionTypeSchema = z.enum([
  'fluency_illusion',
  'intuitive_physics_bias',
  'conjunction_fallacy',
  'lexical_familiarity',
  'availability_cascade',
  'gambler_fallacy',
  'memory_concurrency_illusion',
])

export type CognitiveIllusionType = z.infer<typeof cognitiveIllusionTypeSchema>

export const crucibleOptionSchema = z.object({
  id: z.string(),
  text: z.string(),
  isCorrect: z.boolean(),
  illusionType: cognitiveIllusionTypeSchema.optional(),
  misconceptionRationale: z.string(),
})

export type CrucibleOption = z.infer<typeof crucibleOptionSchema>

export const epistemicCrucibleItemSchema = z.object({
  id: z.string(),
  domain: z.enum([
    'physics_thermodynamics',
    'cognitive_heuristics',
    'probability_fallacies',
    'systems_concurrency',
    'neuroscience_myths',
  ]),
  title: z.string(),
  stem: z.string(),
  options: z.array(crucibleOptionSchema).min(2),
  canonicalScientificExplanation: z.string(),
  epistemicPredictionErrorExplanation: z.string(),
  counterEvidence: z.string(),
  subGoalChunking: z.array(z.string()),
})

export type EpistemicCrucibleItem = z.infer<typeof epistemicCrucibleItemSchema>

export const trialMetacognitiveRecordSchema = z.object({
  itemId: z.string(),
  selectedOptionId: z.string(),
  isCorrect: z.boolean(),
  /** Prospective Judgment of Learning before viewing options (0 to 1) */
  prospectiveJOL: z.number().min(0).max(1),
  /** Retrospective subjective confidence rating after choosing answer (0 to 1) */
  retrospectiveConfidence: z.number().min(0).max(1),
  responseLatencyMs: z.number().min(0),
  /** Epistemic surprise index: Confidence * (1 - Accuracy) */
  epistemicSurpriseScore: z.number().min(0).max(1),
  /** High confidence error (Confidence >= 0.70 and !isCorrect) */
  isHypercorrectionCandidate: z.boolean(),
  detectedIllusion: cognitiveIllusionTypeSchema.optional(),
})

export type TrialMetacognitiveRecord = z.infer<typeof trialMetacognitiveRecordSchema>

export interface CalibrationBin {
  binMin: number
  binMax: number
  label: string
  trialCount: number
  meanConfidence: number
  meanAccuracy: number
  calibrationError: number // (meanConfidence - meanAccuracy)^2
}

export interface MurphyBrierDecomposition {
  overallBrier: number
  reliability: number // Calibration error: lower is better (0 = perfect calibration)
  resolution: number // Ability to discriminate correct vs incorrect: higher is better
  uncertainty: number // Base rate variance: p*(1-p)
}

export interface MetacognitiveCalibrationProfile {
  sampleSize: number
  overallAccuracy: number
  meanConfidence: number
  brierScore: number
  murphyDecomposition: MurphyBrierDecomposition
  goodmanKruskalGamma: number // Metacognitive resolution (-1.0 to +1.0)
  absoluteOverconfidenceBias: number // meanConfidence - overallAccuracy
  calibrationBins: CalibrationBin[]
  hypercorrectionOpportunityRate: number // HCE count / total errors
  hypercorrectionCount: number
  metacognitiveCalibrationIndex: number // 0 to 100 composite calibration quality
  status:
    | 'expertly_calibrated'
    | 'severe_fluency_illusion'
    | 'mild_overconfidence'
    | 'underconfident_impostor'
    | 'uncalibrated_guessing'
  dominantCognitiveIllusion: CognitiveIllusionType | null
  recommendations: string[]
}

// ---------------------------------------------------------------------------
// 2. Goodman-Kruskal Gamma (γ) Nonparametric Rank Correlation
// ---------------------------------------------------------------------------

/**
 * Calculates Goodman & Kruskal's Gamma (γ) for metacognitive resolution:
 * Measures whether items given higher confidence ratings are genuinely more likely
 * to be correct than items given lower confidence ratings.
 *
 * γ = (C - D) / (C + D)
 * where C is concordant pairs, D is discordant pairs.
 * If C + D == 0, returns 0.
 */
export function calculateGoodmanKruskalGamma(trials: TrialMetacognitiveRecord[]): number {
  if (trials.length < 2) return 0

  let concordant = 0
  let discordant = 0

  for (let i = 0; i < trials.length; i++) {
    for (let j = i + 1; j < trials.length; j++) {
      const ti = trials[i]!
      const tj = trials[j]!

      const confDiff = ti.retrospectiveConfidence - tj.retrospectiveConfidence
      const accDiff = (ti.isCorrect ? 1 : 0) - (tj.isCorrect ? 1 : 0)

      if (confDiff === 0 || accDiff === 0) {
        // Tied pairs are ignored in Goodman-Kruskal gamma
        continue
      }

      if ((confDiff > 0 && accDiff > 0) || (confDiff < 0 && accDiff < 0)) {
        concordant++
      } else {
        discordant++
      }
    }
  }

  const denominator = concordant + discordant
  if (denominator === 0) return 0
  const gamma = (concordant - discordant) / denominator
  return Number(Math.max(-1, Math.min(1, gamma)).toFixed(3))
}

// ---------------------------------------------------------------------------
// 3. Murphy (1973) Brier Score Decomposition & Calibration Bins
// ---------------------------------------------------------------------------

const DEFAULT_BIN_BOUNDS = [
  { min: 0.0, max: 0.2, label: '0-20% (Low Guess)' },
  { min: 0.2, max: 0.4, label: '20-40% (Uncertain)' },
  { min: 0.4, max: 0.6, label: '40-60% (Moderate)' },
  { min: 0.6, max: 0.8, label: '60-80% (Confident)' },
  { min: 0.8, max: 1.0001, label: '80-100% (Certain)' },
]

/**
 * Decomposes Brier Score into Reliability (Calibration), Resolution, and Uncertainty.
 * Murphy (1973): BS = Reliability - Resolution + Uncertainty
 */
export function calculateMurphyBrierDecomposition(trials: TrialMetacognitiveRecord[]): {
  decomposition: MurphyBrierDecomposition
  bins: CalibrationBin[]
} {
  if (trials.length === 0) {
    return {
      decomposition: { overallBrier: 0, reliability: 0, resolution: 0, uncertainty: 0 },
      bins: DEFAULT_BIN_BOUNDS.map((b) => ({
        binMin: b.min,
        binMax: b.max,
        label: b.label,
        trialCount: 0,
        meanConfidence: 0,
        meanAccuracy: 0,
        calibrationError: 0,
      })),
    }
  }

  const N = trials.length
  const totalCorrect = trials.filter((t) => t.isCorrect).length
  const baseRate = totalCorrect / N
  const uncertainty = baseRate * (1 - baseRate)

  // Bin trials by confidence
  const bins: CalibrationBin[] = DEFAULT_BIN_BOUNDS.map((bound) => {
    const inBin = trials.filter(
      (t) => t.retrospectiveConfidence >= bound.min && t.retrospectiveConfidence < bound.max,
    )
    const count = inBin.length
    if (count === 0) {
      return {
        binMin: bound.min,
        binMax: bound.max,
        label: bound.label,
        trialCount: 0,
        meanConfidence: (bound.min + bound.max) / 2,
        meanAccuracy: 0,
        calibrationError: 0,
      }
    }

    const meanConf = inBin.reduce((acc, t) => acc + t.retrospectiveConfidence, 0) / count
    const meanAcc = inBin.filter((t) => t.isCorrect).length / count
    const err = Math.pow(meanConf - meanAcc, 2)

    return {
      binMin: bound.min,
      binMax: bound.max,
      label: bound.label,
      trialCount: count,
      meanConfidence: Number(meanConf.toFixed(3)),
      meanAccuracy: Number(meanAcc.toFixed(3)),
      calibrationError: Number(err.toFixed(4)),
    }
  })

  // Reliability = (1/N) * sum(n_k * (f_k - o_k)^2)
  let reliability = 0
  // Resolution = (1/N) * sum(n_k * (o_k - baseRate)^2)
  let resolution = 0

  for (const bin of bins) {
    if (bin.trialCount > 0) {
      reliability += (bin.trialCount / N) * Math.pow(bin.meanConfidence - bin.meanAccuracy, 2)
      resolution += (bin.trialCount / N) * Math.pow(bin.meanAccuracy - baseRate, 2)
    }
  }

  // Raw Brier Score
  const rawBrier =
    trials.reduce((acc, t) => {
      const outcome = t.isCorrect ? 1 : 0
      return acc + Math.pow(t.retrospectiveConfidence - outcome, 2)
    }, 0) / N

  return {
    decomposition: {
      overallBrier: Number(rawBrier.toFixed(3)),
      reliability: Number(reliability.toFixed(3)),
      resolution: Number(resolution.toFixed(3)),
      uncertainty: Number(uncertainty.toFixed(3)),
    },
    bins,
  }
}

// ---------------------------------------------------------------------------
// 4. Full Calibration Profile Evaluator
// ---------------------------------------------------------------------------

export function evaluateMetacognitiveCalibrationProfile(
  trials: TrialMetacognitiveRecord[],
): MetacognitiveCalibrationProfile {
  if (trials.length === 0) {
    return {
      sampleSize: 0,
      overallAccuracy: 0,
      meanConfidence: 0,
      brierScore: 0,
      murphyDecomposition: { overallBrier: 0, reliability: 0, resolution: 0, uncertainty: 0 },
      goodmanKruskalGamma: 0,
      absoluteOverconfidenceBias: 0,
      calibrationBins: [],
      hypercorrectionOpportunityRate: 0,
      hypercorrectionCount: 0,
      metacognitiveCalibrationIndex: 100,
      status: 'expertly_calibrated',
      dominantCognitiveIllusion: null,
      recommendations: [
        'Complete epistemic calibration trials to profile metacognitive monitoring.',
      ],
    }
  }

  const N = trials.length
  const correctCount = trials.filter((t) => t.isCorrect).length
  const overallAccuracy = Number((correctCount / N).toFixed(3))
  const meanConfidence = Number(
    (trials.reduce((acc, t) => acc + t.retrospectiveConfidence, 0) / N).toFixed(3),
  )

  const gamma = calculateGoodmanKruskalGamma(trials)
  const { decomposition, bins } = calculateMurphyBrierDecomposition(trials)
  const absoluteBias = Number((meanConfidence - overallAccuracy).toFixed(3))

  // Hypercorrection dynamics (Butterfield & Metcalfe 2001)
  const errorTrials = trials.filter((t) => !t.isCorrect)
  const hypercorrectionTrials = errorTrials.filter((t) => t.isHypercorrectionCandidate)
  const hypercorrectionCount = hypercorrectionTrials.length
  const hypercorrectionOpportunityRate =
    errorTrials.length > 0 ? Number((hypercorrectionCount / errorTrials.length).toFixed(3)) : 0

  // Identify dominant cognitive illusion
  const illusionCounts: Record<string, number> = {}
  for (const t of trials) {
    if (t.detectedIllusion) {
      illusionCounts[t.detectedIllusion] = (illusionCounts[t.detectedIllusion] ?? 0) + 1
    }
  }
  let dominantIllusion: CognitiveIllusionType | null = null
  let maxIllusionCount = 0
  for (const [illusion, count] of Object.entries(illusionCounts)) {
    if (count > maxIllusionCount) {
      maxIllusionCount = count
      dominantIllusion = illusion as CognitiveIllusionType
    }
  }

  // Composite Metacognitive Calibration Index (MCI: 0 to 100)
  // Penalize high Brier (0 best, 1 worst), penalize bias, reward positive gamma
  const brierFactor = Math.max(0, 1 - decomposition.overallBrier) * 40
  const gammaFactor = Math.max(0, (gamma + 1) / 2) * 35
  const biasFactor = Math.max(0, 1 - Math.abs(absoluteBias)) * 25
  const mci = Math.round(brierFactor + gammaFactor + biasFactor)

  // Status & Recommendations
  let status: MetacognitiveCalibrationProfile['status'] = 'expertly_calibrated'
  const recommendations: string[] = []

  if (absoluteBias > 0.25 || (absoluteBias > 0 && decomposition.overallBrier > 0.35)) {
    status = 'severe_fluency_illusion'
    recommendations.push(
      'Severe Fluency Illusion detected (Koriat & Bjork 2005): You are mistaking lexical familiarity for mechanistic comprehension.',
    )
    recommendations.push(
      'Switch from passive recognition to active production (proofs, derivations, Feynman teach-back) before trusting subjective confidence.',
    )
  } else if (absoluteBias > 0.1) {
    status = 'mild_overconfidence'
    recommendations.push(
      'Mild overconfidence bias: Your predictions outpace empirical recall by ~' +
        Math.round(absoluteBias * 100) +
        '%.',
    )
    recommendations.push(
      'Practice delayed JOLs: Pause 30 seconds after studying before predicting recallability.',
    )
  } else if (absoluteBias < -0.15) {
    status = 'underconfident_impostor'
    recommendations.push(
      'Underconfidence / Impostor Bias: Your empirical accuracy is significantly higher than your self-ratings.',
    )
    recommendations.push(
      'Trust your internal knowledge representations; you retain more than your subjective feeling reflects.',
    )
  } else if (gamma < 0.2 && trials.length >= 4) {
    status = 'uncalibrated_guessing'
    recommendations.push(
      'Low Metacognitive Discrimination (γ = ' +
        gamma +
        '): High and low confidence do not distinguish correct from incorrect items.',
    )
    recommendations.push(
      'Focus on error-monitoring cues and response latency telemetry to calibrate uncertainty.',
    )
  } else {
    recommendations.push(
      'Excellent Metacognitive Alignment: Your confidence judgments accurately reflect probabilistic recallability.',
    )
    recommendations.push(
      'Maintain continuous calibration checks across challenging boundary concepts.',
    )
  }

  if (hypercorrectionCount > 0) {
    recommendations.push(
      `Leverage Hypercorrection Effect (Butterfield & Metcalfe 2001): ${hypercorrectionCount} high-confidence errors identified. These possess maximum epistemic prediction error and can be permanently fixed with immediate corrective review.`,
    )
  }

  return {
    sampleSize: N,
    overallAccuracy,
    meanConfidence,
    brierScore: decomposition.overallBrier,
    murphyDecomposition: decomposition,
    goodmanKruskalGamma: gamma,
    absoluteOverconfidenceBias: absoluteBias,
    calibrationBins: bins,
    hypercorrectionOpportunityRate,
    hypercorrectionCount,
    metacognitiveCalibrationIndex: Math.min(100, Math.max(0, mci)),
    status,
    dominantCognitiveIllusion: dominantIllusion,
    recommendations,
  }
}

// ---------------------------------------------------------------------------
// 5. Calibrated Epistemic Crucible Problem Bank
// ---------------------------------------------------------------------------

export const EPISTEMIC_CRUCIBLE_PROBLEMS: Record<string, EpistemicCrucibleItem> = {
  crucible_thermal_equilibrium: {
    id: 'crucible_thermal_equilibrium',
    domain: 'physics_thermodynamics',
    title: 'Thermal Sensation & Equilibrium Invariant',
    stem: 'A metal spoon and a wooden spoon have been sitting undisturbed on the same kitchen table in an air-conditioned 20°C (68°F) room for 24 hours. When you touch both spoons with bare hands, why does the metal spoon feel colder?',
    options: [
      {
        id: 'opt_metal_temp',
        text: 'The metal spoon is at a lower temperature because metal naturally absorbs and retains cold.',
        isCorrect: false,
        illusionType: 'intuitive_physics_bias',
        misconceptionRationale:
          'Violates the Zeroth Law of Thermodynamics. Objects in thermal equilibrium with the environment share identical temperature.',
      },
      {
        id: 'opt_thermal_cond',
        text: 'Both spoons are at the exact same 20°C temperature; metal has much higher thermal conductivity (k ≈ 50-400 W/m·K vs wood k ≈ 0.15 W/m·K), conducting heat away from your 37°C finger much faster.',
        isCorrect: true,
        misconceptionRationale: '',
      },
      {
        id: 'opt_wood_heat',
        text: 'The wooden spoon generates internal biological heat from microscopic cellular friction, keeping it warmer.',
        isCorrect: false,
        illusionType: 'intuitive_physics_bias',
        misconceptionRationale:
          'Dead wood has zero metabolic activity; it cannot produce endogenous heat.',
      },
      {
        id: 'opt_specific_heat',
        text: 'The metal spoon has a higher specific heat capacity than wood, causing it to drop temperature faster.',
        isCorrect: false,
        illusionType: 'lexical_familiarity',
        misconceptionRationale:
          'Wood actually has a higher specific heat capacity (~1700 J/kg·K) than steel (~500 J/kg·K); sensory sensation is driven by thermal conductivity.',
      },
    ],
    canonicalScientificExplanation:
      'Human cutaneous thermoreceptors measure heat flux (rate of thermal energy transfer per unit area dq/dt = -k ∇T), NOT absolute temperature. Since both spoons are in thermal equilibrium with the 20°C room, both are at 20°C. Metal conducts heat away from 37°C skin orders of magnitude faster than wood.',
    epistemicPredictionErrorExplanation:
      'The intuitive sensory perception "metal is colder" is a sensory illusion. The sensory system measures rate of heat loss from your skin, conflating high thermal conductivity with low ambient temperature.',
    counterEvidence:
      'If you place a thermocouple or digital infrared thermometer on both spoons, both register 20.0°C ± 0.1°C.',
    subGoalChunking: [
      'Apply Zeroth Law: 24h immersion guarantees identical temperature T_spoon = T_room = 20°C.',
      'Identify cutaneous sensory transducer: human skin detects heat flux q = -k(dT/dx), not T.',
      'Compare transport properties: k_metal >> k_wood.',
      'Synthesize: higher heat loss rate elicits stronger cold receptor firing.',
    ],
  },

  crucible_conjunction_fallacy: {
    id: 'crucible_conjunction_fallacy',
    domain: 'cognitive_heuristics',
    title: 'The Linda Problem & Conjunction Fallacy',
    stem: 'Linda is 31 years old, single, outspoken, and very bright. She majored in philosophy. As a student, she was deeply concerned with issues of discrimination and social justice, and participated in anti-nuclear demonstrations. Which statement is mathematically more probable?',
    options: [
      {
        id: 'opt_linda_both',
        text: 'Linda is a bank teller and is active in the feminist movement.',
        isCorrect: false,
        illusionType: 'conjunction_fallacy',
        misconceptionRationale:
          'Violates the fundamental probability axiom P(A ∩ B) ≤ P(A). A joint conjunction cannot exceed the probability of its constituent set.',
      },
      {
        id: 'opt_linda_teller',
        text: 'Linda is a bank teller.',
        isCorrect: true,
        misconceptionRationale: '',
      },
      {
        id: 'opt_linda_equal',
        text: 'Both statements are equally probable because the feminist description is already known to be true.',
        isCorrect: false,
        illusionType: 'conjunction_fallacy',
        misconceptionRationale:
          'The premise described Linda’s college background, not her current adult occupation or political activism.',
      },
    ],
    canonicalScientificExplanation:
      'The set of all bank tellers completely subsumes the subset of bank tellers who are also active in the feminist movement. Under Kolmogorov probability axioms, P(A ∩ B) ≤ P(A). Adding extra conditions strictly cannot increase probability.',
    epistemicPredictionErrorExplanation:
      'The representativeness heuristic (Tversky & Kahneman 1983) leads intuitive thinking to substitute subjective narrative plausibility/stereotypicality for set-theoretic mathematical probability.',
    counterEvidence:
      'If there are 1,000,000 bank tellers in the world and only 10,000 of them are active in the feminist movement, picking a random person satisfying "teller" is 100x more likely than "teller AND feminist".',
    subGoalChunking: [
      'Define set A: Bank Tellers.',
      'Define set B: Active in the feminist movement.',
      'Define conjunction: A ∩ B.',
      'Apply Venn inclusion: (A ∩ B) ⊆ A, therefore |A ∩ B| ≤ |A| and P(A ∩ B) ≤ P(A).',
    ],
  },

  crucible_monty_hall: {
    id: 'crucible_monty_hall',
    domain: 'probability_fallacies',
    title: 'The Monty Hall 3-Door Dilemma & Prior Information',
    stem: 'You are on a game show given the choice of 3 closed doors: Behind one door is a luxury car; behind the others, goats. You pick Door #1. The host (who knows what is behind all doors) opens Door #3, revealing a goat. He then asks: "Do you want to switch to Door #2?" What is the optimal mathematical strategy?',
    options: [
      {
        id: 'opt_monty_equal',
        text: 'It makes no difference; with 2 doors remaining, the car is behind either door with 50/50 probability.',
        isCorrect: false,
        illusionType: 'gambler_fallacy',
        misconceptionRationale:
          'Fallacy of uniform distribution. The host’s action is constrained by knowledge and is not an independent random coin flip.',
      },
      {
        id: 'opt_monty_switch',
        text: 'Always switch to Door #2; switching yields a 2/3 (66.7%) probability of winning the car, while staying gives only 1/3 (33.3%).',
        isCorrect: true,
        misconceptionRationale: '',
      },
      {
        id: 'opt_monty_stay',
        text: 'Always stay with Door #1; initial intuition has an established psychological advantage in Bayes theorem.',
        isCorrect: false,
        illusionType: 'fluency_illusion',
        misconceptionRationale:
          'Psychological attachment or endowment effect does not alter probability. Staying keeps you at P = 1/3.',
      },
    ],
    canonicalScientificExplanation:
      'When you initially chose Door #1, P(Car = Door 1) = 1/3, and P(Car in Door 2 or 3) = 2/3. The host is strictly constrained: he must always reveal a goat and cannot open Door #1. His informed reveal transfers the entire 2/3 collective probability mass onto the remaining unchosen Door #2.',
    epistemicPredictionErrorExplanation:
      'Intuition evaluates the 2 closed doors as a fresh, symmetrical 50/50 scenario, completely discarding the prior information constraint governing the host’s selective action.',
    counterEvidence:
      'Consider 100 doors: you pick Door #1 (1/100). Host opens 98 doors with goats, leaving Door #77. The probability car is behind Door #77 is 99/100!',
    subGoalChunking: [
      'Initial prior: P(Door 1) = 1/3, P(Doors 2 or 3) = 2/3.',
      'Host constraint analysis: Host cannot pick your door and cannot reveal the car.',
      'Probability transfer: P(Door 3 | Host reveals goat) = 0.',
      'Bayes update: All 2/3 probability mass of {Door 2, Door 3} collapses onto Door 2.',
    ],
  },

  crucible_concurrency_visibility: {
    id: 'crucible_concurrency_visibility',
    domain: 'systems_concurrency',
    title: 'Memory Visibility & Volatile Counter Increments',
    stem: 'In Java/C++, a shared counter is declared as `volatile int counter = 0;`. Ten concurrent worker threads each execute `counter++` exactly 1,000 times without explicit mutex locks. Is the final value guaranteed to be 10,000?',
    options: [
      {
        id: 'opt_vol_guarantee',
        text: 'Yes, because volatile variables are written directly to main memory and bypass all CPU L1/L2 caches, guaranteeing atomicity.',
        isCorrect: false,
        illusionType: 'memory_concurrency_illusion',
        misconceptionRationale:
          'Volatile guarantees memory visibility (happens-before) and ordering, NOT compound atomicity. counter++ is three separate instructions: Read, Modify, Write.',
      },
      {
        id: 'opt_vol_race',
        text: 'No, because counter++ is a non-atomic read-modify-write composite operation (load, increment, store). Threads will interleave loads, resulting in lost updates and final counter < 10,000.',
        isCorrect: true,
        misconceptionRationale: '',
      },
      {
        id: 'opt_vol_deadlock',
        text: 'No, because volatile variables acquire exclusive bus locks that will trigger a hardware deadlock with ten threads.',
        isCorrect: false,
        illusionType: 'lexical_familiarity',
        misconceptionRationale:
          'Volatile does not acquire bus locks or cause deadlocks; it generates memory barrier instructions (MFENCE/DMB).',
      },
    ],
    canonicalScientificExplanation:
      'Volatile establishes a happens-before relationship ensuring memory visibility across CPU cores (preventing stale register/cache reads). However, `counter++` compiles into three discrete machine operations: 1. LOAD value into register, 2. ADD 1, 3. STORE back to memory. Two threads reading simultaneously will both increment the same baseline value, overwriting each other.',
    epistemicPredictionErrorExplanation:
      'Developers confuse "memory visibility" with "thread safety / atomicity". Seeing a concurrency keyword like `volatile` gives a false sense of comprehensive synchronization.',
    counterEvidence:
      'Running this snippet in Java or C++ almost always yields values like 8,421 or 9,134 rather than 10,000. Replacing with `AtomicInteger.incrementAndGet()` guarantees 10,000 using CPU Compare-And-Swap (CAS).',
    subGoalChunking: [
      'Deconstruct counter++ into assembly primitives: LOAD, ADD, STORE.',
      'Analyze volatile semantic scope: memory ordering & flush, not mutual exclusion.',
      'Simulate interleaving: Thread A loads 5, Thread B loads 5, both store 6 (one update lost).',
      'Prescribe correct primitive: Atomic CAS (AtomicInteger) or mutex lock.',
    ],
  },
}

// ---------------------------------------------------------------------------
// 6. Interactive Hypercorrection Session State Machine
// ---------------------------------------------------------------------------

export interface HypercorrectionSessionState {
  currentProblemIndex: number
  problemIds: string[]
  activeItemId: string
  prospectiveJOL: number | null
  selectedOptionId: string | null
  retrospectiveConfidence: number | null
  phase: 'prospective_jol' | 'option_selection' | 'confidence_rating' | 'feedback_deconstruction'
  trials: TrialMetacognitiveRecord[]
  profile: MetacognitiveCalibrationProfile
  hypercorrectedCardIds: string[]
}

export class HypercorrectionSession {
  private state: HypercorrectionSessionState
  private problemBank: Record<string, EpistemicCrucibleItem>

  constructor(customProblems?: Record<string, EpistemicCrucibleItem>) {
    this.problemBank = customProblems ?? EPISTEMIC_CRUCIBLE_PROBLEMS
    const problemIds = Object.keys(this.problemBank)

    this.state = {
      currentProblemIndex: 0,
      problemIds,
      activeItemId: problemIds[0] ?? '',
      prospectiveJOL: null,
      selectedOptionId: null,
      retrospectiveConfidence: null,
      phase: 'prospective_jol',
      trials: [],
      profile: evaluateMetacognitiveCalibrationProfile([]),
      hypercorrectedCardIds: [],
    }
  }

  public getState(): Readonly<HypercorrectionSessionState> {
    return { ...this.state }
  }

  public getCurrentProblem(): EpistemicCrucibleItem | null {
    return this.problemBank[this.state.activeItemId] ?? null
  }

  public submitProspectiveJOL(jol: number): void {
    if (this.state.phase !== 'prospective_jol') {
      throw new Error('Cannot submit prospective JOL outside prospective_jol phase.')
    }
    this.state.prospectiveJOL = Math.max(0, Math.min(1, jol))
    this.state.phase = 'option_selection'
  }

  public selectOption(optionId: string): void {
    if (this.state.phase !== 'option_selection') {
      throw new Error('Cannot select option outside option_selection phase.')
    }
    this.state.selectedOptionId = optionId
    this.state.phase = 'confidence_rating'
  }

  public submitRetrospectiveConfidence(
    confidence: number,
    responseLatencyMs = 2500,
  ): {
    record: TrialMetacognitiveRecord
    isHypercorrection: boolean
    epistemicSurpriseScore: number
    explanation: string
  } {
    if (this.state.phase !== 'confidence_rating') {
      throw new Error('Cannot submit confidence outside confidence_rating phase.')
    }

    const problem = this.getCurrentProblem()
    if (!problem) throw new Error('Active problem not found.')

    const selectedOption = problem.options.find((o) => o.id === this.state.selectedOptionId)
    if (!selectedOption) throw new Error('Selected option not found.')

    const conf = Math.max(0, Math.min(1, confidence))
    const isCorrect = selectedOption.isCorrect
    const isHypercorrection = !isCorrect && conf >= 0.7
    const surpriseScore = Number((conf * (isCorrect ? 0 : 1)).toFixed(3))

    const record: TrialMetacognitiveRecord = {
      itemId: problem.id,
      selectedOptionId: selectedOption.id,
      isCorrect,
      prospectiveJOL: this.state.prospectiveJOL ?? 0.5,
      retrospectiveConfidence: conf,
      responseLatencyMs,
      epistemicSurpriseScore: surpriseScore,
      isHypercorrectionCandidate: isHypercorrection,
      detectedIllusion: !isCorrect ? selectedOption.illusionType : undefined,
    }

    this.state.trials.push(record)
    this.state.retrospectiveConfidence = conf
    this.state.phase = 'feedback_deconstruction'
    this.state.profile = evaluateMetacognitiveCalibrationProfile(this.state.trials)

    return {
      record,
      isHypercorrection,
      epistemicSurpriseScore: surpriseScore,
      explanation: isCorrect
        ? problem.canonicalScientificExplanation
        : `${problem.epistemicPredictionErrorExplanation} ${selectedOption.misconceptionRationale}`,
    }
  }

  public advanceToNextProblem(): boolean {
    const nextIndex = this.state.currentProblemIndex + 1
    if (nextIndex >= this.state.problemIds.length) {
      return false
    }

    this.state.currentProblemIndex = nextIndex
    this.state.activeItemId = this.state.problemIds[nextIndex]!
    this.state.prospectiveJOL = null
    this.state.selectedOptionId = null
    this.state.retrospectiveConfidence = null
    this.state.phase = 'prospective_jol'
    return true
  }
}

// ---------------------------------------------------------------------------
// 7. FSRS Spaced Repetition Hypercorrection Bridge
// ---------------------------------------------------------------------------

export interface FSRSHypercorrectionCard {
  id: string
  front: string
  back: string
  tags: string[]
  suggestedInitialStability: number // Boosted stability for hypercorrected items (Butterfield 2001)
  suggestedInitialDifficulty: number
  metadata: {
    itemId: string
    cognitiveIllusionType?: CognitiveIllusionType
    epistemicSurpriseScore: number
    isHypercorrected: boolean
  }
}

export function exportHypercorrectionToFSRSCards(
  trials: TrialMetacognitiveRecord[],
  problemBank: Record<string, EpistemicCrucibleItem> = EPISTEMIC_CRUCIBLE_PROBLEMS,
): FSRSHypercorrectionCard[] {
  const cards: FSRSHypercorrectionCard[] = []

  for (const trial of trials) {
    const item = problemBank[trial.itemId]
    if (!item) continue

    const selectedOption = item.options.find((o) => o.id === trial.selectedOptionId)
    const misconceptionText = selectedOption?.misconceptionRationale
      ? `\n\n**Debunked Intuitive Misconception:**\n${selectedOption.misconceptionRationale}`
      : ''

    if (trial.isHypercorrectionCandidate) {
      // High-Confidence Error card (Hypercorrection target)
      cards.push({
        id: `card_hc_${trial.itemId}_${Date.now()}`,
        front: `[Epistemic Crucible — Misconception Repair]\n\n${item.stem}\n\n*Target Cognitive Fallacy:* What root illusion causes intuition to fail here?`,
        back: `**Scientific Reality:**\n${item.canonicalScientificExplanation}${misconceptionText}\n\n**Counter-Evidence & Proof:**\n${item.counterEvidence}\n\n**Sub-Goal Derivation:**\n${item.subGoalChunking.map((step, idx) => `${idx + 1}. ${step}`).join('\n')}`,
        tags: [
          'metacognition',
          'hypercorrection',
          item.domain,
          ...(trial.detectedIllusion ? [trial.detectedIllusion] : []),
        ],
        suggestedInitialStability: 3.5, // High initial stability due to attention surge
        suggestedInitialDifficulty: 6.0,
        metadata: {
          itemId: trial.itemId,
          cognitiveIllusionType: trial.detectedIllusion,
          epistemicSurpriseScore: trial.epistemicSurpriseScore,
          isHypercorrected: true,
        },
      })
    } else if (!trial.isCorrect) {
      // Standard Error card
      cards.push({
        id: `card_err_${trial.itemId}_${Date.now()}`,
        front: `[Conceptual Question]\n\n${item.stem}`,
        back: `**Answer & Explanation:**\n${item.canonicalScientificExplanation}`,
        tags: ['metacognition', 'error-repair', item.domain],
        suggestedInitialStability: 1.0,
        suggestedInitialDifficulty: 7.0,
        metadata: {
          itemId: trial.itemId,
          epistemicSurpriseScore: trial.epistemicSurpriseScore,
          isHypercorrected: false,
        },
      })
    }
  }

  return cards
}
