import { z } from 'zod'
/**
 * @file packages/core/src/contrasting/contrasting-engine.ts
 * @description Contrasting Cases & Inventing with Examples Problem-Solving Engine.
 *
 * Grounded in Cognitive Science & Learning Sciences:
 * - Daniel L. Schwartz & John D. Bransford (1998):
 *   "A time for telling", Cognition and Instruction, 16(4), 475–522.
 * - Daniel L. Schwartz & Taylor Martin (2004):
 *   "Inventing to prepare for future learning: The case of contrasting cases",
 *   Cognition and Instruction, 22(2), 129–184.
 * - Daniel L. Schwartz, Catherine C. Chase, Marily A. Oppezzo, & Doris B. Chin (2016):
 *   "The ABCs of How We Learn: 26 Scientifically Proven Approaches", W. W. Norton & Company.
 * - Preparation for Future Learning (PFL; Bransford & Schwartz 1999):
 *   Analyzing structured contrasting cases activates perceptual differentiation,
 *   compelling learners to discern deep structural invariants from superficial noise,
 *   so subsequent canonical instruction ("A Time for Telling") is absorbed with far transfer.
 * - Quantitative Telemetry:
 *   - FDRS: Feature Discrimination Rigor Score (0–100, deep vs surface discrimination)
 *   - IMI: Invented Metric Invariance (0–100, ranking consistency across contrasting variants)
 *   - PFRI: Preparation for Future Readiness Index (0–100, productive impasse & curiosity tension)
 *   - CDTS: Contrasting Differentiation & Transfer Score (0–100 composite index)
 *   - FSRS-6 review deck generation calibrated by differentiated perceptual stability.
 */

// TD-05: scenario corpora (canonical contrasting case sets) are CONTENT, not
// logic — they live in ./content.ts so engine diffs stay about algorithms.
// Re-exported so every existing import path keeps working (the barrel does
// `export * from` this file).
export { CANONICAL_CONTRASTING_SETS } from './content'

// ── Enums & Schemas ──────────────────────────────────────────────────────────

export const ContrastingDomainEnum = z.enum([
  'physics_fluid_mechanics',
  'statistics_variability',
  'machine_learning_evaluation',
  'thermodynamics_materials',
  'computer_systems_architecture',
])
export type ContrastingDomain = z.infer<typeof ContrastingDomainEnum>

export const ContrastingDifficultyEnum = z.enum(['introductory', 'intermediate', 'advanced'])
export type ContrastingDifficulty = z.infer<typeof ContrastingDifficultyEnum>

export const ContrastingCaseVariantSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string(),
  surfaceFeatures: z.array(z.string()),
  deepFeatures: z.array(z.string()),
  numericalParameters: z.record(z.string(), z.number()),
  outcomeValue: z.number(),
  outcomeUnit: z.string(),
  visualHint: z.string(),
})
export type ContrastingCaseVariant = z.infer<typeof ContrastingCaseVariantSchema>

export const ContrastingDimensionSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  isDeepDimension: z.boolean(),
  distractorRationale: z.string().optional(),
  explanation: z.string(),
})
export type ContrastingDimension = z.infer<typeof ContrastingDimensionSchema>

export const CanonicalTellingSchema = z.object({
  lectureTitle: z.string(),
  historicalContext: z.string(),
  formalLawName: z.string(),
  formalEquation: z.string(),
  explanation: z.string(),
  whyIntuitiveMetricsFail: z.string(),
  howItCoordinatesCases: z.string(),
})
export type CanonicalTelling = z.infer<typeof CanonicalTellingSchema>

export const TransferChallengeSchema = z.object({
  id: z.string(),
  scenarioTitle: z.string(),
  description: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  correctOptionIndex: z.number().int().min(0).max(3),
  targetConcept: z.string(),
  explanation: z.string(),
})
export type TransferChallenge = z.infer<typeof TransferChallengeSchema>

export const ContrastingCaseSetSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: ContrastingDomainEnum,
  difficulty: ContrastingDifficultyEnum,
  problemOverview: z.string(),
  guidingInventionPrompt: z.string(),
  variants: z.array(ContrastingCaseVariantSchema),
  dimensions: z.array(ContrastingDimensionSchema),
  canonicalTelling: CanonicalTellingSchema,
  transferChallenge: TransferChallengeSchema,
})
export type ContrastingCaseSet = z.infer<typeof ContrastingCaseSetSchema>

export const InventedMetricSubmissionSchema = z.object({
  setId: z.string(),
  inventedMetricName: z.string(),
  formulaDescription: z.string(),
  selectedDimensionIds: z.array(z.string()),
  variantRankings: z.array(z.string()),
  impasseEncountered: z.boolean().default(true),
  reflectionNotes: z.string(),
})
export type InventedMetricSubmission = z.infer<typeof InventedMetricSubmissionSchema>

export const ContrastingEvaluationSchema = z.object({
  fdrs: z.number().min(0).max(100),
  imi: z.number().min(0).max(100),
  pfri: z.number().min(0).max(100),
  cdts: z.number().min(0).max(100),
  maturityBand: z.enum([
    'superficial_observer',
    'proto_inventor',
    'differentiating_theorist',
    'canonical_synthesizer',
  ]),
  identifiedDeepDimensions: z.array(z.string()),
  missedDeepDimensions: z.array(z.string()),
  superficialDistractorsChosen: z.array(z.string()),
  rankingAccuracy: z.number().min(0).max(100),
  impasseProductive: z.boolean(),
  pedagogicalFeedback: z.array(z.string()),
  strengths: z.array(z.string()),
  vulnerabilities: z.array(z.string()),
})
export type ContrastingEvaluation = z.infer<typeof ContrastingEvaluationSchema>

export const CalibratedContrastingCardSchema = z.object({
  id: z.string(),
  cardType: z.enum([
    'perceptual_differentiation',
    'invariant_ratio',
    'canonical_telling',
    'transfer_application',
  ]),
  front: z.string(),
  back: z.string(),
  targetConcept: z.string(),
  fsrsParameters: z.object({
    stability: z.number(),
    difficulty: z.number(),
  }),
})
export type CalibratedContrastingCard = z.infer<typeof CalibratedContrastingCardSchema>

export const CalibratedContrastingDeckSchema = z.object({
  setId: z.string(),
  setTitle: z.string(),
  cdtsBaseline: z.number(),
  cards: z.array(CalibratedContrastingCardSchema),
})
export type CalibratedContrastingDeck = z.infer<typeof CalibratedContrastingDeckSchema>

// ── Canonical Contrasting Case Sets ──────────────────────────────────────────

// Corpus (CANONICAL_CONTRASTING_SETS) moved verbatim to ./content.ts (TD-05 —
// content, not logic); re-exported at the top of this file so import paths are
// unchanged.

// ── Core Domain Evaluation Functions ─────────────────────────────────────────

/**
 * Evaluates a learner's contrasting cases invention attempt prior to or after lecture reveal.
 */
export function evaluateContrastingAttempt(
  caseSet: ContrastingCaseSet,
  submission: InventedMetricSubmission,
): ContrastingEvaluation {
  const pedagogicalFeedback: string[] = []
  const strengths: string[] = []
  const vulnerabilities: string[] = []

  // 1. Feature Discrimination Rigor Score (FDRS)
  const deepDimensions = caseSet.dimensions.filter((d) => d.isDeepDimension)
  const distractorDimensions = caseSet.dimensions.filter((d) => !d.isDeepDimension)

  const identifiedDeepDimensions = submission.selectedDimensionIds.filter((id) =>
    deepDimensions.some((d) => d.id === id),
  )
  const missedDeepDimensions = deepDimensions
    .filter((d) => !submission.selectedDimensionIds.includes(d.id))
    .map((d) => d.name)
  const superficialDistractorsChosen = submission.selectedDimensionIds
    .filter((id) => distractorDimensions.some((d) => d.id === id))
    .map((id) => caseSet.dimensions.find((d) => d.id === id)?.name ?? id)

  const deepRecall = (identifiedDeepDimensions.length / Math.max(deepDimensions.length, 1)) * 100
  const distractorPenalty = superficialDistractorsChosen.length * 25
  const fdrs = Math.max(0, Math.min(100, Math.round(deepRecall - distractorPenalty)))

  if (identifiedDeepDimensions.length === deepDimensions.length && distractorPenalty === 0) {
    strengths.push(
      'Superb perceptual discrimination: perfectly differentiated deep structural invariants from superficial distractors (Schwartz & Bransford 1998).',
    )
  } else if (superficialDistractorsChosen.length > 0) {
    vulnerabilities.push(
      `Fell for superficial feature distractors: ${superficialDistractorsChosen.join(', ')}.`,
    )
  }

  // 2. Invented Metric Invariance (IMI) & Ranking Accuracy
  // Canonical sorting order: sorted by outcomeValue ascending
  const sortedVariants = [...caseSet.variants].sort((a, b) => a.outcomeValue - b.outcomeValue)
  const canonicalRankingOrder = sortedVariants.map((v) => v.id)

  let rankingMatches = 0
  for (let i = 0; i < submission.variantRankings.length; i++) {
    if (submission.variantRankings[i] === canonicalRankingOrder[i]) {
      rankingMatches++
    }
  }

  const rankingAccuracy = Math.round((rankingMatches / Math.max(caseSet.variants.length, 1)) * 100)

  const formulaWords = submission.formulaDescription.trim().split(/\s+/).filter(Boolean).length
  const formulaRigorBonus = formulaWords >= 15 ? 30 : (formulaWords / 15) * 30
  const imi = Math.max(
    0,
    Math.min(100, Math.round((rankingAccuracy / 100) * 70 + formulaRigorBonus)),
  )

  if (rankingAccuracy >= 80) {
    strengths.push(
      'Robust metric invariance: invented rule successfully orders contrasting variants along true physical/statistical gradients.',
    )
  } else {
    vulnerabilities.push(
      'Metric instability: invented rule misranks contrasting variants when tested against boundary conditions.',
    )
  }

  // 3. Preparation for Future Readiness Index (PFRI)
  const reflectionLength = submission.reflectionNotes.trim().length
  const impasseProductive = submission.impasseEncountered && reflectionLength >= 30

  let pfri = 50
  if (impasseProductive) pfri += 35
  if (fdrs >= 60) pfri += 15
  pfri = Math.min(100, pfri)

  if (impasseProductive) {
    strengths.push(
      'Productive impasse achieved: actively formulated cognitive tension, priming mental schema for canonical lecture delivery.',
    )
  }

  // 4. Contrasting Differentiation & Transfer Score (CDTS)
  // CDTS = 0.35 * FDRS + 0.35 * IMI + 0.30 * PFRI
  const cdts = Math.min(100, Math.round(fdrs * 0.35 + imi * 0.35 + pfri * 0.3))

  let maturityBand: ContrastingEvaluation['maturityBand'] = 'superficial_observer'
  if (cdts >= 85) maturityBand = 'canonical_synthesizer'
  else if (cdts >= 70) maturityBand = 'differentiating_theorist'
  else if (cdts >= 50) maturityBand = 'proto_inventor'

  // Pedagogical Feedback Synthesis
  if (maturityBand === 'canonical_synthesizer') {
    pedagogicalFeedback.push(
      'Exceptional Preparation for Future Learning: Your invented metric captures the underlying invariance across cases, allowing seamless synthesis with formal theory (Schwartz & Martin 2004).',
    )
  } else if (maturityBand === 'differentiating_theorist') {
    pedagogicalFeedback.push(
      'Strong structural differentiation. You discerned the critical parameters; now inspect how the formal equation coordinates these ratios into a universal constant.',
    )
  } else if (maturityBand === 'proto_inventor') {
    pedagogicalFeedback.push(
      'Promising intuitive model. You noticed differences across cases, but superficial features (e.g., raw scale, shape) partially confounded your rule.',
    )
  } else {
    pedagogicalFeedback.push(
      'Surface feature fixation: Your model evaluated cases by absolute magnitudes rather than intensive ratios. Compare the extreme outlier cases to see why raw numbers fail.',
    )
  }

  return {
    fdrs,
    imi,
    pfri,
    cdts,
    maturityBand,
    identifiedDeepDimensions,
    missedDeepDimensions,
    superficialDistractorsChosen,
    rankingAccuracy,
    impasseProductive,
    pedagogicalFeedback,
    strengths,
    vulnerabilities,
  }
}

/**
 * Generates calibrated FSRS-6 review cards based on contrasting cases differentiation telemetry.
 */
export function generateContrastingFSRSDeck(
  caseSet: ContrastingCaseSet,
  evaluation: ContrastingEvaluation,
): CalibratedContrastingDeck {
  const cdtsFactor = evaluation.cdts / 100
  const baseStability = parseFloat((3.5 + cdtsFactor * 4.0).toFixed(1)) // 3.5d to 7.5d
  const baseDifficulty = parseFloat((6.5 - cdtsFactor * 2.5).toFixed(1)) // 6.5 down to 4.0

  const cards: CalibratedContrastingCard[] = [
    {
      id: `contrasting-card-${caseSet.id}-1`,
      cardType: 'perceptual_differentiation',
      front: `[Contrasting Cases: ${caseSet.title}]\nWhen comparing the contrasting cases in ${caseSet.title}, what deep structural invariant separates the variants, and what surface feature is a distractor?`,
      back: `Deep Structural Invariant:\n${caseSet.dimensions
        .filter((d) => d.isDeepDimension)
        .map((d) => `• ${d.name}: ${d.description}`)
        .join('\n')}\n\nSuperficial Distractors to Discard:\n${caseSet.dimensions
        .filter((d) => !d.isDeepDimension)
        .map((d) => `• ${d.name}: ${d.explanation}`)
        .join('\n')}`,
      targetConcept: 'Perceptual Feature Differentiation (Schwartz & Bransford 1998)',
      fsrsParameters: {
        stability: baseStability,
        difficulty: baseDifficulty,
      },
    },
    {
      id: `contrasting-card-${caseSet.id}-2`,
      cardType: 'invariant_ratio',
      front: `[Invented Invariance: ${caseSet.title}]\nWhat invariant mathematical ratio or relation coordinates all contrasting cases without dimensional error?`,
      back: `Governing Relation:\n${caseSet.canonicalTelling.formalEquation}\n\nExplanation:\n${caseSet.canonicalTelling.howItCoordinatesCases}`,
      targetConcept: 'Dimensional Invariance & Mathematical Coordination',
      fsrsParameters: {
        stability: parseFloat((baseStability * 1.15).toFixed(1)),
        difficulty: baseDifficulty,
      },
    },
    {
      id: `contrasting-card-${caseSet.id}-3`,
      cardType: 'canonical_telling',
      front: `[A Time for Telling: ${caseSet.title}]\nWhy do naive intuitive rules (like additive differences or raw counts) fail on extreme contrasting cases in ${caseSet.title}?`,
      back: `${caseSet.canonicalTelling.whyIntuitiveMetricsFail}\n\nCanonical Solution:\n${caseSet.canonicalTelling.explanation}`,
      targetConcept: 'Preparation for Future Learning & Canonical Theory Synthesis',
      fsrsParameters: {
        stability: baseStability,
        difficulty: parseFloat(Math.max(2.5, baseDifficulty - 0.5).toFixed(1)),
      },
    },
    {
      id: `contrasting-card-${caseSet.id}-4`,
      cardType: 'transfer_application',
      front: `[Far Transfer Challenge: ${caseSet.transferChallenge.scenarioTitle}]\n${caseSet.transferChallenge.question}`,
      back: `Correct Principle:\n${caseSet.transferChallenge.options[caseSet.transferChallenge.correctOptionIndex]}\n\nDeep Explanation:\n${caseSet.transferChallenge.explanation}`,
      targetConcept: caseSet.transferChallenge.targetConcept,
      fsrsParameters: {
        stability: parseFloat((baseStability * 1.3).toFixed(1)),
        difficulty: parseFloat(Math.max(2.0, baseDifficulty - 1.0).toFixed(1)),
      },
    },
  ]

  return {
    setId: caseSet.id,
    setTitle: caseSet.title,
    cdtsBaseline: evaluation.cdts,
    cards,
  }
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const contrastingDeckInputSchema = z.object({
  setId: z.string(),
  cdtsBaseline: z.number().min(0).max(100).optional(),
})
export type ContrastingDeckInput = z.infer<typeof contrastingDeckInputSchema>
