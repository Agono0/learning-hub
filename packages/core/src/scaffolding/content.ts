/**
 * Scenario corpora for the worked-example fading / scaffolding engine (TD-05).
 *
 * CONTENT, not logic: the multi-domain calibrated problem bank — Raft leader
 * election, 0/1 knapsack, transformer attention, quantum teleportation and
 * lock-free Treiber stack worked examples with faded derivation steps, erroneous
 * variants and self-explanation prompts. Kept out of `worked-example-engine.ts`
 * so engine diffs stay about algorithms, not data. The `WorkedExampleProblem`
 * type stays in the engine (type-only import here — type-only cycles are safe);
 * the engine re-exports this constant so every existing import path keeps
 * working.
 *
 * @module @learning-hub/core/scaffolding
 */
import type { WorkedExampleProblem } from './worked-example-engine'

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
