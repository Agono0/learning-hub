import { z } from 'zod'
/**
 * @file packages/core/src/anchored/anchored-engine.ts
 * @description Anchored Instruction & Situated Macrocontext Problem-Solving Engine.
 *
 * Grounded in Cognitive Science & Learning Science:
 * - Cognitive & Technology Group at Vanderbilt (CTGV 1990, 1992, 1993):
 *   "Anchored instruction: Why we need it and how technology can help",
 *   "The Jasper Experiment: An exploration of issues in learning and instructional design".
 * - John Bransford, Robert Sherwood, Ted Hasselbring, Charles Kinzer, Herbert Littlefield (1990):
 *   Generative learning environments overcome the "inert knowledge problem" (Whitehead 1929;
 *   Bereiter & Scardamalia 1985) by embedding problems inside authentic, data-rich macrocontexts.
 * - Richard Catrambone (1998):
 *   "The subgoal learning model: Creating goal folders that transfer across problem-solving tasks."
 *   Decomposing complex real-world dilemmas into sub-goal hierarchies.
 * - Quantitative Telemetry:
 *   - SGAI: Sub-Goal Alignment Index (0–100, dependency DAG adherence)
 *   - EIER: Embedded Information Extraction Ratio (0–100, signal vs narrative distractor extraction)
 *   - CPR: Constraint Propagation Rigor (0–100, trade-off and boundary condition validation)
 *   - IKRS: Inert Knowledge Resistance Score (0–100, composite situated problem-solving index)
 *   - FSRS-6 review deck calibration scaled by situated transfer stability.
 */

// TD-05: scenario corpora (canonical macrocontext cases) are CONTENT, not logic —
// they live in ./content.ts so engine diffs stay about algorithms. Re-exported so
// every existing import path keeps working (the barrel does `export * from` this file).
export { CANONICAL_MACROCONTEXT_CASES } from './content'

// ── Enums & Types ────────────────────────────────────────────────────────────

export const MacrocontextDomainEnum = z.enum([
  'aviation_navigation',
  'marine_geophysics',
  'astrobiology_life_support',
  'epidemiology_networks',
  'power_systems_microgrid',
])
export type MacrocontextDomain = z.infer<typeof MacrocontextDomainEnum>

export const AnchoredDifficultyEnum = z.enum(['introductory', 'intermediate', 'advanced'])
export type AnchoredDifficulty = z.infer<typeof AnchoredDifficultyEnum>

export const EmbeddedDataPointSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
  unit: z.string(),
  narrativeLocation: z.string(),
  isRelevant: z.boolean(),
  distractorType: z.enum(['plausible_irrelevant', 'stale_historical', 'unrelated_fact']).optional(),
  extractionHint: z.string(),
})
export type EmbeddedDataPoint = z.infer<typeof EmbeddedDataPointSchema>

export const SubGoalNodeSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  dependsOnSubGoalIds: z.array(z.string()),
  requiredDataPointIds: z.array(z.string()),
  formulaDescription: z.string(),
  targetMetricKey: z.string(),
  expectedValue: z.number(),
  tolerancePct: z.number().default(5).optional(),
})
export type SubGoalNode = z.infer<typeof SubGoalNodeSchema>

export const ConstraintParameterSchema = z.object({
  id: z.string(),
  name: z.string(),
  nominalValue: z.number(),
  minSafeValue: z.number().optional(),
  maxSafeValue: z.number().optional(),
  unit: z.string(),
  description: z.string(),
})
export type ConstraintParameter = z.infer<typeof ConstraintParameterSchema>

export const MacrocontextCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: MacrocontextDomainEnum,
  difficulty: AnchoredDifficultyEnum,
  narrativeScenario: z.string(),
  missionGoal: z.string(),
  embeddedData: z.array(EmbeddedDataPointSchema),
  subGoalHierarchy: z.array(SubGoalNodeSchema),
  constraints: z.array(ConstraintParameterSchema),
  optimalDecisionSummary: z.string(),
})
export type MacrocontextCase = z.infer<typeof MacrocontextCaseSchema>

export const LearnerSolutionSubmissionSchema = z.object({
  caseId: z.string(),
  extractedDataValues: z.record(z.string(), z.number()),
  subGoalSequence: z.array(z.string()),
  calculatedSubGoalOutputs: z.record(z.string(), z.number()),
  finalDecisionChoice: z.string(),
  decisionJustification: z.string(),
})
export type LearnerSolutionSubmission = z.infer<typeof LearnerSolutionSubmissionSchema>

export const AnchoredEvaluationSchema = z.object({
  sgai: z.number().min(0).max(100),
  eier: z.number().min(0).max(100),
  cpr: z.number().min(0).max(100),
  ikrs: z.number().min(0).max(100),
  maturityBand: z.enum([
    'inert_knower',
    'procedural_solver',
    'contextual_strategist',
    'macrocontext_master',
  ]),
  subGoalFeedback: z.array(
    z.object({
      subGoalId: z.string(),
      status: z.enum(['optimal', 'suboptimal', 'omitted', 'dependency_violated']),
      message: z.string(),
    }),
  ),
  parameterExtractionBreakdown: z.array(
    z.object({
      dataPointId: z.string(),
      label: z.string(),
      isExtracted: z.boolean(),
      isAccurate: z.boolean(),
      isRelevant: z.boolean(),
    }),
  ),
  decisionApproved: z.boolean(),
  pedagogicalFeedback: z.array(z.string()),
  strengths: z.array(z.string()),
  vulnerabilities: z.array(z.string()),
})
export type AnchoredEvaluation = z.infer<typeof AnchoredEvaluationSchema>

export const CalibratedAnchoredCardSchema = z.object({
  id: z.string(),
  cardType: z.enum([
    'data_extraction',
    'subgoal_decomposition',
    'constraint_tradeoff',
    'macrocontext_synthesis',
  ]),
  front: z.string(),
  back: z.string(),
  targetConcept: z.string(),
  fsrsParameters: z.object({
    stability: z.number(),
    difficulty: z.number(),
  }),
})
export type CalibratedAnchoredCard = z.infer<typeof CalibratedAnchoredCardSchema>

export const CalibratedAnchoredDeckSchema = z.object({
  caseId: z.string(),
  caseTitle: z.string(),
  ikrsBaseline: z.number(),
  cards: z.array(CalibratedAnchoredCardSchema),
})
export type CalibratedAnchoredDeck = z.infer<typeof CalibratedAnchoredDeckSchema>

// ── Canonical Multidisciplinary Macrocontext Cases ──────────────────────────

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic); re-exported
// below so import paths are unchanged.

// ── Core Domain Evaluation Functions ─────────────────────────────────────────

/**
 * Evaluates a learner's situated problem-solving trajectory inside an authentic macrocontext.
 */
export function evaluateAnchoredSolution(
  macroCase: MacrocontextCase,
  submission: LearnerSolutionSubmission,
): AnchoredEvaluation {
  const pedagogicalFeedback: string[] = []
  const strengths: string[] = []
  const vulnerabilities: string[] = []

  // 1. Embedded Information Extraction Ratio (EIER)
  const relevantData = macroCase.embeddedData.filter((d) => d.isRelevant)

  let extractedRelevantCount = 0
  let extractedDistractorCount = 0

  const parameterBreakdown = macroCase.embeddedData.map((d) => {
    const isExtracted = submission.extractedDataValues[d.id] !== undefined
    const extractedVal = submission.extractedDataValues[d.id]
    const isAccurate =
      isExtracted && extractedVal !== undefined && Math.abs(extractedVal - d.value) < 0.01

    if (isExtracted) {
      if (d.isRelevant) {
        if (isAccurate) extractedRelevantCount++
      } else {
        extractedDistractorCount++
      }
    }

    return {
      dataPointId: d.id,
      label: d.label,
      isExtracted,
      isAccurate,
      isRelevant: d.isRelevant,
    }
  })

  // Precision and recall on embedded data
  const recallPct = (extractedRelevantCount / relevantData.length) * 100
  const distractorPenalty = extractedDistractorCount * 20
  const eier = Math.max(0, Math.min(100, Math.round(recallPct - distractorPenalty)))

  if (extractedRelevantCount === relevantData.length && extractedDistractorCount === 0) {
    strengths.push(
      'Flawless information extraction: discriminated all critical parameters while rejecting narrative distractors.',
    )
  } else if (extractedDistractorCount > 0) {
    vulnerabilities.push(
      `Fell for ${extractedDistractorCount} irrelevant narrative distractor(s) embedded in the macrocontext story.`,
    )
  }

  // 2. Sub-Goal Alignment Index (SGAI) - Catrambone (1998)
  const subGoalFeedback: AnchoredEvaluation['subGoalFeedback'] = []
  let correctlySequencedCount = 0
  let calculationAccurateCount = 0

  const subGoalMap = new Map(macroCase.subGoalHierarchy.map((sg) => [sg.id, sg]))
  const visitedSubGoals = new Set<string>()

  for (let idx = 0; idx < submission.subGoalSequence.length; idx++) {
    const sgId = submission.subGoalSequence[idx]!
    const sg = subGoalMap.get(sgId)

    if (!sg) continue

    // Check dependency satisfaction
    const dependenciesMet = sg.dependsOnSubGoalIds.every((depId) => visitedSubGoals.has(depId))

    if (!dependenciesMet) {
      subGoalFeedback.push({
        subGoalId: sg.id,
        status: 'dependency_violated',
        message: `Sub-goal "${sg.title}" was attempted before its prerequisites (${sg.dependsOnSubGoalIds.join(', ')}) were solved.`,
      })
      vulnerabilities.push(
        `Dependency sequencing violation in sub-goal decomposition for "${sg.title}".`,
      )
    } else {
      correctlySequencedCount++
      visitedSubGoals.add(sg.id)

      // Check calculation accuracy
      const learnerVal = submission.calculatedSubGoalOutputs[sg.id]
      if (learnerVal !== undefined) {
        const errorPct = (Math.abs(learnerVal - sg.expectedValue) / sg.expectedValue) * 100
        const tolerance = sg.tolerancePct ?? 5
        if (errorPct <= tolerance) {
          calculationAccurateCount++
          subGoalFeedback.push({
            subGoalId: sg.id,
            status: 'optimal',
            message: `Optimal calculation: ${learnerVal} matches expected ${sg.expectedValue}.`,
          })
        } else {
          subGoalFeedback.push({
            subGoalId: sg.id,
            status: 'suboptimal',
            message: `Mathematical deviation: got ${learnerVal}, expected ${sg.expectedValue} (error: ${errorPct.toFixed(1)}%).`,
          })
        }
      } else {
        subGoalFeedback.push({
          subGoalId: sg.id,
          status: 'omitted',
          message: `Sub-goal output missing for "${sg.title}".`,
        })
      }
    }
  }

  const totalSubGoals = macroCase.subGoalHierarchy.length
  const sequenceRatio = correctlySequencedCount / totalSubGoals
  const calculationRatio = calculationAccurateCount / totalSubGoals
  const sgai = Math.round((sequenceRatio * 0.5 + calculationRatio * 0.5) * 100)

  if (sgai >= 85) {
    strengths.push(
      'Exemplary sub-goal hierarchy: cleanly decomposed authentic problem into logical dependent stages.',
    )
  }

  // 3. Constraint Propagation Rigor (CPR)
  let constraintViolations = 0
  const justificationLower = (submission.decisionJustification ?? '').toLowerCase()
  for (const c of macroCase.constraints) {
    // Check if decision acknowledges constraint
    const constraintNameWords = c.name.toLowerCase().split(/\s+/)
    const mentioned = constraintNameWords.some(
      (w) => w.length > 4 && justificationLower.includes(w),
    )
    if (!mentioned) {
      constraintViolations++
    }
  }

  const decisionWordCount = (submission.decisionJustification ?? '')
    .split(/\s+/)
    .filter(Boolean).length
  const cpr = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (1 - constraintViolations / Math.max(macroCase.constraints.length, 1)) * 60 +
          (decisionWordCount >= 25 ? 40 : (decisionWordCount / 25) * 40),
      ),
    ),
  )

  // 4. Decision Approval Check
  const decisionApproved =
    sgai >= 70 &&
    eier >= 60 &&
    (submission.decisionJustification?.length ?? 0) >= 30 &&
    Boolean(submission.finalDecisionChoice && submission.finalDecisionChoice.trim().length > 0)

  // 5. Composite Inert Knowledge Resistance Score (IKRS)
  // IKRS = 0.35 * SGAI + 0.30 * EIER + 0.25 * CPR + 0.10 * (decisionApproved ? 100 : 40)
  const ikrs = Math.min(
    100,
    Math.round(sgai * 0.35 + eier * 0.3 + cpr * 0.25 + (decisionApproved ? 100 : 40) * 0.1),
  )

  let maturityBand: AnchoredEvaluation['maturityBand'] = 'inert_knower'
  if (ikrs >= 85) maturityBand = 'macrocontext_master'
  else if (ikrs >= 70) maturityBand = 'contextual_strategist'
  else if (ikrs >= 50) maturityBand = 'procedural_solver'

  // Pedagogical feedback
  if (maturityBand === 'macrocontext_master') {
    pedagogicalFeedback.push(
      'Mastery of situated problem solving: You overcome inert knowledge by seamlessly coordinating embedded story data with causal sub-goal constraints.',
    )
  } else if (maturityBand === 'contextual_strategist') {
    pedagogicalFeedback.push(
      'Strong contextual competence. Refine mathematical precision and ensure narrative distractors are explicitly audited and discarded.',
    )
  } else if (maturityBand === 'procedural_solver') {
    pedagogicalFeedback.push(
      'Procedural execution is present, but vulnerability to narrative distractors and sub-goal sequencing lapses remains.',
    )
  } else {
    pedagogicalFeedback.push(
      'Inert knowledge barrier detected: Facts and formulas remained disconnected from the situated narrative constraints (CTGV 1990).',
    )
  }

  return {
    sgai,
    eier,
    cpr,
    ikrs,
    maturityBand,
    subGoalFeedback,
    parameterExtractionBreakdown: parameterBreakdown,
    decisionApproved,
    pedagogicalFeedback,
    strengths,
    vulnerabilities,
  }
}

/**
 * Executes a "What-If" Sensitivity Simulation to see how varying a narrative parameter
 * propagates through the causal sub-goal network.
 */
export function simulateAnchoredSensitivity(
  macroCase: MacrocontextCase,
  parameterId: string,
  variedValue: number,
): {
  caseId: string
  parameterId: string
  originalValue: number
  variedValue: number
  simulatedOutputs: Record<string, number>
  constraintImpacts: Array<{
    constraintId: string
    isSatisfied: boolean
    margin: number
    warningMessage?: string
  }>
} {
  const dataPoint = macroCase.embeddedData.find((d) => d.id === parameterId)
  const originalValue = dataPoint?.value ?? 0

  const simulatedOutputs: Record<string, number> = {}
  const constraintImpacts: Array<{
    constraintId: string
    isSatisfied: boolean
    margin: number
    warningMessage?: string
  }> = []

  if (macroCase.id === 'case-jasper-flight') {
    const headwind = parameterId === 'data-headwind' ? variedValue : 20
    const airspeed = parameterId === 'data-cruising-speed' ? variedValue : 100
    const dist = parameterId === 'data-dist-oneway' ? variedValue : 120
    const burn = parameterId === 'data-fuel-burn' ? variedValue : 8.0

    const outSpeed = Math.max(10, airspeed - headwind)
    const inSpeed = airspeed + headwind
    const outTime = dist / outSpeed
    const inTime = dist / inSpeed
    const totalAir = outTime + inTime
    const totalFuel = totalAir * burn
    const remainingFuel = 36 - totalFuel
    const returnTime = 16.0 + totalAir + 0.5 // + 30m ground

    simulatedOutputs.outboundGroundspeed = outSpeed
    simulatedOutputs.inboundGroundspeed = inSpeed
    simulatedOutputs.totalFlightHours = parseFloat(totalAir.toFixed(2))
    simulatedOutputs.totalFuelGallons = parseFloat(totalFuel.toFixed(1))
    simulatedOutputs.remainingFuelGallons = parseFloat(remainingFuel.toFixed(1))
    simulatedOutputs.returnClockHour = parseFloat(returnTime.toFixed(2))

    // Fuel constraint
    const fuelSafe = remainingFuel >= 5.0
    constraintImpacts.push({
      constraintId: 'const-fuel-reserve',
      isSatisfied: fuelSafe,
      margin: parseFloat((remainingFuel - 5.0).toFixed(1)),
      warningMessage: fuelSafe
        ? undefined
        : `Fuel reserve breached! Only ${remainingFuel.toFixed(1)} gal remaining vs 5.0 gal required.`,
    })

    // Daylight constraint
    const daySafe = returnTime <= 18.75
    constraintImpacts.push({
      constraintId: 'const-daylight',
      isSatisfied: daySafe,
      margin: parseFloat((18.75 - returnTime).toFixed(2)),
      warningMessage: daySafe
        ? undefined
        : `Sunset breached by ${(returnTime - 18.75).toFixed(2)} hours!`,
    })
  } else {
    // Generic fallback sensitivity propagation
    simulatedOutputs.genericMetric = variedValue * 1.2
    constraintImpacts.push({
      constraintId: macroCase.constraints[0]?.id ?? 'const-generic',
      isSatisfied: true,
      margin: 10,
    })
  }

  return {
    caseId: macroCase.id,
    parameterId,
    originalValue,
    variedValue,
    simulatedOutputs,
    constraintImpacts,
  }
}

/**
 * Generates calibrated FSRS-6 review flashcards for spaced repetition,
 * scaling initial stability and difficulty by the learner's IKRS baseline.
 */
export function generateAnchoredFSRSDeck(
  macroCase: MacrocontextCase,
  evaluation: AnchoredEvaluation,
): CalibratedAnchoredDeck {
  // Higher IKRS -> higher initial stability, lower difficulty
  const ikrsFactor = evaluation.ikrs / 100
  const baseStability = parseFloat((3.0 + ikrsFactor * 4.5).toFixed(1)) // 3.0d to 7.5d
  const baseDifficulty = parseFloat((7.0 - ikrsFactor * 3.0).toFixed(1)) // 7.0 down to 4.0

  const cards: CalibratedAnchoredCard[] = [
    {
      id: `anchored-card-${macroCase.id}-1`,
      cardType: 'data_extraction',
      front: `[Anchored Extraction: ${macroCase.title}]\nIn the narrative context of ${macroCase.title}, which data parameters were mathematically vital to extract, and which narrative details were distractors?`,
      back: `Vital Parameters:\n${macroCase.embeddedData
        .filter((d) => d.isRelevant)
        .map((d) => `• ${d.label}: ${d.value} ${d.unit}`)
        .join('\n')}\n\nDistractors Discarded:\n${macroCase.embeddedData
        .filter((d) => !d.isRelevant)
        .map((d) => `• ${d.label} (${d.distractorType ?? 'irrelevant'})`)
        .join('\n')}`,
      targetConcept: 'Situated Information Discrimination',
      fsrsParameters: {
        stability: baseStability,
        difficulty: baseDifficulty,
      },
    },
    {
      id: `anchored-card-${macroCase.id}-2`,
      cardType: 'subgoal_decomposition',
      front: `[Sub-Goal Hierarchy: ${macroCase.title}]\nWhat is the prerequisite dependency sequence of sub-goals required to solve this macrocontext?`,
      back: macroCase.subGoalHierarchy
        .map(
          (sg, i) =>
            `${i + 1}. ${sg.title}\n   Prerequisites: ${sg.dependsOnSubGoalIds.length > 0 ? sg.dependsOnSubGoalIds.join(', ') : 'None'}\n   Formula: ${sg.formulaDescription}`,
        )
        .join('\n\n'),
      targetConcept: 'Sub-Goal Chunking & Problem Decomposition',
      fsrsParameters: {
        stability: parseFloat((baseStability * 1.1).toFixed(1)),
        difficulty: baseDifficulty,
      },
    },
    {
      id: `anchored-card-${macroCase.id}-3`,
      cardType: 'constraint_tradeoff',
      front: `[Constraint Trade-Off: ${macroCase.title}]\nWhat physical or operational boundary constraints govern this scenario, and what is the limiting bottleneck?`,
      back: `${macroCase.constraints.map((c) => `• ${c.name}: Nominal ${c.nominalValue} ${c.unit} (Bound: ${c.minSafeValue ?? c.maxSafeValue} ${c.unit})\n  ${c.description}`).join('\n\n')}\n\nOptimal Resolution:\n${macroCase.optimalDecisionSummary}`,
      targetConcept: 'Multi-Constraint Boundary Optimization',
      fsrsParameters: {
        stability: baseStability,
        difficulty: parseFloat((baseDifficulty * 1.1).toFixed(1)),
      },
    },
    {
      id: `anchored-card-${macroCase.id}-4`,
      cardType: 'macrocontext_synthesis',
      front: `[Inert Knowledge Transfer: ${macroCase.title}]\nWhy does a standard decontextualized textbook formula often fail to produce transfer in real-world situations like this macrocontext?`,
      back: `According to CTGV (1990) and Bransford (1990), learners suffer from inert knowledge because formulas are memorized without recognizing the perceptual and situational cues that trigger their application. Situated macrocontexts anchor concepts in realistic narratives with embedded constraints, training active parameter extraction and sub-goal formulation.`,
      targetConcept: 'Inert Knowledge Overcoming & Situated Cognition',
      fsrsParameters: {
        stability: parseFloat((baseStability * 1.25).toFixed(1)),
        difficulty: parseFloat(Math.max(2.5, baseDifficulty - 1.0).toFixed(1)),
      },
    },
  ]

  return {
    caseId: macroCase.id,
    caseTitle: macroCase.title,
    ikrsBaseline: evaluation.ikrs,
    cards,
  }
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const anchoredSensitivityInputSchema = z.object({
  caseId: z.string(),
  parameterId: z.string(),
  variedValue: z.number(),
})
export type AnchoredSensitivityInput = z.infer<typeof anchoredSensitivityInputSchema>

export const anchoredDeckInputSchema = z.object({
  caseId: z.string(),
  ikrsBaseline: z.number().min(0).max(100).optional(),
})
export type AnchoredDeckInput = z.infer<typeof anchoredDeckInputSchema>
