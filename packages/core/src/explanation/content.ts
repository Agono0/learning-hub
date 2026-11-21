/**
 * Self-Explanation — Scenario Content (TD-05)
 *
 * This file holds ONLY the calibrated problem bank: seeded, multi-disciplinary
 * formal derivations (Raft log matching, Shannon source coding, matrix
 * backpropagation) with per-step canonical justifications, mechanistic concept
 * lists and schema-inversion challenges.
 *
 * Why it lives here: scenario data is CONTENT, not logic. Splitting it out of
 * `self-explanation-engine.ts` keeps the Chi/Aleven-Renkl scoring algorithms
 * and the session state machine reviewable without hundreds of lines of data
 * noise in every diff (TD-05 from docs/tech-debt.md). Values were moved
 * verbatim (same names, same values); the engine re-exports
 * `CALIBRATED_EXPLANATION_PROBLEMS` so every existing import path (including
 * the direct `src/explanation/self-explanation-engine` import used by tests
 * and the `@learning-hub/core/explanation` barrel) keeps working.
 *
 * Data only: no function bodies, no zod schemas, type-only imports.
 */

import type { SelfExplanationDerivationProblem } from './self-explanation-engine'

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
