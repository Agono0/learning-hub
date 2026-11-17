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

export const CALIBRATED_EXPLANATION_PROBLEMS: Record<string, SelfExplanationDerivationProblem> = {
  raft_log_matching_invariant_proof: {
    id: 'raft_log_matching_invariant_proof',
    title: 'Raft Log Matching Invariant & State Machine Safety',
    domain: 'distributed_systems',
    theoremStatement:
      'If two logs contain an entry with the same index and term, then they store the same command in that entry, and their logs are identical in all entries up through the given index.',
    summary:
      'Ongaro & Ousterhout (2014) inductive proof establishing that leader election restrictions guarantee state machine replication determinism.',
    steps: [
      {
        stepId: 'raft_step_1_base',
        stepNumber: 1,
        claimOrStatement:
          'Base Case (index = 1): Leaders create at most one entry with a given index in a given term, and entries never change position in the log.',
        mathematicalNotation:
          '\\forall t, i=1: |\\{ e \\in \\text{log} \\mid e.\\text{term} = t \\land e.\\text{index} = 1 \\}| \\le 1',
        governingRuleName: 'Election Safety Invariant',
        ruleCategory: 'invariant',
        canonicalPrincipleJustification:
          'Because at most one leader is elected per term (via majority quorum vote), only that unique leader can append entries with index 1 in term t, guaranteeing unicity of the base entry.',
        goalOperatorPurpose: 'Establish induction base case for log index 1 unicity.',
        keyMechanisticConcepts: ['majority quorum', 'one leader per term', 'unicity', 'base case'],
        distractorRules: [
          'Leader Append-Only Property',
          'StateMachine Safety Invariant',
          'Leader Completeness',
        ],
        inversionChallenge: {
          counterfactualPremise:
            'Suppose split-brain allowed two distinct leaders to be elected simultaneously in the same term t...',
          violationType: 'precondition_failure',
          failureConsequence:
            'Both leaders would append conflicting state machine commands at index 1 in term t, violating the unicity base invariant.',
          diagnosticPrompt:
            'What fundamental quorum requirement prevents two leaders from being elected in term t?',
          options: [
            {
              id: 'opt_raft_1_correct',
              text: 'Any two majorities of nodes must overlap in at least one node, preventing two candidates from receiving majority votes in the same term.',
              isCorrect: true,
              rationale: 'Quorum intersection guarantees at most one majority winner per term.',
            },
            {
              id: 'opt_raft_1_wrong_heartbeat',
              text: 'Heartbeat timeouts prevent followers from voting for candidates.',
              isCorrect: false,
              rationale: 'Heartbeats maintain leadership but do not govern election quorum logic.',
            },
            {
              id: 'opt_raft_1_wrong_log',
              text: 'Followers reject votes if the candidate log has smaller length.',
              isCorrect: false,
              rationale: 'Log comparison is secondary to the strict majority vote requirement.',
            },
          ],
        },
      },
      {
        stepId: 'raft_step_2_inductive',
        stepNumber: 2,
        claimOrStatement:
          'Inductive Step (index i -> i+1): An entry at index i+1 is only appended if followers verify consistency of the preceding entry at index i.',
        mathematicalNotation:
          '\\text{AppendEntries}(e_{i+1}) \\implies \\text{prevLogIndex} = i \\land \\text{prevLogTerm} = e_i.\\text{term}',
        governingRuleName: 'AppendEntries Consistency Check',
        ruleCategory: 'definition',
        canonicalPrincipleJustification:
          'The leader includes prevLogIndex and prevLogTerm in every AppendEntries RPC. If follower finds no matching entry at index i, it rejects the RPC. By inductive hypothesis, matching at i implies identity of all prior entries 1..i.',
        goalOperatorPurpose:
          'Enforce inductive continuity so that consistency at i+1 transitively proves consistency for all entries 1..i.',
        keyMechanisticConcepts: [
          'prevLogIndex',
          'prevLogTerm',
          'inductive hypothesis',
          'rejection on mismatch',
        ],
        distractorRules: [
          'Commit Index Advancement Rule',
          'Raft Linearizability Axiom',
          'Heartbeat Suppress Invariant',
        ],
        inversionChallenge: {
          counterfactualPremise:
            'Suppose followers accepted AppendEntries RPCs for index i+1 without checking prevLogIndex and prevLogTerm at index i...',
          violationType: 'soundness_breach',
          failureConsequence:
            'A follower with divergent uncommitted past entries could append new entries on top of corrupted history, breaking total ordering.',
          diagnosticPrompt:
            'Why would omitting the prevLog check destroy log matching across nodes?',
          options: [
            {
              id: 'opt_raft_2_correct',
              text: 'Without the check, divergent logs could agree at index i+1 while containing completely different commands at indices 1..i, destroying state machine consistency.',
              isCorrect: true,
              rationale:
                'The recursive check is the exact mechanism that anchors inductive log identity.',
            },
            {
              id: 'opt_raft_2_wrong_perf',
              text: 'RPC payload size would increase, causing network throughput degradation.',
              isCorrect: false,
              rationale: 'This is a performance issue, not a safety violation.',
            },
            {
              id: 'opt_raft_2_wrong_term',
              text: 'Follower terms would become out of sync with leader terms.',
              isCorrect: false,
              rationale: 'Terms are updated independently via message headers.',
            },
          ],
        },
      },
    ],
  },

  shannon_source_coding_theorem: {
    id: 'shannon_source_coding_theorem',
    title: 'Shannon Source Coding Theorem & Entropy Lower Bound',
    domain: 'information_theory',
    theoremStatement:
      'For a discrete memoryless source X with entropy H(X), the expected codeword length L under any prefix-free code satisfies L >= H(X), with equality iff symbol probabilities are negative powers of 2.',
    summary:
      'Claude Shannon (1948) foundational derivation proving that entropy represents the absolute fundamental limit of lossless data compression.',
    steps: [
      {
        stepId: 'shannon_step_1_kraft',
        stepNumber: 1,
        claimOrStatement:
          'Every uniquely decodable prefix code with codeword lengths l_i must satisfy the Kraft-McMillan Inequality: \\sum_{i} D^{-l_i} \\le 1.',
        mathematicalNotation: '\\sum_{i=1}^{M} D^{-l_i} \\le 1',
        governingRuleName: 'Kraft-McMillan Inequality',
        ruleCategory: 'theorem',
        canonicalPrincipleJustification:
          'In a D-ary prefix tree, no codeword is an ancestor of another. Codewords at depth l_i prune a fraction D^{-l_i} of all leaves. Because the total available leaf fraction cannot exceed 1, the sum of pruned fractions must be <= 1.',
        goalOperatorPurpose:
          'Establish the geometric tree constraint bounding permissible codeword length allocations.',
        keyMechanisticConcepts: [
          'prefix-free tree',
          'pruned fraction',
          'uniquely decodable',
          'D-ary tree leaves',
        ],
        distractorRules: [
          'Gibbs Inequality',
          'Asymptotic Equipartition Property (AEP)',
          'Jensen Inequality',
        ],
        inversionChallenge: {
          counterfactualPremise:
            'Suppose we design a code where \\sum_{i} 2^{-l_i} = 1.45 > 1.0...',
          violationType: 'soundness_breach',
          failureConsequence:
            'The code cannot be prefix-free or uniquely decodable; at least one codeword must be a prefix of another, causing ambiguity during streaming decompression.',
          diagnosticPrompt: 'What catastrophic decoding failure occurs if Kraft sum exceeds 1.0?',
          options: [
            {
              id: 'opt_shannon_1_correct',
              text: 'Codewords overlap in the search tree, producing ambiguous sequences that cannot be decoded instantaneously or uniquely.',
              isCorrect: true,
              rationale: 'Kraft sum > 1 exceeds the total leaf capacity of the prefix tree.',
            },
            {
              id: 'opt_shannon_1_wrong_entropy',
              text: 'The entropy of the source artificially increases.',
              isCorrect: false,
              rationale: 'Source entropy is a property of the source distribution, not the code.',
            },
            {
              id: 'opt_shannon_1_wrong_bitrate',
              text: 'Transmission channel bandwidth saturates immediately.',
              isCorrect: false,
              rationale: 'Bandwidth is physical, not an algorithmic unicity failure.',
            },
          ],
        },
      },
      {
        stepId: 'shannon_step_2_gibbs',
        stepNumber: 2,
        claimOrStatement:
          'Apply Gibbs Inequality / Relative Entropy Non-Negativity: D_{KL}(P \\parallel Q) = \\sum p_i \\log_2(p_i / q_i) \\ge 0, with q_i = 2^{-l_i} / C.',
        mathematicalNotation:
          'L - H(X) = \\sum p_i l_i - \\sum p_i \\log_2(1/p_i) = D_{KL}(p \\parallel q) + \\log_2(1/C) \\ge 0',
        governingRuleName: 'Kullback-Leibler Non-Negativity / Gibbs Inequality',
        ruleCategory: 'lemma',
        canonicalPrincipleJustification:
          'Because the logarithm is strictly concave, Jensen inequality guarantees that relative entropy D_KL(P || Q) >= 0 with equality iff P = Q. Substituting Kraft-normalized lengths q_i forces expected length L >= H(X).',
        goalOperatorPurpose:
          'Minimize the expected length gap by demonstrating that L - H(X) is non-negative and minimized when codeword lengths match information content l_i = -log2(p_i).',
        keyMechanisticConcepts: [
          'concavity of logarithm',
          'Jensen inequality',
          'relative entropy',
          'optimal length assignment',
        ],
        distractorRules: ['Markov Inequality', 'Cauchy-Schwarz Inequality', 'Bayes Theorem'],
        inversionChallenge: {
          counterfactualPremise:
            'Suppose someone claims an algorithm that compresses arbitrary independent messages to an expected length L < H(X)...',
          violationType: 'divergence_instability',
          failureConsequence:
            'This would require D_KL(P || Q) < 0, violating the fundamental concavity of log and conservation of information.',
          diagnosticPrompt:
            'Why is lossless compression below H(X) mathematically impossible for memoryless sources?',
          options: [
            {
              id: 'opt_shannon_2_correct',
              text: 'By Gibbs inequality, D_KL >= 0 always; compressing below H(X) would require Kraft sum > 1, creating ambiguous decoding collisions.',
              isCorrect: true,
              rationale: 'Shannon entropy is the infimum of expected code length.',
            },
            {
              id: 'opt_shannon_2_wrong_hardware',
              text: 'CPUs lack 128-bit floating point registers needed for precision.',
              isCorrect: false,
              rationale: 'The limit is information-theoretic, not a hardware limitation.',
            },
            {
              id: 'opt_shannon_2_wrong_huffman',
              text: 'Huffman trees cannot handle fractional bit lengths.',
              isCorrect: false,
              rationale: 'Even arithmetic coding cannot beat H(X) on average.',
            },
          ],
        },
      },
    ],
  },

  backprop_matrix_calculus_chain_rule: {
    id: 'backprop_matrix_calculus_chain_rule',
    title: 'Matrix Backpropagation & Gradient Transpose Preservation',
    domain: 'deep_learning',
    theoremStatement:
      'For a forward affine transformation Y = XW + B with inputs X in R^{N x D_in}, weights W in R^{D_in x D_out}, and scalar loss L, the gradient with respect to weights is given by dL/dW = X^T (dL/dY), and with respect to inputs is given by dL/dX = (dL/dY) W^T.',
    summary:
      'Rumelhart, Hinton & Williams (1986) backpropagation matrix calculus derivation enforcing dimensional invariance and Jacobian transpositions.',
    steps: [
      {
        stepId: 'backprop_step_1_weight_gradient',
        stepNumber: 1,
        claimOrStatement:
          'By the multivariable chain rule in matrix differential notation, dL = Tr((dL/dY)^T dY). Substituting dY = X dW yields dL = Tr((dL/dY)^T X dW) = Tr((X^T (dL/dY))^T dW), establishing dL/dW = X^T (dL/dY).',
        mathematicalNotation:
          '\\frac{\\partial L}{\\partial W} = X^T \\frac{\\partial L}{\\partial Y} \\in \\mathbb{R}^{D_{in} \\times D_{out}}',
        governingRuleName: 'Matrix Differential Trace Invariance & Chain Rule',
        ruleCategory: 'theorem',
        canonicalPrincipleJustification:
          'The scalar loss differential dL is invariant under cyclic permutations of the trace operator: Tr(A B) = Tr(B A). Because dY = X dW, substituting into the trace product isolates the inner matrix X^T (dL/dY), perfectly matching the required weight dimensions D_in x D_out.',
        goalOperatorPurpose:
          'Derive the weight gradient tensor while guaranteeing exact matrix dimension compatibility without expanding outer products.',
        keyMechanisticConcepts: [
          'trace cyclic invariance',
          'matrix differential',
          'Jacobian transpose',
          'dimension compatibility',
        ],
        distractorRules: [
          'Hadamard Elementwise Derivative',
          'Kronecker Product Expansion',
          'Cauchy-Schwarz Trace Bounding',
        ],
        inversionChallenge: {
          counterfactualPremise:
            'Suppose an implementation computed dL/dW = X (dL/dY) without transposing the input matrix X...',
          violationType: 'soundness_breach',
          failureConsequence:
            'Inner dimensions fail to contract: X is N x D_in and dL/dY is N x D_out, causing an illegal matrix multiplication or invalid D_in x D_in outer dimension mismatch.',
          diagnosticPrompt:
            'Why does omitting the transpose on X cause an immediate mathematical breakdown?',
          options: [
            {
              id: 'opt_bp_1_correct',
              text: 'X has shape (N, D_in) and dL/dY has shape (N, D_out). Without transposing X to (D_in, N), matrix multiplication is mathematically undefined because inner dimension N != D_in.',
              isCorrect: true,
              rationale:
                'Transposing the forward input aligns the contraction over the batch dimension N.',
            },
            {
              id: 'opt_bp_1_wrong_norm',
              text: 'The gradient norm would grow exponentially with batch size.',
              isCorrect: false,
              rationale:
                'The issue is fundamentally dimensional incompatibility before any norm can be computed.',
            },
            {
              id: 'opt_bp_1_wrong_bias',
              text: 'The bias vector gradient would be zeroed out.',
              isCorrect: false,
              rationale: 'Bias gradients are computed via column-summation over dL/dY.',
            },
          ],
        },
      },
      {
        stepId: 'backprop_step_2_input_gradient',
        stepNumber: 2,
        claimOrStatement:
          'Applying the cyclic trace permutation to variations in the input dY = (dX) W gives dL = Tr((dL/dY)^T (dX) W) = Tr(W (dL/dY)^T dX) = Tr(((dL/dY) W^T)^T dX), proving dL/dX = (dL/dY) W^T.',
        mathematicalNotation:
          '\\frac{\\partial L}{\\partial X} = \\frac{\\partial L}{\\partial Y} W^T \\in \\mathbb{R}^{N \\times D_{in}}',
        governingRuleName: 'Dual Vector Contravariant Gradient Transformation',
        ruleCategory: 'axiom',
        canonicalPrincipleJustification:
          'Backpropagating the error gradient upstream to earlier layers requires multiplying the downstream error signal dL/dY by the transposed weight matrix W^T to map from R^{D_out} back to R^{D_in}, preserving the contravariant vector dual space.',
        goalOperatorPurpose:
          'Enable recursive error backpropagation to previous network layers by transforming downstream gradient vectors back to input coordinate space.',
        keyMechanisticConcepts: [
          'upstream error propagation',
          'transpose weight projection',
          'contravariant dual vector',
          'input dimension preservation',
        ],
        distractorRules: [
          'Singular Value Decomposition Rule',
          'Orthogonal Projection Theorem',
          'Cayley-Hamilton Invariance',
        ],
        inversionChallenge: {
          counterfactualPremise:
            'Suppose during backward propagation, an engineer replaced W^T with the original untransposed weight matrix W...',
          violationType: 'divergence_instability',
          failureConsequence:
            'Gradient updates propagate along forward activation eigenvectors rather than the adjoint backward map, destroying gradient descent stability and causing immediate dimension mismatch unless D_in == D_out.',
          diagnosticPrompt:
            'Why is the adjoint/transpose W^T mandatory for backward error propagation?',
          options: [
            {
              id: 'opt_bp_2_correct',
              text: 'The transpose W^T is the formal adjoint operator mapping gradients from co-domain R^{D_out} back into domain R^{D_in}; using W destroys coordinate duality and fails dimensional contraction when D_in != D_out.',
              isCorrect: true,
              rationale:
                'Backpropagation is adjoint state optimization: the adjoint of a linear map is its transpose.',
            },
            {
              id: 'opt_bp_2_wrong_rate',
              text: 'Using W increases the learning rate by an uncontrolled factor of 2.',
              isCorrect: false,
              rationale:
                'It destroys the direction of steepest descent, not merely scaling the step size.',
            },
            {
              id: 'opt_bp_2_wrong_softmax',
              text: 'It causes softmax output logits to become strictly negative.',
              isCorrect: false,
              rationale: 'Softmax is unaffected by upstream input backpropagation.',
            },
          ],
        },
      },
    ],
  },
}

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
