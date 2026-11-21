/**
 * Cognitive Apprenticeship — Scenario Content (TD-05)
 *
 * This file holds ONLY the calibrated cognitive apprenticeship suite corpora:
 * seeded, multidisciplinary expert-modeling suites (Raft distributed consensus,
 * zk-SNARK circuit design, aerospace GNC Kalman fusion) with their tacit
 * principles, expert think-aloud traces, articulation prompts and reflection
 * contrasts.
 *
 * Why it lives here: scenario data is CONTENT, not logic. Splitting it out of
 * `cognitive-apprenticeship-engine.ts` keeps the extraction/fading/session
 * algorithms reviewable without hundreds of lines of data noise in every diff
 * (TD-05 from docs/tech-debt.md). Values were moved verbatim (same names, same
 * values); the engine re-exports `CALIBRATED_APPRENTICESHIP_SUITES` so every
 * existing import path (`@learning-hub/core/apprenticeship` barrel -> engine)
 * keeps working.
 *
 * Data only: no function bodies, no zod schemas, type-only imports.
 */

import type { CognitiveApprenticeshipSuite } from './cognitive-apprenticeship-engine'

export const CALIBRATED_APPRENTICESHIP_SUITES: Record<string, CognitiveApprenticeshipSuite> = {
  distributed_consensus_raft: {
    id: 'distributed_consensus_raft',
    title: 'Raft Distributed Consensus & Protocol Invariants',
    domain: 'Distributed Systems & Fault-Tolerant State Machine Replication',
    expertPersona: 'Distributed Systems Architect (Diego Ongaro & John Ousterhout modeling)',
    problemContext:
      'Designing a crash fault-tolerant cluster (2F + 1 nodes) where servers must agree on an ordered log of state transitions across asynchronous networks with packet loss, reordering, and arbitrary delays.',
    targetMasteryOutcome:
      'Internalize the non-obvious tacit heuristics of quorum consensus: leader election symmetry breaking, monotonic term invariants, log matching property induction, and conservative leader completeness commit rules.',
    principles: [
      {
        id: 'principle_randomized_symmetry_breaking',
        name: 'Randomized Symmetry Breaking in Quorum Competition',
        coreFormulaOrMaxim: 'Timeout ~ Uniform(T, 2T) to guarantee Pr(Split Vote) -> 0',
        description:
          'When homogeneous nodes simultaneously sense leader absence, deterministic timers produce resonant lockstep split votes. Randomizing timers shatters symmetry so one candidate consistently times out first and gathers the majority.',
        noviceMisconception:
          'Assuming static priorities or round-robin failover is simpler and just as safe as randomized timers in decentralized networks.',
        expertDiagnosticIndicator:
          'Multiple candidates continuously timing out and resetting elections without electing a leader indicates lack of randomized timer variance.',
      },
      {
        id: 'principle_term_monotonicity',
        name: 'Monotonic Term Epochs as Logical Clocks',
        coreFormulaOrMaxim:
          'Term_k+1 > Term_k; Stale Term implies immediate abdication to Follower',
        description:
          'Terms serve as Lamport logical clocks. Every RPC carries the sender’s term. Any server discovering a higher term immediately updates its own term and downgrades to follower status, preventing split-brain usurpation.',
        noviceMisconception:
          'Thinking an elected leader should attempt to renegotiate or defend its leadership against incoming higher term RPCs.',
        expertDiagnosticIndicator:
          'An isolated partitioned old leader continuing to accept client writes without quorum check produces catastrophic data diverges.',
      },
      {
        id: 'principle_conservative_commit_rule',
        name: 'Past Term Log Commit Prohibition (Figure 8 Invariant)',
        coreFormulaOrMaxim:
          'Leader commits log entry from past term ONLY by committing an entry from its CURRENT term',
        description:
          'A leader can never commit a log entry from a previous term simply by counting replicas. If an old entry is replicated to a majority, an un-synchronized crash can still allow an alternate leader to overwrite it unless a current-term entry is committed transitively.',
        noviceMisconception:
          'Believing that once an entry is replicated across a majority of nodes, it is unconditionally safe to commit regardless of which term created it.',
        expertDiagnosticIndicator:
          'Rare log overwrites occurring immediately following a cascade of leader crashes indicate failure to obey the Figure 8 commit invariant.',
      },
      {
        id: 'principle_log_matching_induction',
        name: 'Log Matching Property via Inductive Prefix Equality',
        coreFormulaOrMaxim: 'Match(index, term) => EqualPrefix(0..index)',
        description:
          'If two entries in different logs have the same index and term, they store identical commands and their logs are identical up to that index. AppendEntries consistency check enforces this via inductive step verification.',
        noviceMisconception:
          'Attempting to send full diff hashes or cryptographic Merkle trees on every heartbeat instead of checking only (prevLogIndex, prevLogTerm).',
        expertDiagnosticIndicator:
          'AppendEntries rejected with log gap errors: the leader must decrement nextIndex and back off until the common prefix is discovered.',
      },
    ],
    traces: [
      {
        id: 'trace_raft_step1_election',
        stepNumber: 1,
        title: 'Think-Aloud: Detecting Heartbeat Silence & Launching Election',
        phase: 'orientation',
        observableAction:
          'Heartbeat timer expires (182ms). Transition from Follower to Candidate. Increment currentTerm from 4 to 5. Vote for self. Broadcast RequestVote RPCs.',
        tacitHeuristic:
          'Notice how I immediately choose a fresh random timeout in [150ms, 300ms] BEFORE sending RequestVote. If my RPCs collide with another node, our timeouts must not expire simultaneously.',
        tradeoffsConsidered: [
          'Aggressive short timeout: faster failover vs excessive spurious elections on temporary network jitter',
          'Conservative long timeout: rock-solid stability vs prolonged client write latency during genuine leader partition',
        ],
        rejectedAlternatives: [
          {
            alternative: 'Keep a fixed 200ms timer across all nodes.',
            reason:
              'In a symmetrical 3-node cluster, all 3 nodes would become candidates simultaneously, split the vote (1-1-1), timeout together, and loop indefinitely.',
          },
        ],
        metacognitiveSelfCorrection:
          'Wait, before broadcasting, did I reset my votedFor field? Yes, votedFor must equal candidateId in the new term to uphold the at-most-one-vote-per-term invariant.',
      },
      {
        id: 'trace_raft_step2_log_matching',
        stepNumber: 2,
        title: 'Think-Aloud: Handling AppendEntries Inconsistency & Index Backtracking',
        phase: 'execution',
        observableAction:
          'Follower 3 rejects AppendEntries(prevLogIndex=42, prevLogTerm=3) because its log has term 2 at index 42. Leader decrements nextIndex[3] from 43 to 42 and retries.',
        tacitHeuristic:
          'Expert intuition: Do not panic when a follower rejects an entry! Rejection is Raft’s formal mechanism for discovering the common ancestor boundary. The leader’s log is authoritative; we simply search backwards until logs align.',
        tradeoffsConsidered: [
          'Linear single-step decrement nextIndex--: ultra-simple, minimal code complexity vs multiple roundtrips over high-latency WANs',
          'Accelerated conflict optimization: follower returns conflictTerm and firstIndex of that term to leap backwards in 1-2 RPCs',
        ],
        rejectedAlternatives: [
          {
            alternative: 'Force the follower to wipe its entire uncommitted log immediately.',
            reason:
              'Unnecessary data loss! The follower might have 40 validly committed entries that must be preserved.',
          },
        ],
        metacognitiveSelfCorrection:
          'Ensure nextIndex cannot be decremented below 1! Array bounds guard must protect against catastrophic underflow.',
      },
      {
        id: 'trace_raft_step3_past_term_commit',
        stepNumber: 3,
        title: 'Think-Aloud: The Dangerous Figure 8 Commit Trap',
        phase: 'validation',
        observableAction:
          'Leader in Term 4 sees an entry from Term 2 replicated across nodes 1, 2, and 3 (majority). Leader DOES NOT advance commitIndex to this entry yet; instead, it waits until a new Term 4 entry is replicated to a majority.',
        tacitHeuristic:
          'Deep tacit rule: Counting replicas is safe ONLY for entries created by the leader’s CURRENT term! If a previous-term entry is replicated on 3 of 5 nodes, an alternate leader with a higher term could still be elected and overwrite it if it crashes before term 4 replication.',
        tradeoffsConsidered: [
          'Committing past entries immediately: faster client confirmation on resumed leaders vs subtle violating of State Machine Safety',
          'Waiting for current term entry: slight latency overhead for initial write vs absolute mathematical proof of durability',
        ],
        rejectedAlternatives: [
          {
            alternative: 'Allow commitIndex to advance for term 2 entry because 3 > 5/2.',
            reason:
              'Violates Figure 8 proof! Leads to irreversible log overwrites and state machine divergence.',
          },
        ],
        metacognitiveSelfCorrection:
          'To unblock pending past-term writes immediately upon election, leaders can write a no-op dummy entry in their current term into the log.',
      },
    ],
    prompts: [
      {
        id: 'prompt_raft_election_timeout',
        traceStepId: 'trace_raft_step1_election',
        promptTitle: 'Articulation: Why Randomize Election Timeouts?',
        question:
          'In Step 1, the architect emphasizes choosing a fresh random interval from [150ms, 300ms] prior to launching RequestVote. What is the fundamental tacit reason why deterministic timeouts fail in decentralized quorums?',
        cognitiveSkillTested: 'Heuristic Articulation & Symmetry Breaking Analysis',
        options: [
          {
            id: 'opt_raft_p1_shatter',
            text: 'Randomization shatters temporal symmetry among identical followers, ensuring that one candidate will almost always time out first and collect a quorum before peers wake up.',
            tacitAlignmentScore: 1.0,
            diagnosticFeedback:
              'Flawless articulation! You extracted the core tacit heuristic: randomized timers prevent synchronous split-vote deadlocks.',
            principleId: 'principle_randomized_symmetry_breaking',
          },
          {
            id: 'opt_raft_p1_crypto',
            text: 'Randomization prevents Byzantine attackers from predicting packet arrival times and eavesdropping on TCP connections.',
            tacitAlignmentScore: 0.1,
            diagnosticFeedback:
              'Misconception: Raft operates under the Crash Fault-Tolerant (CFT) model, not Byzantine fault tolerance. The purpose is distributed coordination, not cryptography.',
          },
          {
            id: 'opt_raft_p1_cpu',
            text: 'It reduces CPU utilization on the server by putting worker threads into low-power sleep states.',
            tacitAlignmentScore: 0.05,
            diagnosticFeedback:
              'Attentional slip: Hardware power conservation has no bearing on distributed consensus protocol correctness.',
          },
        ],
        openArticulationScaffold:
          'Explain in your own words what happens to a 5-node cluster if all 5 nodes have an identical 200ms election timer when the leader crashes...',
      },
      {
        id: 'prompt_raft_figure8_commit',
        traceStepId: 'trace_raft_step3_past_term_commit',
        promptTitle: 'Articulation: The Figure 8 Commit Invariant',
        question:
          'Why does an expert Raft architect strictly refuse to advance commitIndex for an entry created in an earlier term, even if that entry is already stored on a majority of cluster nodes?',
        cognitiveSkillTested: 'Boundary Invariant Verification & Counter-Intuitive Safety Rules',
        options: [
          {
            id: 'opt_raft_p3_figure8_safety',
            text: 'Because counting replicas for past-term entries is unsound: if the leader crashes before writing a current-term entry, an alternate leader with higher terms can still overwrite those majority copies.',
            tacitAlignmentScore: 1.0,
            diagnosticFeedback:
              'Brilliant! You identified the deepest invariant in Raft. Replicating a current term entry to a majority locks all prior log history irrevocably.',
            principleId: 'principle_conservative_commit_rule',
          },
          {
            id: 'opt_raft_p3_storage',
            text: 'Because past entries must be re-encrypted using the current leader’s TLS certificate before being written to disk.',
            tacitAlignmentScore: 0.1,
            diagnosticFeedback:
              'Misconception: Raft log storage does not require re-encryption across leadership terms.',
          },
          {
            id: 'opt_raft_p3_client_ack',
            text: 'Because the original client that submitted the request has already disconnected and timed out.',
            tacitAlignmentScore: 0.2,
            diagnosticFeedback:
              'Irrelevant heuristic: Client session lifecycle does not dictate consensus log safety invariants.',
          },
        ],
        openArticulationScaffold:
          'Contrast how a naive engineer calculates committed entries vs how an expert Raft practitioner enforces the current-term replication bridge...',
      },
    ],
    reflectionContrasts: [
      {
        id: 'contrast_raft_split_brain',
        aspect: 'Handling Multiple Claimants to Leadership',
        expertApproach:
          'Terms are absolute epochs. If a leader receives an RPC with term T > currentTerm, it immediately steps down to follower without arguing, rolls back state, and updates its term.',
        noviceApproach:
          'Heartbeat pinging other claimants, attempting to debate who has more clients connected, or refusing to abdicate until confirmed dead by health-checks.',
        underlyingMentalModel:
          'Expert uses monotonically increasing logical time where higher terms represent universal truth; Novice uses anthropomorphic negotiation models.',
        reflectionQuestion:
          'How does the unyielding rule of "higher term always wins and forces immediate abdication" eliminate distributed split-brain scenarios?',
        goldenInsight:
          'Monotonic term comparison is an $O(1)$ zero-coordination heuristic that guarantees stale partitions can never damage cluster history.',
      },
      {
        id: 'contrast_raft_log_overwriting',
        aspect: 'Resolving Uncommitted Divergences in Follower Logs',
        expertApproach:
          'Leader log is unconditionally authoritative. If a follower has uncommitted entries that disagree with the leader, overwrite them without remorse.',
        noviceApproach:
          'Attempting a 3-way merge or preserving conflicting uncommitted follower entries in a secondary "stashed" branch.',
        underlyingMentalModel:
          'Expert views consensus as replicated state machine log linearizability; Novice views consensus like Git branch merging.',
        reflectionQuestion:
          'Why would merging divergent logs in a state machine cause catastrophic database corruption?',
        goldenInsight:
          'State machine operations are non-commutative; their outcome depends strictly on identical sequential application order across all nodes.',
      },
    ],
  },

  zero_knowledge_snarks: {
    id: 'zero_knowledge_snarks',
    title: 'zk-SNARKs Arithmetic Circuits & QAP Polynomial Reductions',
    domain: 'Applied Cryptography & Zero-Knowledge Proofs',
    expertPersona: 'Cryptographic Protocol Engineer & Zero-Knowledge Researcher',
    problemContext:
      'Proving knowledge of a private witness $w$ satisfying an NP-complete relation $C(x, w) = 1$ in zero knowledge, generating a succinct non-interactive proof $\\pi$ of size $< 200$ bytes verifiable in $< 5$ milliseconds.',
    targetMasteryOutcome:
      'Internalize the expert mental models transforming discrete logic into algebra: R1CS flattening, Lagrange polynomial interpolation to QAP, bilinear pairings in toxic waste setups, and zero-knowledge blinding.',
    principles: [
      {
        id: 'principle_algebraic_encoding',
        name: 'Algebraic Reduction of Discrete Logic into R1CS Constraints',
        coreFormulaOrMaxim: 'LeftVector(s) * RightVector(s) - OutputVector(s) = 0',
        description:
          'Every computation (branches, hashes, addition, multiplication) must be flattened into rank-1 bilinear constraints where each gate performs at most one multiplication: $A \\cdot s \\circ B \\cdot s = C \\cdot s$. Addition is free as linear combinations.',
        noviceMisconception:
          'Attempting to write conditional if-else statements or unbounded loops directly inside the proof without arithmetic multiplexers.',
        expertDiagnosticIndicator:
          'Non-linear constraint degrees ($x^3$ or $x/y$ directly in one gate) breaking the quadratic rank-1 form.',
      },
      {
        id: 'principle_polynomial_bundling_schwartz_zippel',
        name: 'Polynomial Bundling via the Schwartz-Zippel Lemma',
        coreFormulaOrMaxim: 'P(x) = H(x) * T(x) across target polynomial roots',
        description:
          'Rather than verifying 1,000,000 gates individually, interpolate the gate coefficients into polynomials $A(x), B(x), C(x)$. The relation holds for all gates if and only if $A(x)B(x) - C(x)$ is cleanly divisible by the vanishing polynomial $T(x)$. Evaluating at a single secret random point $\\tau$ verifies the entire computation with negligible error probability.',
        noviceMisconception:
          'Checking polynomial equality by comparing every individual coefficient or evaluating at multiple known points.',
        expertDiagnosticIndicator:
          'Evaluating polynomials at predictable points enables prover forgery through polynomial interpolation.',
      },
      {
        id: 'principle_pairing_homomorphism',
        name: 'Bilinear Pairing Cryptography for Encrypted Evaluation',
        coreFormulaOrMaxim: 'e(g_1^a, g_2^b) = e(g_1, g_2)^ab over elliptic curves',
        description:
          'To verify $P(\\tau) = H(\\tau)T(\\tau)$ without the verifier knowing $\\tau$ (toxic waste) or the prover knowing $\\tau$, evaluate the polynomials in the exponent using elliptic curve generator points, then multiply exponents using pairing engine $e: G_1 \\times G_2 \\to G_T$.',
        noviceMisconception:
          'Assuming standard RSA or discrete log allows multiplying two encrypted values together in the exponent without bilinear maps.',
        expertDiagnosticIndicator:
          'Attempting to perform multiplication in $G_1$ directly without moving to target group $G_T$ via pairing.',
      },
    ],
    traces: [
      {
        id: 'trace_snark_step1_flattening',
        stepNumber: 1,
        title: 'Think-Aloud: Flattening $x^4 + x + 5 = 35$ into Rank-1 Constraints',
        phase: 'decomposition',
        observableAction:
          'Introduce intermediate witness variables: $v_1 = x \\cdot x$, $v_2 = v_1 \\cdot v_1$, $v_3 = v_2 + x$, and constraint $v_3 + 5 = 35$. Construct witness vector $s = [1, x, v_1, v_2, v_3]$.',
        tacitHeuristic:
          'Notice how I immediately isolate multiplications. In R1CS, addition is free because it simply adds coefficients in the linear combination vector! Every intermediate variable $v_k$ exists solely to isolate a single multiplication.',
        tradeoffsConsidered: [
          'Minimizing total constraint count: reduces prover FFT time and proving key size',
          'Circuit readability vs gate optimization: using specialized lookups (Plookup/halo2) vs pure R1CS (Groth16)',
        ],
        rejectedAlternatives: [
          {
            alternative: 'Write $x^4$ as a single constraint $x \\cdot x \\cdot x \\cdot x$.',
            reason:
              'Illegal in R1CS! Rank-1 constraints only allow degree 2 multiplications ($A \\cdot s \\circ B \\cdot s = C \\cdot s$).',
          },
        ],
        metacognitiveSelfCorrection:
          'Did I include the constant 1 at index 0 of the witness vector? Yes! Without the constant 1, we cannot represent constant offsets like +5.',
      },
      {
        id: 'trace_snark_step2_qap_interpolation',
        stepNumber: 2,
        title: 'Think-Aloud: Interpolating Constraints to QAP Polynomials',
        phase: 'execution',
        observableAction:
          'Assign each gate a root $r_1, r_2, r_3$. Use Inverse Fast Fourier Transform (iFFT) over roots of unity to interpolate polynomials $A_i(x), B_i(x), C_i(x)$. Compute vanishing polynomial $T(x) = (x-r_1)(x-r_2)(x-r_3)$.',
        tacitHeuristic:
          'Expert insight: Evaluating gates over roots of unity in a finite field $\\mathbb{F}_p$ lets us use $O(N \\log N)$ FFT algorithms instead of $O(N^2)$ Lagrange interpolation. Speed is the entire game in ZK proving.',
        tradeoffsConsidered: [
          'Roots of unity of size $2^k$: ultra-fast radix-2 FFT vs requiring dummy padding gates to reach the next power of two',
          'Arbitrary domain interpolation: zero padding overhead vs $O(N^2)$ algorithmic slowdown',
        ],
        rejectedAlternatives: [
          {
            alternative: 'Pick random field elements for gate evaluation points $r_i$.',
            reason:
              'Destroys FFT symmetry, making proof generation hours longer for million-gate circuits.',
          },
        ],
        metacognitiveSelfCorrection:
          'Ensure the finite field scalar modulus matches the elliptic curve order (e.g. BN254 / BLS12-381 scalar field), otherwise field wrapping corrupts proofs.',
      },
    ],
    prompts: [
      {
        id: 'prompt_snark_r1cs_addition',
        traceStepId: 'trace_snark_step1_flattening',
        promptTitle: 'Articulation: Why Is Addition "Free" in R1CS?',
        question:
          'In Step 1, the cryptographer notes: "Addition is free because it simply adds coefficients in the linear combination vector." Why do additions not consume additional constraint rows in R1CS?',
        cognitiveSkillTested: 'Circuit Complexity Analysis & Constraint Optimization',
        options: [
          {
            id: 'opt_snark_p1_free_add',
            text: 'Because each constraint is $(A \\cdot s) \\times (B \\cdot s) = C \\cdot s$, so any number of additions can be bundled into the linear combinations $A, B$, or $C$ before the single multiplication takes place.',
            tacitAlignmentScore: 1.0,
            diagnosticFeedback:
              'Spot on! Only multiplications create new constraints; linear additions are folded into vector dot products without expanding row count.',
            principleId: 'principle_algebraic_encoding',
          },
          {
            id: 'opt_snark_p1_zero',
            text: 'Because addition always outputs zero when computed inside a finite cryptographic field.',
            tacitAlignmentScore: 0.05,
            diagnosticFeedback:
              'Misconception: Finite field addition follows standard modular arithmetic ($a + b \\pmod p$), never collapsing to zero arbitrarily.',
          },
        ],
        openArticulationScaffold:
          'Articulate the difference between linear constraints and non-linear gates in arithmetic circuits...',
      },
    ],
    reflectionContrasts: [
      {
        id: 'contrast_snark_verification',
        aspect: 'Validating Large Computational Proofs',
        expertApproach:
          'Compress the entire multi-thousand gate trace into 3 elliptic curve group elements and verify with 2 pairing operations in under 4ms.',
        noviceApproach:
          'Re-executing every instruction step-by-step or sending encrypted memory dumps for the verifier to inspect.',
        underlyingMentalModel:
          'Expert harnesses algebraic compression via Schwartz-Zippel and bilinear pairings; Novice thinks in operational CPU instruction execution.',
        reflectionQuestion:
          'Why does evaluating polynomials at a secret random point $\\tau$ give 100% cryptographic certainty that every gate executed truthfully?',
        goldenInsight:
          'Two distinct degree-$d$ polynomials can intersect at at most $d$ points; in a field of size $2^{254}$, the chance of accidental intersection at random $\\tau$ is less than $d / 2^{254} \\approx 0$.',
      },
    ],
  },

  aerospace_fault_tolerant_gnc: {
    id: 'aerospace_fault_tolerant_gnc',
    title: 'Aerospace Guidance, Navigation & Control (GNC) Kalman Fusion',
    domain: 'Aerospace Engineering & Real-Time Cyber-Physical Systems',
    expertPersona: 'Flight Dynamics & Spacecraft Control Systems Chief Engineer (NASA / ESA style)',
    problemContext:
      'Designing an autonomous lunar descent guidance system fusing IMU accelerometers, star trackers, and radar altimeters subject to rocket plume dust blackout, sensor saturation, and structural vibration noise.',
    targetMasteryOutcome:
      'Master the tacit heuristics of robust cyber-physical estimation: Joseph-form covariance stabilization, innovation residual chi-square gating, actuator anti-windup, and graceful sensor degradation.',
    principles: [
      {
        id: 'principle_innovation_gating',
        name: 'Innovation Chi-Square Residual Gating (Outlier Shield)',
        coreFormulaOrMaxim: 'gamma = y_tilde^T * S^-1 * y_tilde <= Chi2_threshold',
        description:
          'Never feed an unvetted sensor reading directly into the Kalman gain! Compute the innovation residual $\\tilde{y} = y - H \\hat{x}$ and its covariance $S$. If the Mahalanobis distance exceeds 3-sigma (e.g. plume dust blinding the radar), reject the measurement to protect the state covariance matrix.',
        noviceMisconception:
          'Trusting all incoming sensor packets as long as the hardware checksum / CRC passes.',
        expertDiagnosticIndicator:
          'Sudden state estimation velocity spikes following dust-induced optical false readings indicate absent innovation gating.',
      },
      {
        id: 'principle_joseph_covariance_stabilization',
        name: 'Joseph Form Covariance Update Invariant',
        coreFormulaOrMaxim: 'P_k = (I - KH) * P_k|k-1 * (I - KH)^T + K * R * K^T',
        description:
          'The standard textbook Kalman covariance equation $P = (I - KH)P$ is numerically fragile. In 32-bit floating point, subtraction can produce asymmetric or negative diagonal variances, causing filter divergence. The Joseph form guarantees positive semi-definiteness on every cycle.',
        noviceMisconception:
          'Using naive textbook formulas without checking covariance symmetry and positive-definiteness in flight code.',
        expertDiagnosticIndicator:
          'Filter crashing with NaN or imaginary standard deviations after thousands of real-time cycles indicates numerical covariance degradation.',
      },
    ],
    traces: [
      {
        id: 'trace_gnc_step1_ekf_filtering',
        stepNumber: 1,
        title: 'Think-Aloud: Propagating State Covariance Under High-Jerk Thruster Pulses',
        phase: 'orientation',
        observableAction:
          'Propagate state $\\hat{x}$ using 4th-order Runge-Kutta integration of orbital equations. Propagate error covariance $P = FPF^T + Q$, explicitly tuning process noise $Q$ for thruster firing unmodeled plume vibrations.',
        tacitHeuristic:
          'Notice how I inject artificial process noise $Q$ whenever the RCS thrusters fire. Even if your physics simulator is high-fidelity, thruster combustion roughness is stochastic; if $Q$ is too small, the filter becomes overconfident and ignores genuine radar measurements.',
        tradeoffsConsidered: [
          'Large Q: highly responsive to sensor updates vs noisy erratic flight control',
          'Small Q: silky smooth trajectory vs fatal filter divergence / lag during maneuvers',
        ],
        rejectedAlternatives: [
          {
            alternative: 'Set process noise Q to 0 because we have precise telemetry models.',
            reason:
              'Guarantees filter blindness! The covariance $P$ decays to 0, permanently ignoring all future sensor corrections.',
          },
        ],
        metacognitiveSelfCorrection:
          'Enforce symmetry on P after propagation: P = 0.5 * (P + P^T). Roundoff errors accumulate rapidly across 100Hz loops.',
      },
    ],
    prompts: [
      {
        id: 'prompt_gnc_joseph_form',
        traceStepId: 'trace_gnc_step1_ekf_filtering',
        promptTitle: 'Articulation: Why Use the Joseph Form for Covariance Update?',
        question:
          'In Step 1, the chief engineer emphasizes Joseph-form stabilization instead of the standard textbook equation $P = (I - KH)P$. What critical tacit danger does the Joseph form eliminate?',
        cognitiveSkillTested: 'Numerical Stability & Aerospace Safety Verification',
        options: [
          {
            id: 'opt_gnc_p1_joseph',
            text: 'It eliminates numerical loss of positive definiteness: floating-point roundoff can cause the textbook equation to produce negative variance (imaginary sigma), crashing the flight computer.',
            tacitAlignmentScore: 1.0,
            diagnosticFeedback:
              'Flawless aerospace articulation! In flight software, mathematical equivalence is not numerical equivalence; Joseph form guarantees valid variances.',
            principleId: 'principle_joseph_covariance_stabilization',
          },
          {
            id: 'opt_gnc_p1_speed',
            text: 'It reduces computation time from 100 microseconds to 1 microsecond on radiation-hardened RAD750 processors.',
            tacitAlignmentScore: 0.1,
            diagnosticFeedback:
              'Misconception: Joseph form actually requires MORE floating-point operations, but the guaranteed numerical stability is non-negotiable for flight safety.',
          },
        ],
        openArticulationScaffold:
          'Explain why negative values along the diagonal of a covariance matrix are physically impossible and mathematically catastrophic in state estimation...',
      },
    ],
    reflectionContrasts: [
      {
        id: 'contrast_gnc_sensor_failure',
        aspect: 'Responding to Blinding Sensor Glitches',
        expertApproach:
          'Reject the measurement via chi-square innovation gating, gracefully fall back to inertial dead-reckoning, and increment the sensor fault confirmation counter.',
        noviceApproach:
          'Accepting the extreme measurement as real, commanding full thruster gimbal deflection to "correct" the phantom error, and inducing aerodynamic loss of control.',
        underlyingMentalModel:
          'Expert views sensors as fallible probabilistic informants bounded by physics; Novice treats sensor bus bits as infallible reality.',
        reflectionQuestion:
          'Why is dead-reckoning temporarily on inertial sensors safer than reacting to an unverified wild radar altimeter reading?',
        goldenInsight:
          'A spacecraft has physical inertia: position cannot teleport in 10 milliseconds. Any sensor claiming sudden teleportation is lying.',
      },
    ],
  },
}
