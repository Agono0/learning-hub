/**
 * Self-Regulated Learning (SRL) & Zimmerman Metacognitive Matrix Engine
 *
 * Grounded in empirical educational psychology:
 * - Barry J. Zimmerman (2000): "Attaining Self-Regulation: A Social Cognitive Perspective"
 *   Handbook of Self-Regulation, Academic Press.
 * - Barry J. Zimmerman (2002): "Becoming a Self-Regulated Learner: An Overview"
 *   Theory Into Practice, 41(2), 64-70.
 * - Paul R. Pintrich, David A. F. Smith, Teresa Garcia, & Wilbert J. McKeachie (1991, 1993):
 *   "Reliability and Predictive Validity of the Motivated Strategies for Learning Questionnaire (MSLQ)"
 *   Educational and Psychological Measurement, 53(3), 801-813.
 * - Bernard Weiner (1985): "An Attributional Theory of Achievement Motivation and Emotion"
 *   Psychological Review, 92(4), 548-573.
 * - Philip H. Winne & Allyson F. Hadwin (1998): "Studying as self-regulated learning"
 *   Metacognition in Educational Theory and Practice, 277-304.
 */

import { z } from 'zod'

// ============================================================================
// Phase 1: Forethought & Task Analysis Schemas
// ============================================================================

export const LearningGoalOrientationSchema = z.enum([
  'mastery_approach', // Focus on mastering task, developing competence (Elliot & McGregor 2001)
  'mastery_avoidance', // Focus on avoiding misunderstanding or incomplete mastery
  'performance_approach', // Focus on doing better than others, demonstrating superior ability
  'performance_avoidance', // Focus on avoiding looking incompetent or failing relative to others
])
export type LearningGoalOrientation = z.infer<typeof LearningGoalOrientationSchema>

export const CognitiveStrategyTypeSchema = z.enum([
  'retrieval_practice',
  'elaboration',
  'dual_coding',
  'interleaving',
  'concept_mapping',
  'feynman_technique',
  'summarization',
  'self_explanation',
])
export type CognitiveStrategyType = z.infer<typeof CognitiveStrategyTypeSchema>

export const StrategicPlanItemSchema = z.object({
  id: z.string(),
  strategy: CognitiveStrategyTypeSchema,
  rationale: z.string().min(1),
  plannedMinutes: z.number().int().positive(),
  completed: z.boolean().default(false),
})
export type StrategicPlanItem = z.infer<typeof StrategicPlanItemSchema>

export const ForethoughtPlanSchema = z.object({
  id: z.string(),
  targetSkillOrTopic: z.string().min(1),
  proximalSubgoals: z.array(z.string().min(1)).min(1),
  distalOutcome: z.string().min(1),
  strategicPlans: z.array(StrategicPlanItemSchema).min(1),
  selfEfficacyRating: z.number().min(0).max(100), // Bandura 1997 scale (0-100%)
  expectedDifficulty: z.number().int().min(1).max(5), // 1 (trivial) to 5 (extreme cognitive demand)
  intrinsicInterest: z.number().int().min(1).max(10), // 1 to 10
  goalOrientation: LearningGoalOrientationSchema.default('mastery_approach'),
  createdAt: z.string(), // ISO string
})
export type ForethoughtPlan = z.infer<typeof ForethoughtPlanSchema>

// ============================================================================
// Phase 2: Volitional Control & Performance Schemas
// ============================================================================

export const AttentionDistractionTriggerSchema = z.enum([
  'mind_wandering',
  'external_distraction',
  'cognitive_fatigue',
  'frustration',
  'impulsive_device_check',
])
export type AttentionDistractionTrigger = z.infer<typeof AttentionDistractionTriggerSchema>

export const AttentionInterventionSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  trigger: AttentionDistractionTriggerSchema,
  interventionStrategy: z.string().min(1),
  resolved: z.boolean(),
  latencySeconds: z.number().int().nonnegative().default(15),
})
export type AttentionIntervention = z.infer<typeof AttentionInterventionSchema>

export const VolitionalControlSessionSchema = z.object({
  id: z.string(),
  forethoughtPlanId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().optional(),
  durationMinutes: z.number().int().positive(),
  distractionTally: z.number().int().nonnegative().default(0),
  attentionInterventions: z.array(AttentionInterventionSchema).default([]),
  selfInstructionPromptsUsed: z.array(z.string()).default([]), // Meichenbaum 1977
  perceivedCognitiveLoad: z.number().int().min(1).max(10).default(5), // Paas 1992
  activeFocusMinutes: z.number().int().nonnegative(),
})
export type VolitionalControlSession = z.infer<typeof VolitionalControlSessionSchema>

// ============================================================================
// Phase 3: Self-Reflection & Causal Attribution Schemas
// ============================================================================

export const AttributionLocusSchema = z.enum(['internal', 'external'])
export type AttributionLocus = z.infer<typeof AttributionLocusSchema>

export const AttributionStabilitySchema = z.enum(['stable', 'unstable'])
export type AttributionStability = z.infer<typeof AttributionStabilitySchema>

export const AttributionControllabilitySchema = z.enum(['controllable', 'uncontrollable'])
export type AttributionControllability = z.infer<typeof AttributionControllabilitySchema>

export const WeinerAttributionCategorySchema = z.enum([
  'effort', // internal, unstable, controllable -> OPTIMAL ADAPTIVE
  'strategy', // internal, unstable, controllable -> OPTIMAL ADAPTIVE
  'ability', // internal, stable, uncontrollable -> MALADAPTIVE (helplessness trigger)
  'task_difficulty', // external, stable, uncontrollable
  'luck', // external, unstable, uncontrollable
  'environment', // external, unstable, controllable/uncontrollable
])
export type WeinerAttributionCategory = z.infer<typeof WeinerAttributionCategorySchema>

export const CausalAttributionSchema = z.object({
  id: z.string(),
  outcomeDescription: z.string().min(1),
  outcomeValence: z.enum(['success', 'partial_success', 'failure']),
  category: WeinerAttributionCategorySchema,
  locus: AttributionLocusSchema,
  stability: AttributionStabilitySchema,
  controllability: AttributionControllabilitySchema,
  justification: z.string().min(1),
})
export type CausalAttribution = z.infer<typeof CausalAttributionSchema>

export const SelfReflectionEvaluationSchema = z.object({
  id: z.string(),
  volitionalSessionId: z.string(),
  masteryStandardScore: z.number().min(0).max(100), // e.g. 85% target
  observedPerformanceScore: z.number().min(0).max(100), // e.g. 72% achieved
  performanceDiscrepancy: z.number(), // observed - standard (e.g. -13)
  attributions: z.array(CausalAttributionSchema).min(1),
  selfSatisfactionRating: z.number().int().min(1).max(10), // Bandura self-reaction
  adaptiveInferences: z.object({
    maintainStrategies: z.boolean(),
    strategyModifications: z.array(z.string()),
    proximalTargetForNextForethought: z.string().min(1),
  }),
  defensiveReactionDetected: z.boolean().default(false),
  createdAt: z.string(),
})
export type SelfReflectionEvaluation = z.infer<typeof SelfReflectionEvaluationSchema>

// ============================================================================
// Motivated Strategies for Learning Questionnaire (MSLQ) Schemas
// ============================================================================

export const MSLQScaleKeySchema = z.enum([
  // Motivation Scales (Pintrich et al. 1991)
  'intrinsic_goal_orientation',
  'extrinsic_goal_orientation',
  'task_value',
  'control_of_learning_beliefs',
  'self_efficacy_for_learning',
  'test_anxiety',
  // Cognitive & Metacognitive Learning Strategies
  'rehearsal',
  'elaboration',
  'organization',
  'critical_thinking',
  'metacognitive_self_regulation',
  // Resource Management Strategies
  'time_and_study_environment',
  'effort_regulation',
  'peer_learning',
  'help_seeking',
])
export type MSLQScaleKey = z.infer<typeof MSLQScaleKeySchema>

export const MSLQQuestionItemSchema = z.object({
  id: z.string(),
  scale: MSLQScaleKeySchema,
  prompt: z.string().min(1),
  reverseScored: z.boolean().default(false),
})
export type MSLQQuestionItem = z.infer<typeof MSLQQuestionItemSchema>

export const MSLQResponseMapSchema = z.record(z.string(), z.number().int().min(1).max(7))
export type MSLQResponseMap = z.infer<typeof MSLQResponseMapSchema>

export const MSLQSubscaleResultSchema = z.object({
  scaleKey: MSLQScaleKeySchema,
  label: z.string(),
  category: z.enum(['motivation', 'cognitive_metacognitive', 'resource_management']),
  rawMean: z.number().min(1).max(7),
  percentileNorm: z.number().min(0).max(100),
  benchmarkLevel: z.enum(['low', 'moderate', 'high', 'exemplary']),
  recommendation: z.string(),
})
export type MSLQSubscaleResult = z.infer<typeof MSLQSubscaleResultSchema>

export const MSLQProfileResultSchema = z.object({
  overallMetacognitiveIndex: z.number().min(0).max(100),
  motivationScore: z.number().min(1).max(7),
  cognitiveStrategyScore: z.number().min(1).max(7),
  resourceManagementScore: z.number().min(1).max(7),
  scales: z.record(MSLQScaleKeySchema, MSLQSubscaleResultSchema),
  topStrengths: z.array(z.string()),
  criticalBottlenecks: z.array(z.string()),
  prescribedInterventions: z.array(z.string()),
  assessedAt: z.string(),
})
export type MSLQProfileResult = z.infer<typeof MSLQProfileResultSchema>

// ============================================================================
// Standard MSLQ 15-Item Validated Diagnostic Bank
// ============================================================================

export const STANDARD_MSLQ_ITEMS: MSLQQuestionItem[] = [
  // Motivation
  {
    id: 'mslq_1',
    scale: 'intrinsic_goal_orientation',
    prompt:
      'In a study unit, I prefer course material that really challenges me so I can learn new things.',
    reverseScored: false,
  },
  {
    id: 'mslq_2',
    scale: 'extrinsic_goal_orientation',
    prompt: 'Getting a good grade or high score is the most satisfying thing for me right now.',
    reverseScored: false,
  },
  {
    id: 'mslq_3',
    scale: 'task_value',
    prompt:
      'I think I will be able to use what I learn in this topic in other areas of my life and work.',
    reverseScored: false,
  },
  {
    id: 'mslq_4',
    scale: 'control_of_learning_beliefs',
    prompt:
      'If I try hard enough and use effective strategies, I will understand the study materials.',
    reverseScored: false,
  },
  {
    id: 'mslq_5',
    scale: 'self_efficacy_for_learning',
    prompt: 'I am confident I can understand the most complex concepts presented in this domain.',
    reverseScored: false,
  },
  {
    id: 'mslq_6',
    scale: 'test_anxiety',
    prompt: 'When I take an exam or high-stakes quiz, I think of the consequences of failing.',
    reverseScored: false,
  },
  // Cognitive / Metacognitive
  {
    id: 'mslq_7',
    scale: 'rehearsal',
    prompt: 'When studying, I practice saying the terms over and over to memorize them.',
    reverseScored: false,
  },
  {
    id: 'mslq_8',
    scale: 'elaboration',
    prompt:
      'When reading, I try to relate the material to what I already know and generate concrete examples.',
    reverseScored: false,
  },
  {
    id: 'mslq_9',
    scale: 'organization',
    prompt: 'I make simple charts, diagrams, or concept maps to organize my study materials.',
    reverseScored: false,
  },
  {
    id: 'mslq_10',
    scale: 'critical_thinking',
    prompt: 'I treat study material as a starting point and try to develop my own ideas about it.',
    reverseScored: false,
  },
  {
    id: 'mslq_11',
    scale: 'metacognitive_self_regulation',
    prompt: 'Before I begin studying, I set goals and adjust my learning strategies as I progress.',
    reverseScored: false,
  },
  // Resource Management
  {
    id: 'mslq_12',
    scale: 'time_and_study_environment',
    prompt:
      'I make good use of my study time and find a quiet place where I can concentrate without distraction.',
    reverseScored: false,
  },
  {
    id: 'mslq_13',
    scale: 'effort_regulation',
    prompt:
      'Even when study materials are dull and uninteresting, I manage to keep working until I finish.',
    reverseScored: false,
  },
  {
    id: 'mslq_14',
    scale: 'peer_learning',
    prompt:
      'When studying, I often try to explain the material to a classmate or friend to verify my understanding.',
    reverseScored: false,
  },
  {
    id: 'mslq_15',
    scale: 'help_seeking',
    prompt:
      'When I am confused about something I am reading, I seek out help from an instructor, tutor, or authoritative resource.',
    reverseScored: false,
  },
]

// ============================================================================
// Cyclic Profile Schema
// ============================================================================

export const SRLCyclicProfileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  forethoughtPlans: z.array(ForethoughtPlanSchema).default([]),
  volitionalSessions: z.array(VolitionalControlSessionSchema).default([]),
  reflections: z.array(SelfReflectionEvaluationSchema).default([]),
  latestMSLQProfile: MSLQProfileResultSchema.optional(),
  lastUpdated: z.string(),
})
export type SRLCyclicProfile = z.infer<typeof SRLCyclicProfileSchema>

// ============================================================================
// Core Analysis & Diagnostic Functions
// ============================================================================

export interface ForethoughtEvaluationResult {
  planId: string
  goalSpecificityScore: number // 0-100%
  strategicVarietyScore: number // 0-100%
  calibrationRatio: number // Efficacy / (Difficulty * 20), 1.0 is calibrated
  calibrationDiagnosis: 'underconfident' | 'calibrated' | 'overconfident'
  masteryOrientationStrength: number // 0-100%
  forethoughtQualityScore: number // composite 0-100%
  recommendations: string[]
}

/**
 * Evaluates the psychological and metacognitive quality of a Forethought plan.
 * Grounded in Zimmerman (2000) task analysis and Bandura (1997) self-efficacy calibration.
 */
export function evaluateForethought(plan: ForethoughtPlan): ForethoughtEvaluationResult {
  // 1. Goal Specificity: Proximal subgoals + clear distal outcome
  const subgoalCount = plan.proximalSubgoals.length
  const goalSpecificityScore = Math.min(
    100,
    Math.round(subgoalCount * 25 + (plan.distalOutcome.length > 20 ? 25 : 10)),
  )

  // 2. Strategic Variety: Use of active generative learning strategies
  const uniqueStrategies = new Set(plan.strategicPlans.map((s) => s.strategy))
  const hasGenerative =
    uniqueStrategies.has('retrieval_practice') ||
    uniqueStrategies.has('elaboration') ||
    uniqueStrategies.has('dual_coding')
  const strategicVarietyScore = Math.min(100, uniqueStrategies.size * 25 + (hasGenerative ? 25 : 0))

  // 3. Efficacy-Difficulty Calibration
  // Difficulty is 1-5 (converted to 20-100 denominator)
  const difficultyDenominator = plan.expectedDifficulty * 20
  const rawRatio = plan.selfEfficacyRating / Math.max(1, difficultyDenominator)
  const calibrationRatio = Math.round(rawRatio * 100) / 100

  let calibrationDiagnosis: 'underconfident' | 'calibrated' | 'overconfident'
  if (calibrationRatio < 0.75) {
    calibrationDiagnosis = 'underconfident'
  } else if (calibrationRatio > 1.35) {
    calibrationDiagnosis = 'overconfident'
  } else {
    calibrationDiagnosis = 'calibrated'
  }

  // 4. Mastery Orientation
  let masteryOrientationStrength = 50
  if (plan.goalOrientation === 'mastery_approach') masteryOrientationStrength = 100
  else if (plan.goalOrientation === 'mastery_avoidance') masteryOrientationStrength = 75
  else if (plan.goalOrientation === 'performance_approach') masteryOrientationStrength = 60
  else if (plan.goalOrientation === 'performance_avoidance') masteryOrientationStrength = 30

  // Composite Quality
  const forethoughtQualityScore = Math.round(
    goalSpecificityScore * 0.3 +
      strategicVarietyScore * 0.3 +
      (calibrationDiagnosis === 'calibrated' ? 100 : 70) * 0.2 +
      masteryOrientationStrength * 0.2,
  )

  const recommendations: string[] = []
  if (subgoalCount < 2) {
    recommendations.push(
      'Decompose your target into at least 2-3 granular proximal subgoals (Zimmerman 2002).',
    )
  }
  if (!hasGenerative) {
    recommendations.push(
      'Integrate high-yield generative strategies like retrieval practice, dual coding, or elaboration.',
    )
  }
  if (calibrationDiagnosis === 'overconfident') {
    recommendations.push(
      'Self-efficacy appears high relative to task difficulty. Anticipate potential friction points with deliberate checks.',
    )
  } else if (calibrationDiagnosis === 'underconfident') {
    recommendations.push(
      'High task difficulty with modest self-efficacy. Break the initial phase into smaller quick-win milestones.',
    )
  }
  if (plan.goalOrientation.includes('avoidance')) {
    recommendations.push(
      'Reframe goals toward mastery-approach: focus on developing competence rather than avoiding mistakes.',
    )
  }

  return {
    planId: plan.id,
    goalSpecificityScore,
    strategicVarietyScore,
    calibrationRatio,
    calibrationDiagnosis,
    masteryOrientationStrength,
    forethoughtQualityScore,
    recommendations,
  }
}

export interface VolitionalAnalysisResult {
  sessionId: string
  focusEfficiencyRatio: number // active / duration (0-100%)
  distractionRatePerHour: number
  interventionResolutionRate: number // % resolved
  cognitiveLoadIndex: number // 1-10
  volitionalStabilityScore: number // composite 0-100%
  executiveControlLevel: 'fragile' | 'developing' | 'stable' | 'exceptional'
  insights: string[]
}

/**
 * Analyzes performance and volitional control during an active study session.
 * Evaluates attention focus, self-instruction intervention, and cognitive load (Paas 1992, Meichenbaum 1977).
 */
export function analyzeVolitionalControl(
  session: VolitionalControlSession,
): VolitionalAnalysisResult {
  const duration = Math.max(1, session.durationMinutes)
  const activeFocusMinutes = Math.min(duration, session.activeFocusMinutes)
  const focusEfficiencyRatio = Math.round((activeFocusMinutes / duration) * 100)

  const hours = duration / 60
  const distractionRatePerHour =
    Math.round((session.distractionTally / Math.max(0.1, hours)) * 10) / 10

  const totalInterventions = session.attentionInterventions.length
  const resolvedCount = session.attentionInterventions.filter((i) => i.resolved).length
  const interventionResolutionRate =
    totalInterventions > 0 ? Math.round((resolvedCount / totalInterventions) * 100) : 100

  // Composite volitional stability score (weights sum to 1.0 across focus, resolution, and distraction resilience)
  const distractionResilience = Math.max(0, 25 - distractionRatePerHour * 5)
  let stability =
    focusEfficiencyRatio * 0.5 + interventionResolutionRate * 0.25 + distractionResilience
  if (session.perceivedCognitiveLoad > 8) {
    stability -= 10 // cognitive overload penalty
  }
  const volitionalStabilityScore = Math.max(0, Math.min(100, Math.round(stability)))

  let executiveControlLevel: 'fragile' | 'developing' | 'stable' | 'exceptional'
  if (volitionalStabilityScore >= 90) executiveControlLevel = 'exceptional'
  else if (volitionalStabilityScore >= 75) executiveControlLevel = 'stable'
  else if (volitionalStabilityScore >= 55) executiveControlLevel = 'developing'
  else executiveControlLevel = 'fragile'

  const insights: string[] = []
  if (focusEfficiencyRatio < 70) {
    insights.push(
      `Focus ratio of ${focusEfficiencyRatio}% indicates significant attention leakage. Deploy Pomodoro intervals.`,
    )
  }
  if (session.distractionTally > 4) {
    insights.push(
      `${session.distractionTally} distractions logged. Utilize self-instruction prompts (Meichenbaum 1977) to redirect attention.`,
    )
  }
  if (session.perceivedCognitiveLoad >= 8) {
    insights.push(
      'Elevated cognitive load detected. Reduce element interactivity by scaffolding exercises.',
    )
  }

  return {
    sessionId: session.id,
    focusEfficiencyRatio,
    distractionRatePerHour,
    interventionResolutionRate,
    cognitiveLoadIndex: session.perceivedCognitiveLoad,
    volitionalStabilityScore,
    executiveControlLevel,
    insights,
  }
}

export interface AttributionalStyleResult {
  totalAttributions: number
  controllableInternalRatio: number // Weiner adaptive index (%)
  isGrowthMindsetOriented: boolean
  learnedHelplessnessRisk: boolean
  predominantAttribution: WeinerAttributionCategory
  adaptiveInferenceScore: number // 0-100%
  reframingDirectives: string[]
}

/**
 * Assesses causal attributions following Weiner (1985) and Zimmerman (2002).
 * Controllable, internal, unstable attributions (effort, strategy) empower future mastery;
 * stable, uncontrollable internal attributions (fixed ability) breed learned helplessness.
 */
export function evaluateCausalAttributions(
  attributions: CausalAttribution[],
): AttributionalStyleResult {
  if (attributions.length === 0) {
    return {
      totalAttributions: 0,
      controllableInternalRatio: 100,
      isGrowthMindsetOriented: true,
      learnedHelplessnessRisk: false,
      predominantAttribution: 'strategy',
      adaptiveInferenceScore: 75,
      reframingDirectives: [
        'Log attributions for session outcomes to cultivate metacognitive awareness.',
      ],
    }
  }

  let controllableInternalCount = 0
  let helplessAttributionCount = 0
  const categoryCounts: Record<WeinerAttributionCategory, number> = {
    effort: 0,
    strategy: 0,
    ability: 0,
    task_difficulty: 0,
    luck: 0,
    environment: 0,
  }

  for (const attr of attributions) {
    categoryCounts[attr.category] = (categoryCounts[attr.category] || 0) + 1

    if (attr.locus === 'internal' && attr.controllability === 'controllable') {
      controllableInternalCount++
    }

    // Ability attribution for failure breeds helplessness (Dweck & Leggett 1988)
    if (
      attr.outcomeValence === 'failure' &&
      attr.category === 'ability' &&
      attr.stability === 'stable'
    ) {
      helplessAttributionCount++
    }
  }

  const total = attributions.length
  const controllableInternalRatio = Math.round((controllableInternalCount / total) * 100)

  // Find predominant
  let predominantAttribution: WeinerAttributionCategory = 'effort'
  let maxCount = -1
  for (const [cat, count] of Object.entries(categoryCounts) as [
    WeinerAttributionCategory,
    number,
  ][]) {
    if (count > maxCount) {
      maxCount = count
      predominantAttribution = cat
    }
  }

  const isGrowthMindsetOriented = controllableInternalRatio >= 60
  const learnedHelplessnessRisk = helplessAttributionCount > 0

  let adaptiveInferenceScore = controllableInternalRatio
  if (learnedHelplessnessRisk) adaptiveInferenceScore = Math.max(10, adaptiveInferenceScore - 30)

  const reframingDirectives: string[] = []
  if (learnedHelplessnessRisk) {
    reframingDirectives.push(
      'CRITICAL REFRAMING: Shift failure attributions away from "fixed ability" toward "learning strategy" or "procedural execution". Competence is plastic (Dweck 2006).',
    )
  }
  if (categoryCounts.luck > 0) {
    reframingDirectives.push(
      'Attributions to luck undermine self-efficacy. Identify concrete actions that determined the outcome.',
    )
  }
  if (isGrowthMindsetOriented) {
    reframingDirectives.push(
      'Excellent attributional calibration: outcomes are viewed as controllable consequences of strategy and effort.',
    )
  }

  return {
    totalAttributions: total,
    controllableInternalRatio,
    isGrowthMindsetOriented,
    learnedHelplessnessRisk,
    predominantAttribution,
    adaptiveInferenceScore,
    reframingDirectives,
  }
}

/**
 * Normative benchmarks and scoring for the Motivated Strategies for Learning Questionnaire (MSLQ).
 * Derived from Pintrich et al. (1991, 1993) normative college sample data.
 */
const MSLQ_SCALE_METADATA: Record<
  MSLQScaleKey,
  {
    label: string
    category: 'motivation' | 'cognitive_metacognitive' | 'resource_management'
    normMean: number
    normSD: number
  }
> = {
  intrinsic_goal_orientation: {
    label: 'Intrinsic Goal Orientation',
    category: 'motivation',
    normMean: 5.03,
    normSD: 1.09,
  },
  extrinsic_goal_orientation: {
    label: 'Extrinsic Goal Orientation',
    category: 'motivation',
    normMean: 5.03,
    normSD: 1.23,
  },
  task_value: {
    label: 'Task Value & Utility',
    category: 'motivation',
    normMean: 5.54,
    normSD: 1.05,
  },
  control_of_learning_beliefs: {
    label: 'Control of Learning Beliefs',
    category: 'motivation',
    normMean: 5.74,
    normSD: 0.98,
  },
  self_efficacy_for_learning: {
    label: 'Self-Efficacy for Learning',
    category: 'motivation',
    normMean: 5.47,
    normSD: 1.14,
  },
  test_anxiety: {
    label: 'Test / Performance Anxiety',
    category: 'motivation',
    normMean: 3.63,
    normSD: 1.34,
  },
  rehearsal: {
    label: 'Rehearsal Strategies',
    category: 'cognitive_metacognitive',
    normMean: 4.53,
    normSD: 1.25,
  },
  elaboration: {
    label: 'Elaboration & Generative Thought',
    category: 'cognitive_metacognitive',
    normMean: 4.91,
    normSD: 1.08,
  },
  organization: {
    label: 'Organization & Concept Mapping',
    category: 'cognitive_metacognitive',
    normMean: 4.67,
    normSD: 1.24,
  },
  critical_thinking: {
    label: 'Critical Thinking & Questioning',
    category: 'cognitive_metacognitive',
    normMean: 4.16,
    normSD: 1.28,
  },
  metacognitive_self_regulation: {
    label: 'Metacognitive Self-Regulation',
    category: 'cognitive_metacognitive',
    normMean: 4.54,
    normSD: 0.9,
  },
  time_and_study_environment: {
    label: 'Time & Study Environment Management',
    category: 'resource_management',
    normMean: 4.87,
    normSD: 1.05,
  },
  effort_regulation: {
    label: 'Effort Regulation & Persistence',
    category: 'resource_management',
    normMean: 5.25,
    normSD: 1.1,
  },
  peer_learning: {
    label: 'Peer Learning & Collaboration',
    category: 'resource_management',
    normMean: 3.99,
    normSD: 1.53,
  },
  help_seeking: {
    label: 'Help Seeking & Resource Utilization',
    category: 'resource_management',
    normMean: 4.44,
    normSD: 1.26,
  },
}

/**
 * Calculates standardized z-score to percentile approximation.
 */
function zScoreToPercentile(z: number): number {
  // Normal cumulative distribution approximation (Abramowitz & Stegun 1964)
  const sign = z < 0 ? -1 : 1
  const absZ = Math.abs(z)
  const t = 1.0 / (1.0 + 0.2316419 * absZ)
  const p =
    0.3989422804014337 *
    Math.exp((-absZ * absZ) / 2) *
    (0.31938153 * t +
      -0.356563782 * t * t +
      1.781477937 * t * t * t +
      -1.821255978 * t * t * t * t +
      1.330274429 * t * t * t * t * t)
  const cdf = sign === 1 ? 1.0 - p : p
  return Math.min(100, Math.max(1, Math.round(cdf * 100)))
}

/**
 * Evaluates raw MSLQ response item map and computes subscales, percentiles, benchmarks, and prescriptive interventions.
 */
export function scoreMSLQ(responses: Record<string, number>): MSLQProfileResult {
  const scaleAccumulator: Record<MSLQScaleKey, { sum: number; count: number }> = {
    intrinsic_goal_orientation: { sum: 0, count: 0 },
    extrinsic_goal_orientation: { sum: 0, count: 0 },
    task_value: { sum: 0, count: 0 },
    control_of_learning_beliefs: { sum: 0, count: 0 },
    self_efficacy_for_learning: { sum: 0, count: 0 },
    test_anxiety: { sum: 0, count: 0 },
    rehearsal: { sum: 0, count: 0 },
    elaboration: { sum: 0, count: 0 },
    organization: { sum: 0, count: 0 },
    critical_thinking: { sum: 0, count: 0 },
    metacognitive_self_regulation: { sum: 0, count: 0 },
    time_and_study_environment: { sum: 0, count: 0 },
    effort_regulation: { sum: 0, count: 0 },
    peer_learning: { sum: 0, count: 0 },
    help_seeking: { sum: 0, count: 0 },
  }

  // Populate from item mappings
  for (const item of STANDARD_MSLQ_ITEMS) {
    let val = responses[item.id] ?? responses[item.scale]
    if (val !== undefined) {
      val = Math.max(1, Math.min(7, val))
      if (item.reverseScored) {
        val = 8 - val
      }
      scaleAccumulator[item.scale].sum += val
      scaleAccumulator[item.scale].count += 1
    }
  }

  const subscaleResults: Record<MSLQScaleKey, MSLQSubscaleResult> = {} as Record<
    MSLQScaleKey,
    MSLQSubscaleResult
  >
  const categorySums: Record<
    'motivation' | 'cognitive_metacognitive' | 'resource_management',
    { sum: number; count: number }
  > = {
    motivation: { sum: 0, count: 0 },
    cognitive_metacognitive: { sum: 0, count: 0 },
    resource_management: { sum: 0, count: 0 },
  }

  const strengths: { scale: MSLQScaleKey; label: string; score: number }[] = []
  const bottlenecks: { scale: MSLQScaleKey; label: string; score: number }[] = []

  for (const [keyStr, meta] of Object.entries(MSLQ_SCALE_METADATA) as [
    MSLQScaleKey,
    (typeof MSLQ_SCALE_METADATA)[MSLQScaleKey],
  ][]) {
    const acc = scaleAccumulator[keyStr]
    // Default to normative mean if unrated
    const rawMean = acc.count > 0 ? Math.round((acc.sum / acc.count) * 100) / 100 : meta.normMean

    categorySums[meta.category].sum += rawMean
    categorySums[meta.category].count += 1

    // Standardized z-score
    const z = (rawMean - meta.normMean) / meta.normSD
    let percentile = zScoreToPercentile(z)

    // For test anxiety, lower is better (invert percentile)
    if (keyStr === 'test_anxiety') {
      percentile = 101 - percentile
    }

    let benchmarkLevel: 'low' | 'moderate' | 'high' | 'exemplary'
    if (percentile >= 85) benchmarkLevel = 'exemplary'
    else if (percentile >= 60) benchmarkLevel = 'high'
    else if (percentile >= 35) benchmarkLevel = 'moderate'
    else benchmarkLevel = 'low'

    let recommendation = ''
    switch (keyStr) {
      case 'metacognitive_self_regulation':
        recommendation =
          benchmarkLevel === 'low'
            ? 'Set explicit checkpoints before and during study sessions to monitor comprehension.'
            : 'Maintain active monitoring heuristics and self-correction during difficult problems.'
        break
      case 'effort_regulation':
        recommendation =
          benchmarkLevel === 'low'
            ? 'Build persistence against cognitive friction using timed interval sessions and micro-rewards.'
            : 'Robust volitional stamina demonstrated across demanding tasks.'
        break
      case 'elaboration':
        recommendation =
          benchmarkLevel === 'low'
            ? 'Transition from passive re-reading to elaborative interrogation ("why does this hold?").'
            : 'Consistently synthesizes novel knowledge with pre-existing mental models.'
        break
      case 'test_anxiety':
        recommendation =
          rawMean > 4.5
            ? 'High evaluative anxiety detected. Deploy somatic down-regulation and low-stakes retrieval quizzes.'
            : 'Well-regulated physiological state during assessment events.'
        break
      default:
        recommendation = `Target continuous calibration in ${meta.label.toLowerCase()}.`
    }

    subscaleResults[keyStr] = {
      scaleKey: keyStr,
      label: meta.label,
      category: meta.category,
      rawMean,
      percentileNorm: percentile,
      benchmarkLevel,
      recommendation,
    }

    if (keyStr !== 'extrinsic_goal_orientation') {
      if (percentile >= 75) strengths.push({ scale: keyStr, label: meta.label, score: percentile })
      if (percentile <= 35)
        bottlenecks.push({ scale: keyStr, label: meta.label, score: percentile })
    }
  }

  strengths.sort((a, b) => b.score - a.score)
  bottlenecks.sort((a, b) => a.score - b.score)

  const motivationScore =
    Math.round((categorySums.motivation.sum / Math.max(1, categorySums.motivation.count)) * 100) /
    100
  const cognitiveStrategyScore =
    Math.round(
      (categorySums.cognitive_metacognitive.sum /
        Math.max(1, categorySums.cognitive_metacognitive.count)) *
        100,
    ) / 100
  const resourceManagementScore =
    Math.round(
      (categorySums.resource_management.sum / Math.max(1, categorySums.resource_management.count)) *
        100,
    ) / 100

  // Composite overall index 0-100
  const overallMetacognitiveIndex = Math.round(
    ((motivationScore / 7) * 0.3 +
      (cognitiveStrategyScore / 7) * 0.4 +
      (resourceManagementScore / 7) * 0.3) *
      100,
  )

  const prescribedInterventions: string[] = []
  if (bottlenecks.length > 0) {
    prescribedInterventions.push(
      `Priority Bottleneck: Strengthen "${bottlenecks[0].label}" (${subscaleResults[bottlenecks[0].scale].recommendation})`,
    )
  }
  if (
    subscaleResults.effort_regulation.benchmarkLevel === 'low' &&
    subscaleResults.test_anxiety.rawMean > 4.5
  ) {
    prescribedInterventions.push(
      'Dual risk profile detected: Low effort regulation coupled with high anxiety. Implement immediate desensitization protocols.',
    )
  }
  if (subscaleResults.rehearsal.rawMean > 5.5 && subscaleResults.elaboration.rawMean < 4.0) {
    prescribedInterventions.push(
      'Over-reliance on rote rehearsal. Replace with generative concept mapping and Feynman articulation.',
    )
  }

  return {
    overallMetacognitiveIndex,
    motivationScore,
    cognitiveStrategyScore,
    resourceManagementScore,
    scales: subscaleResults,
    topStrengths: strengths.slice(0, 3).map((s) => s.label),
    criticalBottlenecks: bottlenecks.slice(0, 3).map((b) => b.label),
    prescribedInterventions,
    assessedAt: new Date().toISOString(),
  }
}

export interface ZimmermanCyclicIndexResult {
  compositeSRLIndex: number // 0-100%
  maturityLevel: 'novice' | 'competent' | 'proficient' | 'expert_self_regulated'
  forethoughtScore: number
  volitionalScore: number
  selfReflectionScore: number
  cyclicPhaseEquilibrium: number // 0-100 (balance across all 3 phases)
  prescribedPhaseFocus: 'forethought' | 'volition' | 'self_reflection'
}

/**
 * Computes the holistic Zimmerman Cyclical Self-Regulation Index across all 3 phases.
 * Evaluates whether the learner forms a closed self-correcting feedback loop (Zimmerman 2002).
 */
export function computeZimmermanCyclicIndex(profile: SRLCyclicProfile): ZimmermanCyclicIndexResult {
  // Forethought score
  let forethoughtScore = 50
  if (profile.forethoughtPlans.length > 0) {
    const latestPlan = profile.forethoughtPlans[profile.forethoughtPlans.length - 1]
    forethoughtScore = evaluateForethought(latestPlan).forethoughtQualityScore
  }

  // Volitional score
  let volitionalScore = 50
  if (profile.volitionalSessions.length > 0) {
    const latestSession = profile.volitionalSessions[profile.volitionalSessions.length - 1]
    volitionalScore = analyzeVolitionalControl(latestSession).volitionalStabilityScore
  }

  // Reflection score
  let selfReflectionScore = 50
  if (profile.reflections.length > 0) {
    const latestReflection = profile.reflections[profile.reflections.length - 1]
    selfReflectionScore = evaluateCausalAttributions(
      latestReflection.attributions,
    ).adaptiveInferenceScore
  }

  // If MSLQ exists, modulate slightly
  if (profile.latestMSLQProfile) {
    const mslq = profile.latestMSLQProfile.overallMetacognitiveIndex
    forethoughtScore = Math.round(forethoughtScore * 0.7 + mslq * 0.3)
    volitionalScore = Math.round(volitionalScore * 0.7 + mslq * 0.3)
    selfReflectionScore = Math.round(selfReflectionScore * 0.7 + mslq * 0.3)
  }

  const compositeSRLIndex = Math.round(
    forethoughtScore * 0.3 + volitionalScore * 0.35 + selfReflectionScore * 0.35,
  )

  let maturityLevel: 'novice' | 'competent' | 'proficient' | 'expert_self_regulated'
  if (compositeSRLIndex >= 85) maturityLevel = 'expert_self_regulated'
  else if (compositeSRLIndex >= 70) maturityLevel = 'proficient'
  else if (compositeSRLIndex >= 50) maturityLevel = 'competent'
  else maturityLevel = 'novice'

  // Equilibrium (variance between phases)
  const mean = (forethoughtScore + volitionalScore + selfReflectionScore) / 3
  const variance =
    (Math.pow(forethoughtScore - mean, 2) +
      Math.pow(volitionalScore - mean, 2) +
      Math.pow(selfReflectionScore - mean, 2)) /
    3
  const stdDev = Math.sqrt(variance)
  const cyclicPhaseEquilibrium = Math.max(0, Math.min(100, Math.round(100 - stdDev * 2)))

  // Identify weakest phase
  let prescribedPhaseFocus: 'forethought' | 'volition' | 'self_reflection' = 'forethought'
  const minScore = Math.min(forethoughtScore, volitionalScore, selfReflectionScore)
  if (minScore === volitionalScore) prescribedPhaseFocus = 'volition'
  else if (minScore === selfReflectionScore) prescribedPhaseFocus = 'self_reflection'

  return {
    compositeSRLIndex,
    maturityLevel,
    forethoughtScore,
    volitionalScore,
    selfReflectionScore,
    cyclicPhaseEquilibrium,
    prescribedPhaseFocus,
  }
}

/**
 * Bridges Self-Regulated Learning metrics into the FSRS Spaced Repetition engine.
 * High self-regulation modulates retention stability multiplier.
 */
export function bridgeSRLToFSRS(srlIndex: number, currentFSRSStability: number) {
  // SRL index 0-100 mapped to 0.85 - 1.25 multiplier
  const multiplier = 0.85 + (Math.max(0, Math.min(100, srlIndex)) / 100) * 0.4
  const modulatedStability = Math.round(currentFSRSStability * multiplier * 100) / 100
  return {
    originalStability: currentFSRSStability,
    modulatedStability,
    srlRetentionMultiplier: Math.round(multiplier * 100) / 100,
  }
}
