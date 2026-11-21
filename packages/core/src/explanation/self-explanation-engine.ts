/**
 * @file self-explanation-engine.ts
 * @module @learning-hub/core/explanation
 * @description Generative Self-Explanation & Schema Inversion Engine.
 *
 * Grounded in:
 * 1. Michelene T. H. Chi et al. (1989) "Self-Explanations: How Students Study and Use Examples in Learning to Solve Problems"
 *    - Principle-based justifications vs superficial paraphrases.
 *    - Goal-operator links & coherence-building inferences.
 * 2. Vincent Aleven & Kenneth R. Koedinger (2002) "An Effective Metacognitive Strategy: Learning by Doing and Explaining with a Computer-Based Cognitive Tutor"
 *    - Rule-naming accuracy: explicitly articulating the governing axiom, theorem, or invariant.
 * 3. Alexander Renkl (2002) "Worked-out examples: instructional explanations, self-explanations, and learning"
 *    - Schema inversion & constraint boundary testing: "What if condition X did not hold? What would fail?"
 * 4. FSRS Spaced Repetition Stability Scaling based on Justification Depth.
 */

import { z } from 'zod'

// TD-05: scenario corpora (content, not logic) live in './content'.
import { CALIBRATED_EXPLANATION_PROBLEMS } from './content'

// ---------------------------------------------------------------------------
// 1. Types & Zod Schemas
// ---------------------------------------------------------------------------

export const justificationTypeEnum = z.enum([
  'principle_based', // Deep: explicitly articulates domain axiom, invariant, or causal mechanism
  'goal_operator', // Intermediate: describes mechanistic sub-goal ("The goal is to cancel out term X...")
  'coherence_building', // Intermediate: connects current step to antecedent lemmas or global context
  'superficial_paraphrase', // Shallow: superficial restatement of mathematical text with zero insight
])
export type JustificationType = z.infer<typeof justificationTypeEnum>

export const ruleCategoryEnum = z.enum(['axiom', 'theorem', 'definition', 'lemma', 'invariant'])
export type RuleCategory = z.infer<typeof ruleCategoryEnum>

export const inversionViolationEnum = z.enum([
  'precondition_failure',
  'soundness_breach',
  'completeness_omission',
  'concurrency_race',
  'divergence_instability',
])
export type InversionViolation = z.infer<typeof inversionViolationEnum>

export interface InversionOption {
  id: string
  text: string
  isCorrect: boolean
  rationale: string
}

export interface InversionChallenge {
  counterfactualPremise: string // e.g. "Suppose the logs are accepted with simple majority without term leadership check..."
  violationType: InversionViolation
  failureConsequence: string
  diagnosticPrompt: string
  options: InversionOption[]
}

export interface DerivationStepExplanation {
  stepId: string
  stepNumber: number
  claimOrStatement: string
  mathematicalNotation: string
  governingRuleName: string
  ruleCategory: RuleCategory
  canonicalPrincipleJustification: string
  goalOperatorPurpose: string
  keyMechanisticConcepts: string[]
  distractorRules: string[]
  inversionChallenge: InversionChallenge
}

export interface SelfExplanationDerivationProblem {
  id: string
  title: string
  domain: 'distributed_systems' | 'information_theory' | 'deep_learning' | 'cryptography'
  theoremStatement: string
  summary: string
  steps: DerivationStepExplanation[]
}

export interface ExplanationEvaluationTelemetry {
  stepId: string
  stepNumber: number
  justificationType: JustificationType
  justificationDepthScore: number // 0 to 100
  ruleNamingAccuracy: boolean
  inversionMastery: boolean
  mechanisticKeywordCoverage: number // 0 to 1.0
  similarityScore: number // 0 to 1.0
  retentionPotentiationMultiplier: number // 1.25x to 2.40x
  feedbackMessage: string
  identifiedDeficiencies: string[]
}

export interface DerivationSessionState {
  currentProblemId: string
  currentStepIndex: number
  selectedRule: string | null
  userJustificationText: string
  selectedInversionOptionId: string | null
  isStepEvaluated: boolean
  lastTelemetry: ExplanationEvaluationTelemetry | null
  stepHistory: Record<string, ExplanationEvaluationTelemetry>
  completedProblemIds: string[]
}

// ---------------------------------------------------------------------------
// 2. Cognitive Analysis & Scoring Algorithms
// ---------------------------------------------------------------------------

const CAUSAL_CONNECTIVE_TOKENS = [
  'because',
  'since',
  'therefore',
  'ensures',
  'implies',
  'guarantees',
  'precondition',
  'invariant',
  'consequently',
  'satisfies',
  'by definition',
  'necessary',
  'sufficient',
  'holds',
  'so that',
  'in order to',
  'to ensure',
  'the goal is',
  'purpose',
]

/**
 * Computes token similarity between user text and canonical explanation.
 */
export function computeSemanticSimilarity(userText: string, canonicalText: string): number {
  const normUser = userText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2)

  const normCanon = canonicalText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2)

  if (normUser.length === 0 || normCanon.length === 0) return 0

  const userSet = new Set(normUser)
  const canonSet = new Set(normCanon)

  let intersection = 0
  for (const token of userSet) {
    if (canonSet.has(token)) intersection++
  }

  const union = new Set([...userSet, ...canonSet]).size
  return union === 0 ? 0 : Number((intersection / union).toFixed(3))
}

/**
 * Evaluates the depth of a learner's self-explanation according to Chi et al. (1989) and Aleven & Koedinger (2002).
 */
export function evaluateSelfExplanationAttempt(params: {
  step: DerivationStepExplanation
  selectedRule: string | null
  userJustification: string
  selectedInversionOptionId: string | null
}): ExplanationEvaluationTelemetry {
  const { step, selectedRule, userJustification, selectedInversionOptionId } = params
  const deficiencies: string[] = []

  // 1. Rule-Naming Accuracy (Aleven & Koedinger 2002)
  const ruleNamingAccuracy = selectedRule === step.governingRuleName
  if (!ruleNamingAccuracy) {
    deficiencies.push(
      `Rule Naming: Expected "${step.governingRuleName}" (${step.ruleCategory}), but selected "${selectedRule ?? 'None'}".`,
    )
  }

  // 2. Mechanistic Keyword Coverage (flexible token-level matching)
  const lowerUser = userJustification.toLowerCase()
  let matchedKeywords = 0
  for (const kw of step.keyMechanisticConcepts) {
    const tokens = kw
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)
    const allTokensPresent = tokens.length > 0 && tokens.every((t) => lowerUser.includes(t))
    if (allTokensPresent || lowerUser.includes(kw.toLowerCase())) {
      matchedKeywords++
    }
  }
  const mechanisticKeywordCoverage =
    step.keyMechanisticConcepts.length > 0
      ? Number((matchedKeywords / step.keyMechanisticConcepts.length).toFixed(2))
      : 1.0

  if (mechanisticKeywordCoverage < 0.5) {
    deficiencies.push(
      `Principle Grounding: Missed core mechanistic concepts (${step.keyMechanisticConcepts.slice(0, 3).join(', ')}).`,
    )
  }

  // 3. Causal Connectives Count
  let causalCount = 0
  for (const conn of CAUSAL_CONNECTIVE_TOKENS) {
    if (lowerUser.includes(conn)) causalCount++
  }

  // 4. Semantic Similarity
  const similarityScore = computeSemanticSimilarity(
    userJustification,
    step.canonicalPrincipleJustification,
  )

  // 5. Schema Inversion Mastery (Renkl 2002)
  const chosenInversion = step.inversionChallenge.options.find(
    (opt) => opt.id === selectedInversionOptionId,
  )
  const inversionMastery = Boolean(chosenInversion?.isCorrect)
  if (!inversionMastery) {
    deficiencies.push('Schema Inversion: Failed boundary constraint counterfactual analysis.')
  }

  // 6. Justification Depth Score (0 to 100)
  const ruleBonus = ruleNamingAccuracy ? 25 : 0
  const kwScore = mechanisticKeywordCoverage * 35
  const simScore = Math.min(25, similarityScore * 50)
  const causalBonus = Math.min(15, causalCount * 5)
  const goalOperatorBonus =
    lowerUser.includes('goal') || lowerUser.includes('to ensure') || lowerUser.includes('so that')
      ? 10
      : 0

  const justificationDepthScore = Math.min(
    100,
    Math.round(ruleBonus + kwScore + simScore + causalBonus + goalOperatorBonus),
  )

  // 7. Chi Justification Classification
  let justificationType: JustificationType = 'superficial_paraphrase'
  if (justificationDepthScore >= 75) {
    justificationType = 'principle_based'
  } else if (justificationDepthScore >= 50) {
    justificationType = 'goal_operator'
  } else if (justificationDepthScore >= 35) {
    justificationType = 'coherence_building'
  }

  // 8. Retention Potentiation Multiplier (Chi 1989 / FSRS boost)
  let retentionMultiplier = 1.0
  if (justificationType === 'principle_based') {
    retentionMultiplier = inversionMastery ? 2.35 : 2.05
  } else if (justificationType === 'goal_operator') {
    retentionMultiplier = inversionMastery ? 1.75 : 1.55
  } else if (justificationType === 'coherence_building') {
    retentionMultiplier = inversionMastery ? 1.45 : 1.3
  } else {
    retentionMultiplier = 1.15
  }

  // Feedback Message
  let feedbackMessage = ''
  if (justificationType === 'principle_based' && inversionMastery) {
    feedbackMessage =
      'Exemplary Self-Explanation! You clearly articulated the governing invariant and accurately diagnosed the counterfactual failure point.'
  } else if (justificationType === 'principle_based') {
    feedbackMessage =
      'Robust Principle Justification! However, review the counterfactual inversion to reinforce boundary preconditions.'
  } else if (justificationType === 'goal_operator') {
    feedbackMessage =
      'Good Operational Understanding. You explained the immediate sub-goal, but grounding it in the formal axiom will deepen long-term transfer.'
  } else {
    feedbackMessage =
      'Superficial paraphrase detected. Ground your explanation in why this step is mathematically necessary, not just what it states.'
  }

  return {
    stepId: step.stepId,
    stepNumber: step.stepNumber,
    justificationType,
    justificationDepthScore,
    ruleNamingAccuracy,
    inversionMastery,
    mechanisticKeywordCoverage,
    similarityScore,
    retentionPotentiationMultiplier: Number(retentionMultiplier.toFixed(2)),
    feedbackMessage,
    identifiedDeficiencies: deficiencies,
  }
}

// ---------------------------------------------------------------------------
// 3. Calibrated Problem Bank: Multi-Disciplinary Formal Proofs & Derivations
// ---------------------------------------------------------------------------

// TD-05: the calibrated problem bank lives in './content' (content, not logic).
export { CALIBRATED_EXPLANATION_PROBLEMS } from './content'

// ---------------------------------------------------------------------------
// 4. Interactive Self-Explanation Session State Machine
// ---------------------------------------------------------------------------

export class SelfExplanationSession {
  private state: DerivationSessionState
  private problems: Record<string, SelfExplanationDerivationProblem>

  constructor(customProblems?: Record<string, SelfExplanationDerivationProblem>) {
    this.problems = customProblems ?? CALIBRATED_EXPLANATION_PROBLEMS
    const firstId = Object.keys(this.problems)[0] ?? ''

    this.state = {
      currentProblemId: firstId,
      currentStepIndex: 0,
      selectedRule: null,
      userJustificationText: '',
      selectedInversionOptionId: null,
      isStepEvaluated: false,
      lastTelemetry: null,
      stepHistory: {},
      completedProblemIds: [],
    }
  }

  public getState(): Readonly<DerivationSessionState> {
    return { ...this.state }
  }

  public getCurrentProblem(): SelfExplanationDerivationProblem | null {
    return this.problems[this.state.currentProblemId] ?? null
  }

  public getCurrentStep(): DerivationStepExplanation | null {
    const prob = this.getCurrentProblem()
    if (!prob || !prob.steps[this.state.currentStepIndex]) return null
    return prob.steps[this.state.currentStepIndex]!
  }

  public selectProblem(problemId: string): void {
    if (!this.problems[problemId]) return
    this.state.currentProblemId = problemId
    this.state.currentStepIndex = 0
    this.state.selectedRule = null
    this.state.userJustificationText = ''
    this.state.selectedInversionOptionId = null
    this.state.isStepEvaluated = false
    this.state.lastTelemetry = null
  }

  public selectStep(index: number): void {
    const prob = this.getCurrentProblem()
    if (!prob || index < 0 || index >= prob.steps.length) return
    this.state.currentStepIndex = index
    this.state.selectedRule = null
    this.state.userJustificationText = ''
    this.state.selectedInversionOptionId = null
    this.state.isStepEvaluated = false
    this.state.lastTelemetry = null
  }

  public setRule(ruleName: string | null): void {
    this.state.selectedRule = ruleName
  }

  public setJustificationText(text: string): void {
    this.state.userJustificationText = text
  }

  public setInversionOption(optionId: string | null): void {
    this.state.selectedInversionOptionId = optionId
  }

  public evaluateCurrentStep(): ExplanationEvaluationTelemetry {
    const step = this.getCurrentStep()
    if (!step) {
      throw new Error('No active derivation step available to evaluate')
    }

    const telemetry = evaluateSelfExplanationAttempt({
      step,
      selectedRule: this.state.selectedRule,
      userJustification: this.state.userJustificationText,
      selectedInversionOptionId: this.state.selectedInversionOptionId,
    })

    this.state.lastTelemetry = telemetry
    this.state.isStepEvaluated = true
    this.state.stepHistory[step.stepId] = telemetry

    // Check if entire problem is complete
    const prob = this.getCurrentProblem()
    if (prob) {
      const allStepsDone = prob.steps.every((s) => this.state.stepHistory[s.stepId])
      if (allStepsDone && !this.state.completedProblemIds.includes(prob.id)) {
        this.state.completedProblemIds.push(prob.id)
      }
    }

    return telemetry
  }

  public advanceToNextStep(): boolean {
    const prob = this.getCurrentProblem()
    if (!prob) return false
    if (this.state.currentStepIndex < prob.steps.length - 1) {
      this.selectStep(this.state.currentStepIndex + 1)
      return true
    }
    return false
  }
}

// ---------------------------------------------------------------------------
// 5. FSRS Flashcard Generation Bridge
// ---------------------------------------------------------------------------

export interface FSRSSelfExplanationCard {
  id: string
  front: string
  back: string
  tags: string[]
  suggestedInitialStability: number
  suggestedInitialDifficulty: number
  metadata: {
    problemId: string
    stepId: string
    justificationType: JustificationType
    justificationDepthScore: number
    retentionMultiplier: number
  }
}

export function exportSelfExplanationToFSRSCards(
  session: SelfExplanationSession,
): FSRSSelfExplanationCard[] {
  const cards: FSRSSelfExplanationCard[] = []
  const state = session.getState()
  const problem = session.getCurrentProblem()
  if (!problem) return cards

  for (const step of problem.steps) {
    const telemetry = state.stepHistory[step.stepId]
    if (!telemetry) continue

    const baseStability = 2.8
    const scaledStability = Number(
      (baseStability * telemetry.retentionPotentiationMultiplier).toFixed(1),
    )

    // 1. Rule-Naming & Principle Justification Card
    cards.push({
      id: `card_se_rule_${problem.id}_${step.stepId}`,
      front: `[Derivation Step ${step.stepNumber}: ${problem.title}]\n\n**Statement:** ${step.claimOrStatement}\n\n$$\n${step.mathematicalNotation}\n$$\n\n*Question:* What governing principle or invariant explains why this step holds?`,
      back: `**Governing Rule:** ${step.governingRuleName} (${step.ruleCategory.toUpperCase()})\n\n**Principle Justification:**\n${step.canonicalPrincipleJustification}\n\n**Sub-Goal Purpose:**\n${step.goalOperatorPurpose}\n\n**Justification Depth:** ${telemetry.justificationDepthScore}/100 (${telemetry.justificationType.replace('_', ' ').toUpperCase()})`,
      tags: ['self-explanation', 'derivation', problem.domain, step.ruleCategory],
      suggestedInitialStability: scaledStability,
      suggestedInitialDifficulty: 5.2,
      metadata: {
        problemId: problem.id,
        stepId: step.stepId,
        justificationType: telemetry.justificationType,
        justificationDepthScore: telemetry.justificationDepthScore,
        retentionMultiplier: telemetry.retentionPotentiationMultiplier,
      },
    })

    // 2. Schema Inversion & Boundary Card
    cards.push({
      id: `card_se_inversion_${problem.id}_${step.stepId}`,
      front: `[Schema Inversion / Boundary Test: ${problem.title}]\n\n**Counterfactual Premise:**\n${step.inversionChallenge.counterfactualPremise}\n\n*Diagnostic Question:* ${step.inversionChallenge.diagnosticPrompt}`,
      back: `**Failure Consequence:**\n${step.inversionChallenge.failureConsequence}\n\n**Violation Category:** ${step.inversionChallenge.violationType.replace('_', ' ').toUpperCase()}\n\n**Required Invariant:** ${step.governingRuleName}`,
      tags: ['schema-inversion', 'boundary-condition', problem.domain],
      suggestedInitialStability: Number((scaledStability * 1.1).toFixed(1)),
      suggestedInitialDifficulty: 5.5,
      metadata: {
        problemId: problem.id,
        stepId: step.stepId,
        justificationType: telemetry.justificationType,
        justificationDepthScore: telemetry.justificationDepthScore,
        retentionMultiplier: telemetry.retentionPotentiationMultiplier,
      },
    })
  }

  return cards
}
