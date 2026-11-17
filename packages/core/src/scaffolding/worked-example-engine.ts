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

export const CALIBRATED_SCAFFOLDING_PROBLEMS: Record<string, WorkedExampleProblem> = {
  raft_leader_election: {
    id: 'raft_leader_election',
    domain: 'distributed_systems',
    title: 'Raft Leader Election Safety & Log Matching Invariant Proof',
    problemStatement:
      'Prove that in the Raft consensus protocol, if a leader has committed an entry at a given index and term, no future leader in any higher term can commit a different entry at the identical index (Leader Completeness Property).',
    prerequisites: ['State Machine Replication', 'RPC Heartbeats', 'Quorum Overlap (pigeonhole)'],
    elementInteractivity: 4,
    intrinsicDifficulty: 0.72,
    steps: [
      {
        id: 'r_step_1',
        stepIndex: 1,
        subgoalLabel: 'Establish Quorum Intersection Invariant',
        content: 'Quorum(Commit) \\cap Quorum(Voters) \\neq \\emptyset',
        explanation:
          'In a cluster of N nodes, any committed entry requires acknowledgement from a majority cluster quorum Q_c (\\lfloor N/2 \\rfloor + 1). Any new leader election in term T > T_c must also assemble a majority quorum Q_v. By the Pigeonhole Principle, Q_c \\cap Q_v \\ge 1, ensuring at least one voter V participated in both.',
        governingPrinciple: 'Pigeonhole Principle & Majority Quorum Intersection',
      },
      {
        id: 'r_step_2',
        stepIndex: 2,
        subgoalLabel: 'Apply Raft RequestVote Log Up-to-Date Restriction',
        content:
          'Candidate.LastLogTerm > V.LastLogTerm \\lor (Candidate.LastLogTerm == V.LastLogTerm \\land Candidate.LastLogIndex \\ge V.LastLogIndex)',
        explanation:
          'Raft restricts voter V from granting its vote unless the candidate’s log is at least as up-to-date as V’s own log. Because node V belongs to Q_c, node V already holds the committed entry from term T_c.',
        governingPrinciple: 'Raft RequestVote Voting Rule (Section 5.4.1)',
        isOmittedInForwardFading: true,
        scaffoldOptions: [
          'Candidate.LastLogTerm > V.LastLogTerm \\lor (Candidate.LastLogTerm == V.LastLogTerm \\land Candidate.LastLogIndex \\ge V.LastLogIndex)',
          'Candidate.CommitIndex \\ge V.CommitIndex \\land Candidate.LeaderLeaseValid == true',
          'Candidate.Term > V.Term \\land Candidate.HeartbeatRTT < 50ms',
          'Candidate.LogHash == SHA256(V.LogPrefix)',
        ],
        correctOptionIndex: 0,
      },
      {
        id: 'r_step_3',
        stepIndex: 3,
        subgoalLabel: 'Perform Mathematical Induction on Future Terms',
        content:
          'Base: T = T_c + 1. Voter V has entry at index k. Candidate must contain entry k to obtain V’s vote. Inductive Step: Assume true for all terms < T. A candidate winning term T receives vote from V_i \\in Q_c, propagating entry k.',
        explanation:
          'By strong induction on terms, any candidate that wins an election in any subsequent term T > T_c must have its log compared against member V. Because V contains entry k with term T_c, the candidate cannot be more up-to-date unless it also contains entry k.',
        governingPrinciple:
          'Principle of Strong Mathematical Induction over Discrete Term Intervals',
        isOmittedInBackwardFading: true,
        clozeTemplate:
          'Candidate must contain entry at index {{target}} to receive the vote of witness node V \\in Q_c \\cap Q_v.',
        clozeTarget: 'k',
      },
      {
        id: 'r_step_4',
        stepIndex: 4,
        subgoalLabel: 'Conclude Log Invariant & State Machine Safety',
        content: '\\forall T > T_c, \\; Entry(Leader_T, k) = Entry(Leader_{T_c}, k)',
        explanation:
          'Since future leaders are guaranteed to possess entry k, and leaders never overwrite or delete their own log entries (Append-Only Leader property), the committed entry is immutable across all future terms and state machines execute identical commands in identical sequence.',
        governingPrinciple: 'State Machine Safety Property (Ongaro & Ousterhout 2014)',
      },
    ],
    erroneousVariants: [
      {
        id: 'raft_err_1',
        flawedStepIndex: 2,
        flawedContent:
          'Candidate receives votes from any N/2 nodes based solely on term number, ignoring log index comparisons.',
        misconceptionCategory: 'invariant_violation',
        misconceptionDescription:
          'Ignoring log up-to-date check violates Leader Completeness, allowing a stale node to overwrite committed log records.',
        correctiveRepair:
          'Enforce RequestVote log up-to-date comparison: candidate must have higher term or equal term with index >= voter.',
        diagnosticHint:
          'Without comparing log term and length, a partitioned node that missed commits could get elected and overwrite committed entries.',
      },
    ],
    selfExplanationPrompts: [
      {
        id: 'raft_prompt_1',
        promptType: 'principle_justification',
        targetStepIndex: 1,
        promptText:
          'Why does the Pigeonhole Principle guarantee that at least one node in the election quorum knows about every committed entry?',
        guidingRubric: [
          'Must mention majority quorum size (N/2 + 1)',
          'Must mention intersection of two majorities cannot be empty',
          'Must link intersection node to containing the committed entry',
        ],
        canonicalKeywords: [
          'majority',
          'quorum',
          'intersection',
          'pigeonhole',
          'empty',
          'committed',
        ],
        sampleExemplar:
          'Because any commit quorum requires (N/2 + 1) nodes and any election quorum requires (N/2 + 1) nodes, their sum is N + 2 > N. By the Pigeonhole Principle, the intersection cannot be empty and must contain at least one node that witnessed and stored the commit.',
      },
    ],
  },

  knapsack_optimal_substructure: {
    id: 'knapsack_optimal_substructure',
    domain: 'dynamic_programming',
    title: '0/1 Knapsack Optimal Substructure & Bellman Recurrence Proof',
    problemStatement:
      'Prove that the 0/1 Knapsack problem exhibits optimal substructure: any optimal subset of items for capacity W either excludes item i (matching the optimal solution for capacity W using items 1..i-1) or includes item i (matching item i’s value plus the optimal solution for remaining capacity W - w_i using items 1..i-1).',
    prerequisites: [
      'Bellman Principle of Optimality',
      'Proof by Contradiction / Cut-and-Paste argument',
    ],
    elementInteractivity: 3,
    intrinsicDifficulty: 0.65,
    steps: [
      {
        id: 'ks_step_1',
        stepIndex: 1,
        subgoalLabel: 'Define Subproblem State Space Representation',
        content:
          'Let \\; dp[i][w] \\; \\text{denote the maximum achievable value from items} \\; 1 \\dots i \\; \\text{with capacity constraint} \\; w.',
        explanation:
          'Decompose the global optimization problem into a 2-dimensional discrete grid of subproblems parameterized by item prefix index i \\in [0, n] and remaining integer capacity w \\in [0, W].',
        governingPrinciple: 'Dynamic Programming State Decomposition (Bellman 1957)',
      },
      {
        id: 'ks_step_2',
        stepIndex: 2,
        subgoalLabel: 'Formulate Mutually Exclusive Binary Choice Partition',
        content: 'S^*(i, w) \\in \\{ S^*(i-1, w), \\; S^*(i-1, w - w_i) \\cup \\{i\\} \\}',
        explanation:
          'In an optimal solution S^* for items 1..i and capacity w, item i is either excluded (yielding total weight \\le w from items 1..i-1) or included (consuming w_i capacity and leaving w - w_i for items 1..i-1).',
        governingPrinciple: 'Law of the Excluded Middle & Subset Partitioning',
        isOmittedInForwardFading: true,
        scaffoldOptions: [
          'S^*(i, w) \\in \\{ S^*(i-1, w), \\; S^*(i-1, w - w_i) \\cup \\{i\\} \\}',
          'S^*(i, w) = \\bigcup_{k=1}^i S^*(k, w / k)',
          'S^*(i, w) = S^*(i-1, w) \\cap S^*(i-1, w_i)',
          'S^*(i, w) = \\max_{k} \\{ S^*(k, w - k) \\}',
        ],
        correctOptionIndex: 0,
      },
      {
        id: 'ks_step_3',
        stepIndex: 3,
        subgoalLabel: 'Prove Optimal Substructure via Cut-and-Paste Contradiction',
        content:
          "Assume \\; \\exists S' \\; \\text{for} \\; (i-1, w - w_i) \\; \\text{with} \\; V(S') > V(S^* \\setminus \\{i\\}). \\; \\text{Then} \\; V(S' \\cup \\{i\\}) > V(S^*), \\; \\text{contradicting optimality of} \\; S^*.",
        explanation:
          "If the remaining items in S^* were not an optimal solution for subproblem (i-1, w - w_i), we could substitute a superior subproblem solution S', increasing the total value without exceeding capacity w, contradicting the assumption that S^* was optimal.",
        governingPrinciple: 'Cut-and-Paste Argument (Proof by Contradiction)',
        isOmittedInBackwardFading: true,
        clozeTemplate:
          "Substituting superior subset S' yields total value V(S' \\cup \\{i\\}) > V(S^*), contradicting {{contradiction_target}}.",
        clozeTarget: 'optimality of S*',
      },
      {
        id: 'ks_step_4',
        stepIndex: 4,
        subgoalLabel: 'Establish Final Bellman Dynamic Programming Recurrence',
        content:
          'dp[i][w] = \\begin{cases} dp[i-1][w] & \\text{if } w_i > w \\\\ \\max(dp[i-1][w], \\; dp[i-1][w - w_i] + v_i) & \\text{if } w_i \\le w \\end{cases}',
        explanation:
          'The optimal value is the exact maximum over the two exhaustive choices, satisfying the Principle of Optimality and enabling pseudo-polynomial time computation in O(nW) operations.',
        governingPrinciple: 'Bellman Recurrence Relation for 0/1 Knapsack',
      },
    ],
    erroneousVariants: [
      {
        id: 'ks_err_1',
        flawedStepIndex: 4,
        flawedContent: 'dp[i][w] = max(dp[i][w], dp[i][w - w_i] + v_i) for 0/1 Knapsack',
        misconceptionCategory: 'invariant_violation',
        misconceptionDescription:
          'Referencing dp[i] on the right-hand side allows unbounded item reuse, transforming 0/1 knapsack into unbounded knapsack.',
        correctiveRepair:
          'Reference dp[i-1][w - w_i] to guarantee each item i is selected at most once.',
        diagnosticHint:
          'In 0/1 knapsack, an item cannot be picked multiple times; referencing index i on the RHS enables unbounded duplication.',
      },
    ],
    selfExplanationPrompts: [
      {
        id: 'ks_prompt_1',
        promptType: 'subgoal_chunking',
        targetStepIndex: 3,
        promptText:
          'Explain how the "cut-and-paste" contradiction establishes that subproblems must be strictly optimal.',
        guidingRubric: [
          'Must mention hypothesis of superior subproblem solution',
          'Must mention replacing sub-solution increases total solution value',
          'Must state contradiction against global optimality',
        ],
        canonicalKeywords: [
          'contradiction',
          'substitute',
          'superior',
          'optimal',
          'cut',
          'paste',
          'exceed',
        ],
        sampleExemplar:
          'If the remaining portion of the optimal knapsack were suboptimal, we could cut it out and paste in a strictly better solution for that smaller capacity, resulting in a valid total knapsack with strictly higher value than our supposedly optimal solution, which is an immediate contradiction.',
      },
    ],
  },

  transformer_attention_derivation: {
    id: 'transformer_attention_derivation',
    domain: 'machine_learning',
    title: 'Transformer Scaled Dot-Product Attention & Softmax Variance Invariant',
    problemStatement:
      'Derive the mathematical scaling factor \\frac{1}{\\sqrt{d_k}} in Transformer Scaled Dot-Product Attention \\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right)V, proving why unscaled dot products push softmax into regions of vanishing gradients.',
    prerequisites: ['Variance of independent random variables', 'Softmax Jacobian derivative'],
    elementInteractivity: 4,
    intrinsicDifficulty: 0.7,
    steps: [
      {
        id: 'tf_step_1',
        stepIndex: 1,
        subgoalLabel: 'Model Query and Key Vector Component Distributions',
        content:
          'q_i, k_i \\overset{iid}{\\sim} \\mathcal{N}(0, 1) \\implies \\mathbb{E}[q_i] = 0, \\; \\text{Var}(q_i) = 1, \\; \\mathbb{E}[k_i] = 0, \\; \\text{Var}(k_i) = 1',
        explanation:
          'Under standard Xavier/He initialization, components of query and key embeddings are zero-mean independent random variables with unit variance across the feature dimension d_k.',
        governingPrinciple:
          'Independent Identically Distributed (IID) Normal Components Assumption',
      },
      {
        id: 'tf_step_2',
        stepIndex: 2,
        subgoalLabel: 'Compute Variance of the Inner Product Sum',
        content:
          'z = q \\cdot k = \\sum_{i=1}^{d_k} q_i k_i \\implies \\mathbb{E}[z] = 0, \\; \\text{Var}(z) = \\sum_{i=1}^{d_k} \\text{Var}(q_i k_i) = d_k',
        explanation:
          'Since q_i and k_i are independent, Var(q_i k_i) = E[q_i^2]E[k_i^2] - (E[q_i]E[k_i])^2 = 1 \\cdot 1 - 0 = 1. Summing over d_k independent components gives total variance Var(z) = d_k and standard deviation \\sigma = \\sqrt{d_k}.',
        governingPrinciple: 'Variance of Sum of Independent Random Variables',
        isOmittedInForwardFading: true,
        scaffoldOptions: [
          '\\mathbb{E}[z] = 0, \\; \\text{Var}(z) = d_k \\implies \\sigma_z = \\sqrt{d_k}',
          '\\mathbb{E}[z] = d_k, \\; \\text{Var}(z) = d_k^2 \\implies \\sigma_z = d_k',
          '\\mathbb{E}[z] = 1, \\; \\text{Var}(z) = \\frac{1}{d_k} \\implies \\sigma_z = \\frac{1}{\\sqrt{d_k}}',
          '\\mathbb{E}[z] = 0, \\; \\text{Var}(z) = 1 \\implies \\sigma_z = 1',
        ],
        correctOptionIndex: 0,
      },
      {
        id: 'tf_step_3',
        stepIndex: 3,
        subgoalLabel: 'Analyze Softmax Saturation and Vanishing Gradients',
        content:
          '\\frac{\\partial \\text{softmax}(z)_i}{\\partial z_j} = s_i (\\delta_{ij} - s_j). \\; \\text{For large} \\; |z|, \\; s_i \\to 1 \\implies s_i(1 - s_i) \\to 0',
        explanation:
          'When variance d_k grows large (e.g. d_k = 512, \\sigma \\approx 22.6), logits z have extreme magnitude. The softmax function saturates into a nearly one-hot distribution, driving derivatives s_i(1 - s_i) exponentially close to zero and causing severe vanishing gradients during backpropagation.',
        governingPrinciple:
          'Softmax Jacobian Derivative & Gradient Vanishing (Vaswani et al. 2017)',
        isOmittedInBackwardFading: true,
        clozeTemplate:
          'When logits grow large, softmax saturates driving gradient s_i(1 - s_i) toward {{gradient_limit}}.',
        clozeTarget: '0',
      },
      {
        id: 'tf_step_4',
        stepIndex: 4,
        subgoalLabel: 'Apply Normalization Scaling to Preserve Unit Variance',
        content:
          'z_{\\text{scaled}} = \\frac{q \\cdot k}{\\sqrt{d_k}} \\implies \\text{Var}(z_{\\text{scaled}}) = \\frac{1}{d_k} \\text{Var}(q \\cdot k) = \\frac{d_k}{d_k} = 1',
        explanation:
          'Dividing by \\sqrt{d_k} scales the variance back down to exactly 1.0 regardless of feature dimension depth, preventing softmax saturation and ensuring robust gradient flow throughout training.',
        governingPrinciple: 'Variance Invariant Scaling in High Dimensions',
      },
    ],
    erroneousVariants: [
      {
        id: 'tf_err_1',
        flawedStepIndex: 4,
        flawedContent: 'Scale logits by 1/d_k instead of 1/sqrt(d_k), producing Var(z) = 1/d_k',
        misconceptionCategory: 'invariant_violation',
        misconceptionDescription:
          'Dividing by d_k squares the scaling on variance (Var(cZ) = c^2 Var(Z)), causing variance to collapse to 1/d_k and flattening softmax into uniform noise.',
        correctiveRepair: 'Divide by sqrt(d_k) so that (1/sqrt(d_k))^2 * d_k = 1.',
        diagnosticHint:
          'Remember that Var(c * X) = c^2 * Var(X). What constant c satisfies c^2 * d_k = 1?',
      },
    ],
    selfExplanationPrompts: [
      {
        id: 'tf_prompt_1',
        promptType: 'anticipation',
        targetStepIndex: 4,
        promptText:
          'Why does dividing by \\sqrt{d_k} specifically yield unit variance, rather than dividing by d_k or d_k^2?',
        guidingRubric: [
          'Must mention Var(c * X) = c^2 * Var(X)',
          'Must equate c^2 * d_k = 1',
          'Must conclude c = 1 / sqrt(d_k)',
        ],
        canonicalKeywords: ['variance', 'square', 'constant', 'unit', 'root', 'dimension'],
        sampleExemplar:
          'By the scaling property of variance, scalar multiplication scales variance quadratically: Var(c * Z) = c^2 * Var(Z). Since Var(Z) = d_k, setting c^2 * d_k = 1 requires c^2 = 1/d_k, hence c = 1/\\sqrt{d_k}.',
      },
    ],
  },

  quantum_teleportation: {
    id: 'quantum_teleportation',
    domain: 'quantum_circuits',
    title: 'Quantum Teleportation & Bell State Unitary Recovery Protocol',
    problemStatement:
      'Prove that an arbitrary unknown single-qubit quantum state |\\psi\\rangle = \\alpha |0\\rangle + \\beta |1\\rangle can be faithfully reconstructed at a remote receiver using one pre-shared entangled Bell pair |\\Phi^+\\rangle = \\frac{1}{\\sqrt{2}}(|00\\rangle + |11\\rangle) and 2 classical transmission bits, without violating the No-Cloning Theorem.',
    prerequisites: [
      'Tensor Product of Hilbert Spaces',
      'Pauli Matrices (X, Z)',
      'Bell Measurement',
    ],
    elementInteractivity: 4,
    intrinsicDifficulty: 0.8,
    steps: [
      {
        id: 'qt_step_1',
        stepIndex: 1,
        subgoalLabel: 'Express Total 3-Qubit Composite Tensor State',
        content:
          '|\\Psi_0\\rangle = |\\psi\\rangle_A \\otimes |\\Phi^+\\rangle_{AB} = \\frac{1}{\\sqrt{2}}\\left[ \\alpha |0\\rangle (|00\\rangle + |11\\rangle) + \\beta |1\\rangle (|00\\rangle + |11\\rangle) \\right]',
        explanation:
          'Combine Alice’s input qubit with the entangled Einstein-Podolsky-Rosen (EPR) pair distributed between Alice and Bob into an unmeasured 8-dimensional state vector in H_2^{\\otimes 3}.',
        governingPrinciple: 'Quantum State Superposition & Hilbert Space Tensor Product',
      },
      {
        id: 'qt_step_2',
        stepIndex: 2,
        subgoalLabel: 'Apply CNOT and Hadamard Gates on Alice’s Local Subsystem',
        content:
          '|\\Psi_2\\rangle = (H \\otimes I \\otimes I)(CNOT_{1\\to 2} \\otimes I)|\\Psi_0\\rangle = \\frac{1}{2} \\sum_{x,y \\in \\{0,1\\}} |xy\\rangle_A \\otimes (Z^x X^y |\\psi\\rangle)_B',
        explanation:
          'Applying a CNOT with Alice’s unknown qubit as control and her Bell qubit as target, followed by a Hadamard on her unknown qubit, transforms Alice’s local qubits into the orthogonal Bell measurement basis.',
        governingPrinciple: 'Bell Basis Unitary Transformation (Bennett et al. 1993)',
        isOmittedInForwardFading: true,
        scaffoldOptions: [
          '|\\Psi_2\\rangle = \\frac{1}{2} \\left[ |00\\rangle (\\alpha|0\\rangle + \\beta|1\\rangle) + |01\\rangle (\\alpha|1\\rangle + \\beta|0\\rangle) + |10\\rangle (\\alpha|0\\rangle - \\beta|1\\rangle) + |11\\rangle (\\alpha|1\\rangle - \\beta|0\\rangle) \\right]',
          '|\\Psi_2\\rangle = \\frac{1}{\\sqrt{2}} \\left[ |000\\rangle + |111\\rangle \\right]',
          '|\\Psi_2\\rangle = (\\alpha |00\\rangle + \\beta |11\\rangle) \\otimes |+\\rangle',
          '|\\Psi_2\\rangle = \\frac{1}{4} \\sum_{i,j,k=0}^1 |ijk\\rangle',
        ],
        correctOptionIndex: 0,
      },
      {
        id: 'qt_step_3',
        stepIndex: 3,
        subgoalLabel: 'Execute Projective Measurement on Alice’s Qubits',
        content:
          '\\text{Measure}(q_1, q_2) \\to m_1 m_2 \\in \\{00, 01, 10, 11\\} \\implies \\text{Bob holds state } Z^{m_1} X^{m_2} |\\psi\\rangle',
        explanation:
          'Alice performs a von Neumann measurement in the computational basis on her two qubits. By the projection postulate, the wavefunction instantaneously collapses, projecting Bob’s qubit into one of 4 possible Pauli-transformed rotations of the original state |\\psi\\rangle.',
        governingPrinciple: 'von Neumann Projection Postulate & Instantaneous State Collapse',
        isOmittedInBackwardFading: true,
        clozeTemplate:
          'Upon measuring classical outcome m_1 m_2, Bob’s remaining entangled qubit collapses into rotation {{bob_rotation}}|\\psi\\rangle.',
        clozeTarget: 'Z^{m_1} X^{m_2}',
      },
      {
        id: 'qt_step_4',
        stepIndex: 4,
        subgoalLabel: 'Apply Conditional Pauli Unitary Correction at Bob’s Receiver',
        content:
          'U_{\\text{Bob}} = X^{m_2} Z^{m_1} \\implies U_{\\text{Bob}}(Z^{m_1} X^{m_2} |\\psi\\rangle) = X^{m_2} Z^{m_1} Z^{m_1} X^{m_2} |\\psi\\rangle = |\\psi\\rangle',
        explanation:
          'Upon receiving the 2 classical bits (m_1, m_2) over a classical channel, Bob applies the corresponding inverse Pauli operations (since X^2 = I and Z^2 = I). Bob recovers the exact state |\\psi\\rangle while Alice’s original copy is irrevocably destroyed by measurement, respecting No-Cloning (Wootters & Zurek 1982).',
        governingPrinciple: 'Pauli Group Inversion & No-Cloning Compliance',
      },
    ],
    erroneousVariants: [
      {
        id: 'qt_err_1',
        flawedStepIndex: 4,
        flawedContent:
          'Bob measures his qubit immediately upon Alice’s local measurement without waiting for classical bits m_1 and m_2.',
        misconceptionCategory: 'fallacious_assumption',
        misconceptionDescription:
          'Attempting to read the teleported state before classical communication yields an unpolarized maximally mixed density matrix rho = I/2, demonstrating that faster-than-light signaling is impossible (No-Communication Theorem).',
        correctiveRepair:
          'Bob must wait for the 2 classical bits m_1, m_2 sent at light speed and apply unitary gate X^{m_2} Z^{m_1}.',
        diagnosticHint:
          'Remember the No-Communication Theorem: entanglement alone cannot transmit information faster than light without a classical channel.',
      },
    ],
    selfExplanationPrompts: [
      {
        id: 'qt_prompt_1',
        promptType: 'principle_justification',
        targetStepIndex: 4,
        promptText:
          'Why does quantum teleportation NOT violate the No-Cloning Theorem (Wootters & Zurek 1982)?',
        guidingRubric: [
          'Must mention original state is destroyed during measurement',
          'Must state only one copy of |psi> exists at the end',
          'Must link collapse to projection postulate destroying superposition',
        ],
        canonicalKeywords: ['destroyed', 'measurement', 'collapse', 'cloning', 'single', 'copy'],
        sampleExemplar:
          'Quantum teleportation does not violate the No-Cloning Theorem because Alice’s original qubit is projected and destroyed by measurement before Bob recovers his copy. At no point do two identical copies of the unknown quantum state co-exist.',
      },
    ],
  },

  lockfree_treiber_stack: {
    id: 'lockfree_treiber_stack',
    domain: 'concurrency',
    title: 'Lock-Free Treiber Stack ABA Hazard Pointer Invariant Proof',
    problemStatement:
      'Prove how the ABA anomaly corrupts a naive Compare-And-Swap (CAS) concurrent Treiber Stack during concurrent Pop/Push operations, and derive the invariant preservation achieved using Versioned Pointers / Hazard Pointers.',
    prerequisites: ['Compare-And-Swap (CAS)', 'Linearizability', 'Memory Reclamation'],
    elementInteractivity: 5,
    intrinsicDifficulty: 0.85,
    steps: [
      {
        id: 'lf_step_1',
        stepIndex: 1,
        subgoalLabel: 'Model Naive Pop CAS Interleaving Sequence',
        content:
          'Thread 1: top = A, next = A.next (B). Interleaved: Thread 2 pops A, pops B, pushes A back. Thread 1 resumes: CAS(&top, A, B).',
        explanation:
          'Thread 1 reads top pointer A and caches its next link B. Before Thread 1 can execute CAS, Thread 2 preempts, empties the stack down past B, and recycles node A back to top. The address of top matches A, but its internal structural topology is completely different.',
        governingPrinciple: 'Concurrent Execution Interleaving & Memory Reuse (Treiber 1986)',
      },
      {
        id: 'lf_step_2',
        stepIndex: 2,
        subgoalLabel: 'Demonstrate Memory Corruption and Dangling Successor Link',
        content:
          'CAS(&top, A, B) succeeds because address matches. Result: top = B, but node B was already freed/recycled into invalid memory.',
        explanation:
          'Because CAS only checks pointer value equality, it cannot detect that the object graph was mutated and restored. Top is set to B, which may have been freed, corrupted, or reallocated to an unrelated data structure, violating stack linearizability and memory safety.',
        governingPrinciple: 'The ABA Anomaly (Michael & Scott 1996)',
        isOmittedInForwardFading: true,
        scaffoldOptions: [
          'CAS succeeds on value equality, setting top to freed/stale node B, inducing corrupted memory reads.',
          'CAS detects that thread ID changed and throws a HardwareFaultException.',
          'Memory controller blocks the CAS because cache line invalidated.',
          'Operating system pauses thread 1 and re-reads B automatically.',
        ],
        correctOptionIndex: 0,
      },
      {
        id: 'lf_step_3',
        stepIndex: 3,
        subgoalLabel: 'Formulate Versioned Pointer / Tagged Pointer Invariant',
        content:
          'TaggedPointer = \\langle ptr: 48\\text{ bits}, \\; version: 16\\text{ bits} \\rangle \\implies CAS64/CAS128(\\&top, \\langle A, v_1 \\rangle, \\langle B, v_1 + 1 \\rangle)',
        explanation:
          'By pairing the pointer address with a monotonically increasing integer version tag, any intermediate modification increments the tag (v_1 -> v_2 -> v_3). Even if address A is reused, the tag is now v_3 != v_1, causing the stale CAS to fail cleanly and retry.',
        governingPrinciple: 'Monotonic Version Tag Invariant & Double-Word CAS (DCAS)',
        isOmittedInBackwardFading: true,
        clozeTemplate:
          'Monotonic tag increment guarantees that upon A recycling, version tag v_3 != {{initial_tag}}, causing CAS to fail safely.',
        clozeTarget: 'v_1',
      },
      {
        id: 'lf_step_4',
        stepIndex: 4,
        subgoalLabel: 'Conclude Linearizability and ABA-Free Safety',
        content:
          '\\forall \\text{CAS}, \\; top.version = v \\implies \\text{no intervening mutations occurred between read and CAS}',
        explanation:
          'The monotonic version invariant guarantees that matching (ptr, version) is a necessary and sufficient condition for state identity. Every successful CAS constitutes a true linearizability point without dangling pointer dereferences or ABA corruption.',
        governingPrinciple: 'Linearizable Lock-Free Safety (Herlihy & Wing 1990)',
      },
    ],
    erroneousVariants: [
      {
        id: 'lf_err_1',
        flawedStepIndex: 3,
        flawedContent:
          'Rely purely on pointer equality check CAS(&top, A, B) with immediate free(A) in a non-garbage-collected language.',
        misconceptionCategory: 'concurrency_race',
        misconceptionDescription:
          'Immediate deallocation allows the allocator to re-issue the same pointer address A, triggering classic ABA corruption upon subsequent CAS.',
        correctiveRepair:
          'Use tagged pointers with monotonic versioning or Hazard Pointers (Michael 2004) to defer memory reclamation until no thread holds references.',
        diagnosticHint:
          'When memory is returned to the OS/heap immediately, what prevents the memory allocator from re-issuing address A to a subsequent push?',
      },
    ],
    selfExplanationPrompts: [
      {
        id: 'lf_prompt_1',
        promptType: 'subgoal_chunking',
        targetStepIndex: 3,
        promptText:
          'Explain why monotonic version tags prevent the ABA problem even when memory addresses are aggressively reused by the heap allocator.',
        guidingRubric: [
          'Must mention monotonic counter increment on every pop/push',
          'Must state that even if pointer A matches, version counter differs',
          'Must conclude CAS compares both pointer and counter simultaneously',
        ],
        canonicalKeywords: ['monotonic', 'version', 'tag', 'counter', 'reused', 'compare', 'fails'],
        sampleExemplar:
          'Even if the heap allocator reuses address A, every intervening push or pop increments the monotonic version counter. Because CAS verifies both the pointer address and the counter simultaneously, the counter mismatch causes the stale CAS to fail and prevents ABA corruption.',
      },
    ],
  },
}

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
