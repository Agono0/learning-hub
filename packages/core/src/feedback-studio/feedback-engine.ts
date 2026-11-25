/**
 * @file feedback-engine.ts
 * @description Feedback Literacy & Formative Assessment Cognitive Engine
 *
 * Implements three converging research traditions on instructional feedback:
 *
 * 1. Hattie & Timperley (2007) "The Power of Feedback" — feedback must answer
 *    three questions (Where am I going? How am I going? Where to next?) and
 *    operates at four levels: task (FT), process (FP), self-regulation (FR),
 *    and self (FS). The self level (person-directed praise) is the least
 *    effective and can be counterproductive; process and self-regulation
 *    levels drive the deepest transfer.
 *
 * 2. Kluger & DeNisi (1996) Feedback Intervention Theory (FIT) — a
 *    meta-analysis of 3,000+ observations: feedback interventions change
 *    behavior by redirecting attention. Mean effect d ≈ 0.41, but over
 *    one third of feedback interventions REDUCED performance, typically
 *    when feedback moved attention from the task to the self.
 *
 * 3. Shute (2008) "Focus on Formative Feedback" — formative feedback should
 *    be specific, nonevaluative, manageable in volume, focused on the task
 *    and process (not the learner), delivered after the learner has
 *    attempted a response, and should scaffold rather than give the answer.
 *
 * All functions are pure and deterministic; classification uses an explicit,
 * inspectable cue lexicon so every automated judgment is auditable by hand.
 *
 * References:
 * - Hattie, J., & Timperley, H. (2007). The power of feedback. Review of
 *   Educational Research, 77(1), 81-112.
 * - Kluger, A. N., & DeNisi, A. (1996). The effects of feedback interventions
 *   on performance. Psychological Bulletin, 119(2), 254-284.
 * - Shute, V. J. (2008). Focus on formative feedback. Review of Educational
 *   Research, 78(1), 153-189.
 * - Wiliam, D. (2011). Embedded Formative Assessment. Solution Tree.
 * - Nicol, D. J., & Macfarlane-Dick, D. (2006). Formative assessment and
 *   self-regulated learning. Studies in Higher Education, 31(2), 199-218.
 */

import { z } from 'zod'
import {
  CANONICAL_FEEDBACK_SCENARIOS,
  FEEDBACK_CUE_LEXICON,
  SHUTE_GUIDELINES,
  getFeedbackScenarioById,
} from './content'

/* ==========================================================================
 * ZOD SCHEMAS & TYPES
 * ========================================================================== */

/**
 * The four feedback levels from Hattie & Timperley (2007, Table 1):
 * - `task` — feedback about how well the task is performed (FT):
 *   correctness, surface features, quantity of work.
 * - `process` — feedback about the underlying processes and strategies
 *   used to perform the task (FP).
 * - `self_regulation` — feedback about the way the learner monitors,
 *   directs, and regulates their own actions (FR): metacognition,
 *   self-verification, confidence calibration.
 * - `self` — feedback directed at the person rather than the work (FS):
 *   generic praise of traits ("you are smart"). Least effective level.
 */
export const FeedbackLevelEnum = z.enum(['task', 'process', 'self_regulation', 'self'])
export type FeedbackLevel = z.infer<typeof FeedbackLevelEnum>

/**
 * Feedback timing. Shute (2008): immediate feedback suits procedural
 * acquisition and difficult tasks early in learning; delayed feedback suits
 * transfer, well-practiced tasks, and retrieval practice contexts.
 */
export const FeedbackTimingEnum = z.enum(['immediate', 'delayed'])
export type FeedbackTiming = z.infer<typeof FeedbackTimingEnum>

/**
 * FIT attention-shift outcome (Kluger & DeNisi 1996): a feedback
 * intervention moves attention to one of these loci, which predicts
 * whether performance improves or declines.
 */
export const FITAttentionLocusEnum = z.enum(['task_learning', 'task_motivation', 'meta_task_self'])
export type FITAttentionLocus = z.infer<typeof FITAttentionLocusEnum>

/** One statement of instructional feedback, validated at the boundary. */
export const FeedbackStatementSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  /** Optional author-declared level; the classifier verifies it. */
  declaredLevel: FeedbackLevelEnum.optional(),
  timing: FeedbackTimingEnum.default('immediate'),
})
export type FeedbackStatement = z.infer<typeof FeedbackStatementSchema>

/** Per-level classifier evidence, kept for auditability. */
export const LevelEvidenceSchema = z.object({
  level: FeedbackLevelEnum,
  /** Weighted cue score for this level (>= 0). */
  score: z.number().min(0),
  /** Lexicon cue ids that fired for this level. */
  matchedCues: z.array(z.string()),
})
export type LevelEvidence = z.infer<typeof LevelEvidenceSchema>

/**
 * FIT risk: why this statement might redirect attention toward the self
 * and depress performance (Kluger & DeNisi 1996).
 */
export const FITRiskEnum = z.enum([
  /** Trait praise: attributes outcome to fixed ability ("you are smart"). */
  'trait_praise',
  /** Normative comparison to peers ("better than most of the class"). */
  'normative_comparison',
  /** Generic affect without information ("well done!"). */
  'content_free_praise',
  /** Ego threat: implies deficiency of the person ("careless"). */
  'ego_threat',
])
export type FITRisk = z.infer<typeof FITRiskEnum>

/** Classifier output for one statement. */
export const FeedbackClassificationSchema = z.object({
  statementId: z.string().min(1),
  level: FeedbackLevelEnum,
  /** 0..1 margin of the winning level over the runner-up, cue-weighted. */
  confidence: z.number().min(0).max(1),
  evidence: z.array(LevelEvidenceSchema),
  fitRisks: z.array(FITRiskEnum),
  /** True when a declared level disagrees with the classified level. */
  declaredMismatch: z.boolean(),
})
export type FeedbackClassification = z.infer<typeof FeedbackClassificationSchema>

/** Audit of one statement against one Shute (2008) guideline. */
export const ShuteGuidelineAuditSchema = z.object({
  guidelineId: z.string().min(1),
  status: z.enum(['pass', 'at_risk', 'violated']),
  rationale: z.string().min(1),
})
export type ShuteGuidelineAudit = z.infer<typeof ShuteGuidelineAuditSchema>

/**
 * A full formative scenario: one assessment item with misconception-tagged
 * distractors and three-level exemplar feedback per option.
 */
export const FeedbackScenarioSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1),
  concept: z.string().min(1),
  difficulty: z.number().int().min(1).max(5),
  stem: z.string().min(1),
  options: z
    .array(
      z.object({
        id: z.string().min(1),
        text: z.string().min(1),
        isCorrect: z.boolean(),
        /** Stable tag for the misconception this distractor encodes. */
        misconceptionTag: z.string().optional(),
        /** Canonical three-level exemplar feedback for choosing this option. */
        feedback: z.object({
          task: z.string().min(1),
          process: z.string().min(1),
          selfRegulation: z.string().min(1),
        }),
      }),
    )
    .min(2),
  explanation: z.string().min(1),
})
export type FeedbackScenario = z.infer<typeof FeedbackScenarioSchema>

/** One graded learner response inside a scenario. */
export const FeedbackResponseSchema = z.object({
  scenarioId: z.string().min(1),
  optionId: z.string().min(1),
  /** Learner's self-rated confidence before feedback (1 = guessing, 5 = sure). */
  confidence: z.number().int().min(1).max(5).default(3),
})
export type FeedbackResponse = z.infer<typeof FeedbackResponseSchema>

/** Composite metric report for a body of feedback (e.g. a course's worth). */
export const FLMetricsSchema = z.object({
  /** Formative Alignment Score: mean Shute-guideline adherence, 0-100. */
  formativeAlignmentScore: z.number().min(0).max(100),
  /** Level Balance Score: closeness of level mix to the canonical target, 0-100. */
  levelBalanceScore: z.number().min(0).max(100),
  /** Self-Focus Safety Score: 100 minus FIT self-attention risk load, 0-100. */
  selfFocusSafetyScore: z.number().min(0).max(100),
  /** Feedback Quality Index: weighted composite, 0-100. */
  feedbackQualityIndex: z.number().min(0).max(100),
  statementCount: z.number().int().min(0),
  levelCounts: z.record(FeedbackLevelEnum, z.number().int().min(0)),
  riskCounts: z.record(FITRiskEnum, z.number().int().min(0)),
})
export type FLMetrics = z.infer<typeof FLMetricsSchema>

/** One card emitted for the FSRS-6 bridge. */
export const FeedbackCardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  tags: z.array(z.string()),
  sourceRef: z.string().min(1),
})
export type FeedbackCard = z.infer<typeof FeedbackCardSchema>

/* ==========================================================================
 * RESEARCH CONSTANTS
 * ========================================================================== */

/**
 * Kluger & DeNisi (1996) meta-analytic anchors, used only as documented
 * reference points in rationales (never as free-floating multipliers).
 */
export const FIT_MEAN_EFFECT_SIZE = 0.41
export const FIT_NEGATIVE_INTERVENTION_FRACTION = 0.33

/**
 * Canonical target mix of feedback levels for a formative context.
 * Rationale: Hattie & Timperley (2007) show process + self-regulation
 * feedback drive transfer, task feedback is necessary for correctness but
 * weak for transfer, and self-level feedback should be rare and never
 * content-free. The 5% self ceiling encodes "some human warmth is fine,
 * person-directed evaluation is not".
 */
export const TARGET_LEVEL_MIX: Readonly<Record<FeedbackLevel, number>> = {
  task: 0.35,
  process: 0.3,
  self_regulation: 0.3,
  self: 0.05,
} as const

/** Composite weights for the Feedback Quality Index. */
export const FQI_WEIGHTS = {
  formativeAlignment: 0.4,
  levelBalance: 0.3,
  selfFocusSafety: 0.3,
} as const

/** Per-risk deduction from the Self-Focus Safety Score (clamped at 0). */
export const FIT_RISK_DEDUCTIONS: Readonly<Record<FITRisk, number>> = {
  trait_praise: 18,
  normative_comparison: 14,
  content_free_praise: 8,
  ego_threat: 16,
} as const

/* ==========================================================================
 * CLASSIFIER
 * ========================================================================== */

/** Normalize text for cue matching: lowercase, collapse whitespace. */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * Classify one feedback statement into a Hattie & Timperley (2007) level.
 *
 * The classifier is deliberately transparent: it scores the statement
 * against an explicit cue lexicon (see content.ts) and reports the evidence
 * per level, so a teacher can audit every automated label. Confidence is
 * the winning level's share of total cue mass; 0 when no cue fires
 * (in which case the statement defaults to `task`, the surface default).
 */
export function classifyFeedbackStatement(statement: FeedbackStatement): FeedbackClassification {
  const text = normalizeText(statement.text)
  const levels: FeedbackLevel[] = ['task', 'process', 'self_regulation', 'self']

  const evidence: LevelEvidence[] = levels.map((level) => {
    const matched: string[] = []
    let score = 0
    for (const cue of FEEDBACK_CUE_LEXICON) {
      if (cue.level !== level) continue
      if (text.includes(cue.pattern)) {
        matched.push(cue.id)
        score += cue.weight
      }
    }
    return { level, score, matchedCues: matched }
  })

  const total = evidence.reduce((sum, e) => sum + e.score, 0)
  let winner: LevelEvidence = evidence[0]
  for (const e of evidence) {
    if (e.score > winner.score) winner = e
  }
  const level: FeedbackLevel = total === 0 ? 'task' : winner.level
  const confidence = total === 0 ? 0 : Math.min(1, winner.score / total)

  const fitRisks = detectFITRisks(text)
  const declaredMismatch =
    statement.declaredLevel !== undefined && statement.declaredLevel !== level

  return { statementId: statement.id, level, confidence, evidence, fitRisks, declaredMismatch }
}

/**
 * Detect FIT self-attention risks in normalized statement text.
 * Each pattern is grounded in Kluger & DeNisi's (1996) account of how
 * feedback moves attention to meta-task (self) processes.
 */
function detectFITRisks(text: string): FITRisk[] {
  const risks = new Set<FITRisk>()

  const traitPatterns = [
    'you are smart',
    "you're smart",
    'you are clever',
    "you're clever",
    'you are a natural',
    'so talented',
    'gifted',
    'a genius',
    'not your strength',
    'you are bad at',
    "you're bad at",
  ]
  if (traitPatterns.some((p) => text.includes(p))) risks.add('trait_praise')

  const normativePatterns = [
    'better than most',
    'top of the class',
    'compared to your classmates',
    'compared to your peers',
    'others did worse',
    'others did better',
    'rank',
    'percentile',
  ]
  if (normativePatterns.some((p) => text.includes(p))) risks.add('normative_comparison')

  const contentFreePatterns = [
    'well done',
    'good job',
    'great work',
    'awesome',
    'amazing',
    'keep it up',
    'nice one',
    'bravo',
  ]
  const hasInformationalContent =
    /because|since|step|strategy|method|check|verify|error|mistake|concept|reason/.test(text)
  if (contentFreePatterns.some((p) => text.includes(p)) && !hasInformationalContent) {
    risks.add('content_free_praise')
  }

  const egoThreatPatterns = [
    'careless',
    'sloppy',
    'lazy',
    'not trying',
    'you failed to',
    'you always get this wrong',
    'you never',
    'disappointing',
  ]
  if (egoThreatPatterns.some((p) => text.includes(p))) risks.add('ego_threat')

  return [...risks]
}

/* ==========================================================================
 * SHUTE (2008) FORMATIVE AUDIT
 * ========================================================================== */

/**
 * Audit a set of feedback statements against Shute's (2008) formative
 * feedback guidelines. Returns one audit row per guideline plus a
 * Formative Alignment Score (percentage of guidelines at `pass`).
 *
 * Heuristics are intentionally conservative: a guideline is `at_risk`
 * when evidence is mixed, `violated` when a clear anti-pattern is present.
 */
export function auditFeedbackAgainstShute(statements: FeedbackStatement[]): {
  audits: ShuteGuidelineAudit[]
  formativeAlignmentScore: number
} {
  const classifications = statements.map(classifyFeedbackStatement)
  const texts = statements.map((s) => normalizeText(s.text))
  const joined = texts.join(' ')
  const audits: ShuteGuidelineAudit[] = []

  const hasSelfRisk = classifications.some((c) => c.fitRisks.length > 0)
  const hasSelfLevel = classifications.some((c) => c.level === 'self')
  const hasProcess = classifications.some((c) => c.level === 'process')
  const hasSelfReg = classifications.some((c) => c.level === 'self_regulation')
  const avgLength = texts.reduce((n, t) => n + t.split(' ').length, 0) / Math.max(1, texts.length)
  const mentionsVerification = /check|verify|test your|confirm|compare your/.test(joined)
  const givesAnswerDirectly = /the answer is|correct answer is/.test(joined)
  const hasSpecificReference = /step|line|because|term|definition|formula|example/.test(joined)

  for (const g of SHUTE_GUIDELINES) {
    let status: ShuteGuidelineAudit['status'] = 'pass'
    let rationale = 'No anti-pattern detected.'
    switch (g.id) {
      case 'shute-task-focus':
        if (hasSelfLevel && hasSelfRisk) {
          status = 'violated'
          rationale = 'Self-level statements with FIT risks redirect attention to the person.'
        } else if (hasSelfLevel || hasSelfRisk) {
          status = 'at_risk'
          rationale = 'Some statements drift toward the person rather than the task.'
        }
        break
      case 'shute-specific':
        if (!hasSpecificReference) {
          status = 'violated'
          rationale = 'Feedback lacks specific references to steps, terms, or reasons.'
        }
        break
      case 'shute-nonevaluative':
        if (hasSelfRisk) {
          status = 'at_risk'
          rationale = 'Evaluative or ego-involving language detected.'
        }
        break
      case 'shute-manageable':
        if (avgLength > 60) {
          status = 'at_risk'
          rationale = 'Average statement length exceeds a manageable volume (~60 words).'
        }
        break
      case 'shute-scaffold':
        if (givesAnswerDirectly && !hasProcess) {
          status = 'violated'
          rationale = 'Answers are stated directly with no process scaffolding.'
        } else if (givesAnswerDirectly) {
          status = 'at_risk'
          rationale = 'Direct answers appear; pair them with process guidance.'
        }
        break
      case 'shute-process-level':
        if (!hasProcess) {
          status = 'at_risk'
          rationale = 'No process-level feedback detected.'
        }
        break
      case 'shute-self-regulation':
        if (!hasSelfReg || !mentionsVerification) {
          status = hasSelfReg ? 'at_risk' : 'violated'
          rationale = hasSelfReg
            ? 'Self-regulation feedback lacks explicit verification prompts.'
            : 'No self-regulation feedback detected.'
        }
        break
      default:
        break
    }
    audits.push({ guidelineId: g.id, status, rationale })
  }

  const passCount = audits.filter((a) => a.status === 'pass').length
  const halfCredit = audits.filter((a) => a.status === 'at_risk').length
  const formativeAlignmentScore = Math.round(
    ((passCount + 0.5 * halfCredit) / Math.max(1, audits.length)) * 100,
  )
  return { audits, formativeAlignmentScore }
}

/* ==========================================================================
 * LEVEL BALANCE & COMPOSITE METRICS
 * ========================================================================== */

/**
 * Score how close an observed level mix is to TARGET_LEVEL_MIX.
 * Uses total variation distance mapped to 0-100 (1 - TVD) * 100.
 */
export function computeLevelBalanceScore(counts: Record<FeedbackLevel, number>): number {
  const total = counts.task + counts.process + counts.self_regulation + counts.self
  if (total === 0) return 0
  const levels: FeedbackLevel[] = ['task', 'process', 'self_regulation', 'self']
  let tvd = 0
  for (const level of levels) {
    tvd += Math.abs(counts[level] / total - TARGET_LEVEL_MIX[level])
  }
  tvd /= 2
  return Math.round((1 - tvd) * 100)
}

/** Self-Focus Safety Score: 100 minus summed FIT risk deductions (clamped). */
export function computeSelfFocusSafetyScore(classifications: FeedbackClassification[]): number {
  let deduction = 0
  for (const c of classifications) {
    for (const risk of c.fitRisks) {
      deduction += FIT_RISK_DEDUCTIONS[risk]
    }
  }
  return Math.max(0, Math.round(100 - deduction))
}

/**
 * Composite Feedback Quality Index for a body of feedback statements.
 * FQI = 0.4 * FormativeAlignment + 0.3 * LevelBalance + 0.3 * SelfFocusSafety.
 */
export function calculateFLMetrics(statements: FeedbackStatement[]): FLMetrics {
  const classifications = statements.map(classifyFeedbackStatement)
  const levelCounts: Record<FeedbackLevel, number> = {
    task: 0,
    process: 0,
    self_regulation: 0,
    self: 0,
  }
  const riskCounts: Record<FITRisk, number> = {
    trait_praise: 0,
    normative_comparison: 0,
    content_free_praise: 0,
    ego_threat: 0,
  }
  for (const c of classifications) {
    levelCounts[c.level] += 1
    for (const r of c.fitRisks) riskCounts[r] += 1
  }
  const { formativeAlignmentScore } = auditFeedbackAgainstShute(statements)
  const levelBalanceScore = computeLevelBalanceScore(levelCounts)
  const selfFocusSafetyScore = computeSelfFocusSafetyScore(classifications)
  const feedbackQualityIndex = Math.round(
    FQI_WEIGHTS.formativeAlignment * formativeAlignmentScore +
      FQI_WEIGHTS.levelBalance * levelBalanceScore +
      FQI_WEIGHTS.selfFocusSafety * selfFocusSafetyScore,
  )
  return {
    formativeAlignmentScore,
    levelBalanceScore,
    selfFocusSafetyScore,
    feedbackQualityIndex,
    statementCount: statements.length,
    levelCounts,
    riskCounts,
  }
}

/* ==========================================================================
 * SCENARIO ACCESS & FORMATIVE RESPONSE LOOP
 * ========================================================================== */

/** All canonical scenarios (from content.ts). */
export function getCanonicalFeedbackScenarios(): FeedbackScenario[] {
  return [...CANONICAL_FEEDBACK_SCENARIOS]
}

export { getFeedbackScenarioById }

/**
 * The formative loop: grade a learner response inside a scenario and
 * return three-level feedback (task, process, self-regulation) plus the
 * misconception tag when the chosen distractor encodes one.
 *
 * Confidence handling follows the hypercorrection literature
 * (Butterfield & Metcalfe 2001): errors made with high confidence are
 * corrected more thoroughly later, so the response flags them for
 * prioritized review rather than hiding the error.
 */
export function gradeScenarioResponse(response: FeedbackResponse): {
  scenario: FeedbackScenario
  isCorrect: boolean
  misconceptionTag?: string
  feedback: { task: string; process: string; selfRegulation: string }
  hypercorrectionFlag: boolean
} {
  const scenario = getFeedbackScenarioById(response.scenarioId)
  if (!scenario) {
    throw new Error(`Unknown feedback scenario: ${response.scenarioId}`)
  }
  const option = scenario.options.find((o) => o.id === response.optionId)
  if (!option) {
    throw new Error(`Scenario ${response.scenarioId} has no option ${response.optionId}`)
  }
  const hypercorrectionFlag = !option.isCorrect && response.confidence >= 4
  return {
    scenario,
    isCorrect: option.isCorrect,
    misconceptionTag: option.misconceptionTag,
    feedback: option.feedback,
    hypercorrectionFlag,
  }
}

/**
 * Suggest feedback timing for a context, per Shute (2008): immediate for
 * procedural acquisition and difficult new tasks; delayed for transfer
 * goals and retrieval-practice sessions.
 */
export function suggestFeedbackTiming(context: {
  taskDifficulty: number
  isProcedural: boolean
  transferGoal: boolean
  isRetrievalPractice: boolean
}): { timing: FeedbackTiming; rationale: string } {
  if (context.isRetrievalPractice || context.transferGoal) {
    return {
      timing: 'delayed',
      rationale:
        'Delayed feedback preserves the retrieval benefit and supports transfer (Shute 2008).',
    }
  }
  if (context.isProcedural || context.taskDifficulty >= 4) {
    return {
      timing: 'immediate',
      rationale:
        'Immediate feedback prevents error consolidation during early procedural acquisition (Shute 2008).',
    }
  }
  return {
    timing: 'immediate',
    rationale: 'Default formative cadence: respond soon after the learner commits to an answer.',
  }
}

/* ==========================================================================
 * FSRS-6 BRIDGE
 * ========================================================================== */

/**
 * Generate FSRS-6 cards from scenarios. Each scenario yields:
 * 1. One retrieval card for the concept (stem on the front).
 * 2. One misconception card per tagged distractor ("A learner chose X —
 *    what misconception is this and how do you correct it?"), which is the
 *    feedback-literacy skill this studio trains.
 */
export function generateFeedbackFSRSCards(scenarioIds?: string[]): FeedbackCard[] {
  const scenarios = scenarioIds
    ? scenarioIds
        .map((id) => getFeedbackScenarioById(id))
        .filter((s): s is FeedbackScenario => s !== undefined)
    : CANONICAL_FEEDBACK_SCENARIOS

  const cards: FeedbackCard[] = []
  for (const scenario of scenarios) {
    const correct = scenario.options.find((o) => o.isCorrect)
    if (!correct) continue
    cards.push({
      front: `[${scenario.domain}] ${scenario.stem}`,
      back: `${correct.text}\n\nWhy: ${scenario.explanation}`,
      tags: ['feedback-studio', scenario.domain.toLowerCase(), 'concept'],
      sourceRef: `feedback-scenario:${scenario.id}`,
    })
    for (const option of scenario.options) {
      if (option.isCorrect || !option.misconceptionTag) continue
      cards.push({
        front: `A learner answered: "${option.text}" to: ${scenario.stem}\nWhat misconception does this reveal, and what three-level feedback corrects it?`,
        back: `Misconception: ${option.misconceptionTag}\nTask: ${option.feedback.task}\nProcess: ${option.feedback.process}\nSelf-regulation: ${option.feedback.selfRegulation}`,
        tags: ['feedback-studio', scenario.domain.toLowerCase(), 'misconception'],
        sourceRef: `feedback-scenario:${scenario.id}#${option.id}`,
      })
    }
  }
  return cards
}

/**
 * Map FIT attention locus to expected performance direction, the core
 * prediction of Feedback Intervention Theory (Kluger & DeNisi 1996).
 */
export function predictFITOutcome(locus: FITAttentionLocus): {
  expectedDirection: 'improvement' | 'neutral_or_decline' | 'decline_risk'
  rationale: string
} {
  switch (locus) {
    case 'task_learning':
      return {
        expectedDirection: 'improvement',
        rationale:
          'Attention on task-learning processes is where FIT predicts reliable gains (mean d ≈ 0.41).',
      }
    case 'task_motivation':
      return {
        expectedDirection: 'neutral_or_decline',
        rationale:
          'Attention on motivational gaps helps only when task strategies are already known.',
      }
    case 'meta_task_self':
      return {
        expectedDirection: 'decline_risk',
        rationale:
          'Attention on the self is where over a third of feedback interventions reduced performance.',
      }
  }
}
