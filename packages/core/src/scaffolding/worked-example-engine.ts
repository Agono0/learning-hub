/**
 * Learning HUB — Cognitive Load Theory & Worked-Example Fading Engine.
 *
 * Implements:
 * 1. Cognitive Load Theory (Sweller 1988, 2010; Paas & van Merriënboer 1994):
 *    - Intrinsic Load (IL): Element interactivity & conceptual complexity
 *    - Extraneous Load (EL): Split-attention & unguided search penalty
 *    - Germane Load (GL): Sub-goal labeling & self-explanation schema acquisition
 *    - Working Memory Capacity (WM_cap ~ 4 chunks, Cowan 2001) overload modeling
 * 2. Renkl-Atkinson 4-Stage Scaffolding Continuum (Renkl & Atkinson 2003, 2004):
 *    - Stage 1: Fully Worked Example (Expert Modeling)
 *    - Stage 2: Backward-Faded Completion (Last step omitted; Atkinson 2000 chaining)
 *    - Stage 3: Forward/Intermediate-Faded Completion (Connective lemmas omitted)
 *    - Stage 4: Independent Problem Solving with Metacognitive Scaffolding
 * 3. Self-Explanation Prompt Evaluator (Chi et al. 1989; Renkl 1997; Catrambone 1998):
 *    - Principle-based justification scoring
 *    - Sub-goal chunking verification
 * 4. Erroneous Example Crucible (Große & Renkl 2007):
 *    - Misconception taxonomy & bug repair diagnostic
 * 5. Expertise Reversal Detection & Dynamic Adaptation (Kalyuga et al. 2003)
 * 6. Multi-Domain Calibrated Problem Banks (Distributed Consensus, DP, Quantum, ML, Concurrency)
 * 7. FSRS v5 Flashcard Generation Bridge
 */

import { CALIBRATED_SCAFFOLDING_PROBLEMS } from './content'

// TD-05: the multi-domain calibrated problem bank is scenario CONTENT, not
// logic — it lives in ./content.ts so engine diffs stay about algorithms.
// Re-exported so every existing import path keeps working (the barrel does
// `export * from` this file).
export { CALIBRATED_SCAFFOLDING_PROBLEMS } from './content'

// ---------------------------------------------------------------------------
// 1. Types & Schemas
// ---------------------------------------------------------------------------

export type ScaffoldingStage = 1 | 2 | 3 | 4

export type FadingStrategy = 'backward' | 'forward' | 'adaptive'

export type MisconceptionCategory =
  | 'invariant_violation'
  | 'boundary_edge_case'
  | 'premature_optimization'
  | 'flawed_induction'
  | 'concurrency_race'
  | 'fallacious_assumption'

export type SelfExplanationPromptType =
  'principle_justification' | 'subgoal_chunking' | 'anticipation' | 'erroneous_critique'

export interface DerivationStep {
  id: string
  stepIndex: number
  subgoalLabel: string // Catrambone (1998) sub-goal chunking
  content: string // LaTeX, mathematical notation, or code snippet
  explanation: string // Theoretical justification
  governingPrinciple: string // e.g., "Pigeonhole Principle", "CAP Theorem", "Markov Property"
  isOmittedInBackwardFading?: boolean
  isOmittedInForwardFading?: boolean
  scaffoldOptions?: string[] // Multiple-choice distractors for faded step
  correctOptionIndex?: number
  clozeTemplate?: string // E.g. "Optimal substructure: dp[i][w] = max(dp[i-1][w], dp[i-1][w - wt[i]] + {{v}})"
  clozeTarget?: string
}

export interface ErroneousVariant {
  id: string
  flawedStepIndex: number
  flawedContent: string
  misconceptionCategory: MisconceptionCategory
  misconceptionDescription: string
  correctiveRepair: string
  diagnosticHint: string
}

export interface SelfExplanationPrompt {
  id: string
  promptType: SelfExplanationPromptType
  targetStepIndex: number
  promptText: string
  guidingRubric: string[]
  canonicalKeywords: string[]
  sampleExemplar: string
}

export interface WorkedExampleProblem {
  id: string
  domain:
    | 'distributed_systems'
    | 'dynamic_programming'
    | 'quantum_circuits'
    | 'machine_learning'
    | 'concurrency'
  title: string
  problemStatement: string
  prerequisites: string[]
  elementInteractivity: number // 1 to 5 scale (Sweller 2010)
  intrinsicDifficulty: number // 0.1 to 1.0
  steps: DerivationStep[]
  erroneousVariants: ErroneousVariant[]
  selfExplanationPrompts: SelfExplanationPrompt[]
}

export interface CognitiveLoadBreakdown {
  intrinsicLoad: number // 0.0 - 5.0 scale
  extraneousLoad: number // 0.0 - 5.0 scale
  germaneLoad: number // 0.0 - 5.0 scale
  totalLoad: number // Sum of IL + EL + GL
  workingMemoryCapacity: number // Standard ~4.0 chunks
  overloadProbability: number // 0.0 to 1.0 sigmoidal probability
  isOverloaded: boolean
  recommendedIntervention:
    'reduce_split_attention' | 'fade_faster' | 'add_worked_example' | 'optimal_flow'
}

export interface StepEvaluationResult {
  isCorrect: boolean
  score: number // 0.0 to 1.0
  feedback: string
  revealedExplanation: string
  hintsRemaining: number
}

export interface SelfExplanationEvaluation {
  score: number // 0.0 to 1.0
  keywordCoverage: number // Ratio of canonical keywords covered
  matchedRubricItems: string[]
  constructiveFeedback: string
  exemplarComparison: string
}

export interface FSRSSpaffoldCardExport {
  front: string
  back: string
  tags: string[]
  suggestedDifficulty: number
  suggestedStability: number
  metadata: {
    problemId: string
    stepIndex: number
    scaffoldingStage: ScaffoldingStage
    subgoalLabel: string
  }
}

// ---------------------------------------------------------------------------
// 2. Cognitive Load Theory Mathematical Models
// ---------------------------------------------------------------------------

export const WORKING_MEMORY_CAPACITY_DEFAULT = 4.0 // Cowan (2001) 4 ± 1 chunks

/**
 * Calculates Cognitive Load breakdown according to Sweller (2010) & Paas et al. (1994).
 *
 * @param elementInteractivity Element interactivity scale 1-5 (Sweller 2010)
 * @param stage Current scaffolding stage (1: Worked Example -> 4: Independent)
 * @param learnerExpertise Estimated learner ability from -2.0 (novice) to +2.0 (expert)
 * @param splitAttentionPresent Whether learner must juggle separate disconnected materials
 * @param hasSubgoalLabels Whether sub-goal chunking is active (reduces intrinsic load)
 */
export function calculateCognitiveLoad(params: {
  elementInteractivity: number
  stage: ScaffoldingStage
  learnerExpertise: number // -2.0 to +2.0
  splitAttentionPresent?: boolean
  hasSubgoalLabels?: boolean
  responseLatencyRatio?: number // latency / baseline (> 1.5 indicates hesitation)
}): CognitiveLoadBreakdown {
  const {
    elementInteractivity,
    stage,
    learnerExpertise,
    splitAttentionPresent = false,
    hasSubgoalLabels = true,
    responseLatencyRatio = 1.0,
  } = params

  // Normalized expertise: 0.0 (novice) to 1.0 (master)
  const normExpertise = Math.max(0, Math.min(1, (learnerExpertise + 2) / 4))

  // 1. Intrinsic Load (IL): Determined by element interactivity and learner's schema automation
  // Subgoal labeling (Catrambone 1998) chunks elements, lowering perceived interactivity by ~25%
  const chunkingBonus = hasSubgoalLabels ? 0.75 : 1.0
  const rawIL = elementInteractivity * 0.8 * chunkingBonus * (1.2 - 0.6 * normExpertise)
  const intrinsicLoad = Number(Math.max(0.5, Math.min(5.0, rawIL)).toFixed(2))

  // 2. Extraneous Load (EL):
  // - High in unguided problem solving (Stage 4) for novices (Sweller 1988 search penalty)
  // - Low in worked examples (Stage 1) for novices
  // - BUT high in worked examples for EXPERTS (Kalyuga 2003 Expertise Reversal Effect)
  let baseEL = 0.4
  if (splitAttentionPresent) {
    baseEL += 1.2
  }

  if (normExpertise < 0.4) {
    // Novice: Worked examples have low EL; independent problem solving has high EL
    if (stage === 1) baseEL += 0.2
    else if (stage === 2) baseEL += 0.6
    else if (stage === 3) baseEL += 1.1
    else baseEL += 1.8 // Stage 4: Means-ends search penalty
  } else if (normExpertise > 0.75) {
    // Expert: Worked examples cause redundant re-processing (Expertise Reversal)
    if (stage === 1)
      baseEL += 1.6 // Redundant worked example penalty
    else if (stage === 2) baseEL += 1.0
    else if (stage === 3) baseEL += 0.4
    else baseEL += 0.2 // Expert thrives on independent solving
  } else {
    // Intermediate learner
    if (stage === 1) baseEL += 0.6
    else if (stage === 2) baseEL += 0.4
    else if (stage === 3) baseEL += 0.5
    else baseEL += 0.9
  }

  // Hesitation penalty from latency ratio
  if (responseLatencyRatio > 1.5) {
    baseEL += Math.min(0.8, (responseLatencyRatio - 1.5) * 0.5)
  }
  const extraneousLoad = Number(Math.max(0.2, Math.min(5.0, baseEL)).toFixed(2))

  // 3. Germane Load (GL): Schema construction effort
  // Maximize when IL is moderate and EL is low, allowing cognitive budget for self-explanation
  let baseGL = 1.0
  if (hasSubgoalLabels) baseGL += 0.5
  if (stage === 2 || stage === 3) {
    // Faded completion problems stimulate active schema construction
    baseGL += 0.8
  } else if (stage === 1) {
    baseGL += 0.3
  } else {
    baseGL += 0.4
  }
  const germaneLoad = Number(Math.max(0.2, Math.min(3.0, baseGL)).toFixed(2))

  const totalLoad = Number((intrinsicLoad + extraneousLoad + germaneLoad).toFixed(2))
  const workingMemoryCapacity = WORKING_MEMORY_CAPACITY_DEFAULT

  // Sigmoidal overload probability: P = 1 / (1 + exp(-2 * (totalLoad - WM_cap)))
  const delta = totalLoad - workingMemoryCapacity
  const overloadProbability = Number((1 / (1 + Math.exp(-2.2 * delta))).toFixed(3))
  const isOverloaded = overloadProbability >= 0.55

  // Recommended intervention
  let recommendedIntervention: CognitiveLoadBreakdown['recommendedIntervention'] = 'optimal_flow'
  if (isOverloaded) {
    if (splitAttentionPresent) {
      recommendedIntervention = 'reduce_split_attention'
    } else if (normExpertise < 0.5 && stage >= 3) {
      recommendedIntervention = 'add_worked_example'
    } else if (normExpertise > 0.7 && stage <= 2) {
      recommendedIntervention = 'fade_faster'
    } else {
      recommendedIntervention = 'reduce_split_attention'
    }
  } else if (!isOverloaded && normExpertise > 0.7 && stage <= 2) {
    recommendedIntervention = 'fade_faster'
  }

  return {
    intrinsicLoad,
    extraneousLoad,
    germaneLoad,
    totalLoad,
    workingMemoryCapacity,
    overloadProbability,
    isOverloaded,
    recommendedIntervention,
  }
}

// ---------------------------------------------------------------------------
// 3. Renkl-Atkinson Scaffolding Stage Manager
// ---------------------------------------------------------------------------

/**
 * Determines which derivation steps are visible vs omitted based on scaffolding stage & strategy.
 */
export function getStepFadingStatus(params: {
  step: DerivationStep
  totalSteps: number
  stage: ScaffoldingStage
  strategy: FadingStrategy
}): {
  isOmitted: boolean
  promptType: 'read_only' | 'faded_cloze' | 'faded_choice' | 'free_generation'
} {
  const { step, totalSteps, stage, strategy } = params

  // Stage 1: Fully Worked Example (Read-only for all steps)
  if (stage === 1) {
    return { isOmitted: false, promptType: 'read_only' }
  }

  // Stage 4: Independent Problem Solving (All steps generated by learner)
  if (stage === 4) {
    return { isOmitted: true, promptType: 'free_generation' }
  }

  // Stage 2: Backward Fading (Atkinson 2000: Last step is faded, previous steps fully visible)
  if (stage === 2) {
    const isLastStep = step.stepIndex === totalSteps
    if (strategy === 'backward' || strategy === 'adaptive') {
      if (isLastStep || step.isOmittedInBackwardFading) {
        return {
          isOmitted: true,
          promptType: step.scaffoldOptions ? 'faded_choice' : 'faded_cloze',
        }
      }
      return { isOmitted: false, promptType: 'read_only' }
    }
  }

  // Stage 3: Forward / Intermediate Fading (Intermediate lemma/calculation faded)
  if (stage === 3) {
    // Intermediate step (e.g. step 2 or 3 in a 4-step proof)
    const isIntermediate = step.stepIndex > 1 && step.stepIndex < totalSteps
    if (isIntermediate || step.isOmittedInForwardFading) {
      return {
        isOmitted: true,
        promptType: step.scaffoldOptions ? 'faded_choice' : 'faded_cloze',
      }
    }
    return { isOmitted: false, promptType: 'read_only' }
  }

  return { isOmitted: false, promptType: 'read_only' }
}

// ---------------------------------------------------------------------------
// 4. Self-Explanation Prompt Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluates learner self-explanation responses using canonical keyword coverage,
 * rubric checks, and semantic principle alignment (Chi et al. 1989; Renkl 1997).
 */
export function evaluateSelfExplanation(params: {
  userExplanation: string
  prompt: SelfExplanationPrompt
}): SelfExplanationEvaluation {
  const { userExplanation, prompt } = params
  const cleanText = userExplanation.toLowerCase().trim()

  if (!cleanText || cleanText.length < 10) {
    return {
      score: 0.1,
      keywordCoverage: 0,
      matchedRubricItems: [],
      constructiveFeedback:
        'Explanation is too brief. Connect the mathematical step to its governing principle or sub-goal rationale.',
      exemplarComparison: prompt.sampleExemplar,
    }
  }

  // 1. Keyword coverage
  const canonical = prompt.canonicalKeywords.map((k) => k.toLowerCase())
  let matchedKeywords = 0
  for (const kw of canonical) {
    if (cleanText.includes(kw)) {
      matchedKeywords++
    }
  }
  const keywordCoverage =
    canonical.length > 0 ? Number((matchedKeywords / canonical.length).toFixed(2)) : 1.0

  // 2. Rubric alignment
  const matchedRubricItems: string[] = []
  for (const rubricItem of prompt.guidingRubric) {
    const rubricWords = rubricItem
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 4)

    const matches = rubricWords.filter((w) => cleanText.includes(w)).length
    if (matches >= Math.min(2, rubricWords.length)) {
      matchedRubricItems.push(rubricItem)
    }
  }

  const rubricCoverage =
    prompt.guidingRubric.length > 0
      ? matchedRubricItems.length / prompt.guidingRubric.length
      : keywordCoverage

  // Composite score: 55% keyword coverage + 45% rubric alignment
  const rawScore = keywordCoverage * 0.55 + rubricCoverage * 0.45
  const score = Number(Math.max(0.15, Math.min(1.0, rawScore)).toFixed(2))

  let constructiveFeedback = ''
  if (score >= 0.8) {
    constructiveFeedback =
      'Excellent principle-based self-explanation! You correctly identified the underlying structural invariants and sub-goal chunking.'
  } else if (score >= 0.5) {
    const missing = canonical.filter((k) => !cleanText.includes(k)).slice(0, 3)
    constructiveFeedback = `Solid conceptual intuition. Consider incorporating key terms such as: ${missing.join(', ')} to sharpen the rigor.`
  } else {
    constructiveFeedback = `Partial understanding. Make sure to articulate WHY this transition is valid according to ${prompt.guidingRubric[0] || 'the governing domain principle'}.`
  }

  return {
    score,
    keywordCoverage,
    matchedRubricItems,
    constructiveFeedback,
    exemplarComparison: prompt.sampleExemplar,
  }
}

// ---------------------------------------------------------------------------
// 5. Erroneous Example Crucible Evaluator (Große & Renkl 2007)
// ---------------------------------------------------------------------------

export interface ErroneousEvaluationResult {
  isStepIdentifiedCorrectly: boolean
  isMisconceptionIdentifiedCorrectly: boolean
  isRepairSufficient: boolean
  compositeScore: number
  diagnosticSummary: string
}

export function evaluateErroneousAttempt(params: {
  selectedStepIndex: number
  selectedMisconception: MisconceptionCategory
  learnerRepairText: string
  erroneousVariant: ErroneousVariant
}): ErroneousEvaluationResult {
  const { selectedStepIndex, selectedMisconception, learnerRepairText, erroneousVariant } = params

  const isStepIdentifiedCorrectly = selectedStepIndex === erroneousVariant.flawedStepIndex
  const isMisconceptionIdentifiedCorrectly =
    selectedMisconception === erroneousVariant.misconceptionCategory

  const repairTokens = erroneousVariant.correctiveRepair
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 4)

  const userClean = learnerRepairText.toLowerCase()
  const matchedTokens = repairTokens.filter((token) => userClean.includes(token)).length
  const isRepairSufficient =
    userClean.length >= 15 && matchedTokens >= Math.min(2, Math.floor(repairTokens.length * 0.4))

  let score = 0
  if (isStepIdentifiedCorrectly) score += 0.4
  if (isMisconceptionIdentifiedCorrectly) score += 0.3
  if (isRepairSufficient) score += 0.3

  let diagnosticSummary = ''
  if (score === 1.0) {
    diagnosticSummary =
      'Flawless autopsy! You pinpointed the flawed step, classified the exact misconception, and formulated the mathematically sound repair.'
  } else if (isStepIdentifiedCorrectly) {
    diagnosticSummary = `Correct flawed step detected (Step ${erroneousVariant.flawedStepIndex}), but review the root misconception category: ${erroneousVariant.misconceptionDescription}`
  } else {
    diagnosticSummary = `Incorrect step identified. The error lies in Step ${erroneousVariant.flawedStepIndex}: ${erroneousVariant.diagnosticHint}`
  }

  return {
    isStepIdentifiedCorrectly,
    isMisconceptionIdentifiedCorrectly,
    isRepairSufficient,
    compositeScore: Number(score.toFixed(2)),
    diagnosticSummary,
  }
}

// ---------------------------------------------------------------------------
// 6. FSRS Spaced Repetition Card Bridge
// ---------------------------------------------------------------------------

/**
 * Converts a faded derivation step or erroneous critique into an FSRS v5 spaced-repetition card.
 */
export function exportStepToFSRS(params: {
  problem: WorkedExampleProblem
  stepIndex: number
  stage: ScaffoldingStage
}): FSRSSpaffoldCardExport {
  const { problem, stepIndex, stage } = params
  const step = problem.steps.find((s) => s.stepIndex === stepIndex) || problem.steps[0]!

  let front = `**[${problem.domain.toUpperCase()}] ${problem.title}**\n\n`
  front += `*Sub-goal: ${step.subgoalLabel}*\n\n`
  front += `**Problem Statement:** ${problem.problemStatement}\n\n`

  // Contextual previous steps
  const priorSteps = problem.steps.filter((s) => s.stepIndex < stepIndex)
  if (priorSteps.length > 0) {
    front += `**Established Derivation Steps:**\n`
    for (const prior of priorSteps) {
      front += `> Step ${prior.stepIndex} (${prior.subgoalLabel}): \`${prior.content}\`\n`
    }
    front += `\n`
  }

  front += `**Challenge (Step ${step.stepIndex}):** What is the next logical derivation step and its governing theoretical principle?`

  let back = `**Correct Derivation Step:**\n\`\`\`\n${step.content}\n\`\`\`\n\n`
  back += `**Governing Principle:** *${step.governingPrinciple}*\n\n`
  back += `**Rationale:** ${step.explanation}`

  // Suggested initial FSRS parameters based on element interactivity and stage
  const suggestedDifficulty = Math.min(
    10,
    Math.max(1, Math.round(problem.elementInteractivity * 1.8)),
  )
  const suggestedStability = stage === 4 ? 4.0 : 2.5

  return {
    front,
    back,
    tags: ['scaffolding', 'worked-example', problem.domain, `stage-${stage}`],
    suggestedDifficulty,
    suggestedStability,
    metadata: {
      problemId: problem.id,
      stepIndex: step.stepIndex,
      scaffoldingStage: stage,
      subgoalLabel: step.subgoalLabel,
    },
  }
}

// ---------------------------------------------------------------------------
// 7. Multi-Domain Calibrated Problem Banks
// ---------------------------------------------------------------------------
// Corpus (CALIBRATED_SCAFFOLDING_PROBLEMS) moved verbatim to ./content.ts
// (TD-05 — content, not logic); re-exported at the top of this file so import
// paths are unchanged.

// ---------------------------------------------------------------------------
// 8. Interactive Worked Example Session State Machine
// ---------------------------------------------------------------------------

export interface ScaffoldingSessionState {
  problemId: string
  stage: ScaffoldingStage
  strategy: FadingStrategy
  learnerExpertise: number
  completedStepIds: string[]
  currentStepIndex: number
  cognitiveLoad: CognitiveLoadBreakdown
  hintsUsed: number
  selfExplanationScores: Record<string, number>
  isCompleted: boolean
  totalAttempts: number
  successfulAttempts: number
}

export class WorkedExampleSession {
  private problem: WorkedExampleProblem
  private state: ScaffoldingSessionState

  constructor(problemId: string, initialStage: ScaffoldingStage = 1, learnerExpertise = 0.0) {
    const prob = CALIBRATED_SCAFFOLDING_PROBLEMS[problemId]
    if (!prob) {
      throw new Error(`Scaffolding problem not found: ${problemId}`)
    }
    this.problem = prob

    const load = calculateCognitiveLoad({
      elementInteractivity: prob.elementInteractivity,
      stage: initialStage,
      learnerExpertise,
    })

    this.state = {
      problemId,
      stage: initialStage,
      strategy: 'backward',
      learnerExpertise,
      completedStepIds: [],
      currentStepIndex: 1,
      cognitiveLoad: load,
      hintsUsed: 0,
      selfExplanationScores: {},
      isCompleted: false,
      totalAttempts: 0,
      successfulAttempts: 0,
    }
  }

  public getState(): Readonly<ScaffoldingSessionState> {
    return { ...this.state }
  }

  public getProblem(): Readonly<WorkedExampleProblem> {
    return this.problem
  }

  public setStage(stage: ScaffoldingStage): void {
    this.state.stage = stage
    this.updateCognitiveLoad()
  }

  public setStrategy(strategy: FadingStrategy): void {
    this.state.strategy = strategy
  }

  public getCurrentStep(): DerivationStep | undefined {
    return this.problem.steps.find((s) => s.stepIndex === this.state.currentStepIndex)
  }

  public evaluateCurrentStepAnswer(userAnswer: string): StepEvaluationResult {
    const step = this.getCurrentStep()
    if (!step) {
      return {
        isCorrect: false,
        score: 0,
        feedback: 'No active derivation step found.',
        revealedExplanation: '',
        hintsRemaining: 0,
      }
    }

    this.state.totalAttempts++
    const cleanUser = userAnswer.trim().toLowerCase()

    let isCorrect = false
    if (step.correctOptionIndex !== undefined && step.scaffoldOptions) {
      // Multiple-choice mode
      const selectedIndex = parseInt(userAnswer, 10)
      isCorrect = selectedIndex === step.correctOptionIndex
    } else if (step.clozeTarget) {
      // Cloze completion mode
      isCorrect = cleanUser === step.clozeTarget.toLowerCase().trim()
    } else {
      // Free generation / text matching
      isCorrect =
        cleanUser.length > 5 &&
        (step.content.toLowerCase().includes(cleanUser) ||
          cleanUser.includes(step.content.toLowerCase()))
    }

    if (isCorrect) {
      this.state.successfulAttempts++
      if (!this.state.completedStepIds.includes(step.id)) {
        this.state.completedStepIds.push(step.id)
      }

      // Check if all steps done
      if (this.state.currentStepIndex >= this.problem.steps.length) {
        this.state.isCompleted = true
        // Expertise adaptation: if solved in Stage 2/3 with 100% accuracy, boost expertise
        this.state.learnerExpertise = Math.min(2.0, this.state.learnerExpertise + 0.3)
      } else {
        this.state.currentStepIndex++
      }

      this.updateCognitiveLoad()

      return {
        isCorrect: true,
        score: 1.0,
        feedback: `Correct! ${step.governingPrinciple} applied successfully.`,
        revealedExplanation: step.explanation,
        hintsRemaining: 2 - this.state.hintsUsed,
      }
    }

    this.updateCognitiveLoad(1.8) // High hesitation penalty
    return {
      isCorrect: false,
      score: 0.0,
      feedback: `Incorrect step formulation. Review: ${step.subgoalLabel}.`,
      revealedExplanation: '',
      hintsRemaining: Math.max(0, 2 - this.state.hintsUsed),
    }
  }

  public useHint(): string {
    this.state.hintsUsed++
    this.updateCognitiveLoad(1.4)
    const step = this.getCurrentStep()
    if (!step) return 'No active step.'
    return `Hint for Step ${step.stepIndex} (${step.subgoalLabel}): Recall that ${step.governingPrinciple} requires preserving underlying invariants.`
  }

  public recordSelfExplanationScore(promptId: string, score: number): void {
    this.state.selfExplanationScores[promptId] = score
    if (score >= 0.75) {
      // High self-explanation activates germane load
      this.state.learnerExpertise = Math.min(2.0, this.state.learnerExpertise + 0.15)
    }
    this.updateCognitiveLoad()
  }

  private updateCognitiveLoad(latencyRatio = 1.0): void {
    this.state.cognitiveLoad = calculateCognitiveLoad({
      elementInteractivity: this.problem.elementInteractivity,
      stage: this.state.stage,
      learnerExpertise: this.state.learnerExpertise,
      hasSubgoalLabels: true,
      responseLatencyRatio: latencyRatio,
    })
  }
}
