/**
 * Learning HUB — Cognitive Load & Element Interactivity Engine
 *
 * Implements John Sweller's Cognitive Load Theory (CLT, Sweller 1988, 1994, 2011),
 * Element Interactivity Theory (Sweller & Chandler 1994; Pollock, Chandler & Sweller 2002),
 * and Fred Paas's Instructional Efficiency Metric (Paas 1992; Paas & Van Merriënboer 1993).
 *
 * Mathematical Foundations:
 * 1. Cognitive Load Decomposition:
 *    - Intrinsic Load (L_int): Inherent complexity of interacting elements.
 *      L_int = sum(c_i * (1 + sum_{j in interacting} w_ij)) * (1 - chunking_i)
 *    - Extraneous Load (L_ext): Working memory overhead from non-optimal presentation or split attention.
 *    - Germane Load (L_germ): Working memory capacity dedicated to schema construction.
 *    - Total Cognitive Load: L_total = L_int + L_ext + L_germ <= WMC (Working Memory Capacity, Cowan 4 chunks).
 *
 * 2. Pollock et al. (2002) Isolated-Elements Effect:
 *    For complex high-interactivity material where L_int > WMC, learning is blocked if presented
 *    simultaneously to novices. The scaffold decomposes learning into:
 *    - Phase 1: Isolated Elements (learn individual components with interactions decoupled).
 *    - Phase 2: Pairwise Coupling (learn binary causal links).
 *    - Phase 3: Systemic Synthesis (integrate full multi-element dynamics).
 *
 * 3. Paas (1992) Instructional Efficiency:
 *    E = (Z_Performance - Z_Effort) / sqrt(2)
 *    Where Z_P and Z_Effort are standardized against normative population baselines.
 *
 * 4. FSRS-6 Stability Bridge:
 *    High element interactivity with incomplete schema chunking produces rapid forgetting.
 *    When element interactions are successfully chunked via the 3-phase scaffold,
 *    initial stability receives a chunking multiplier:
 *    S_0 = S_base * (1 + 0.35 * ChunkingScore * max(0, Efficiency + 0.5))
 */

import { z } from 'zod'

// ============================================================================
// 1. Zod Schemas & Domain Types
// ============================================================================

export type ElementInteractivityTier = 'low' | 'moderate' | 'high' | 'extreme'

export type InteractionType =
  | 'transitive_causal' // A causes B which causes C
  | 'feedback_loop' // Mutual reinforcement or homeostatic balancing
  | 'constraint_coupling' // Structural constraint: if A is altered, B must adjust
  | 'simultaneous_state' // Must be evaluated in the exact same clock tick / snapshot

export type ScaffoldPhase =
  | 'isolated_elements' // Phase 1: Atomic definitions, zero cross-talk
  | 'pairwise_coupling' // Phase 2: Pairwise relationships
  | 'systemic_synthesis' // Phase 3: Full simultaneous multi-element dynamics

export interface SystemElement {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly domain: string
  readonly intrinsicComplexity: number // 1 (atomic concept) to 5 (composite subsystem)
  readonly isolatedDefinition: string
  readonly testPrompt: string
  readonly correctSolution: string
  readonly distractorSolutions: readonly string[]
}

export interface ElementInteractionEdge {
  readonly sourceElementId: string
  readonly targetElementId: string
  readonly interactionType: InteractionType
  readonly couplingStrength: number // 0.1 to 1.0
  readonly causalDescription: string
  readonly diagnosticQuestion: string
  readonly correctCouplingAnswer: string
  readonly distractorAnswers: readonly string[]
}

export interface SystemicCascadeScenario {
  readonly id: string
  readonly perturbationElementId: string
  readonly perturbationDescription: string
  readonly expectedCascadeEffects: readonly {
    readonly affectedElementId: string
    readonly direction: 'increase' | 'decrease' | 'invert' | 'destabilize'
    readonly explanation: string
  }[]
  readonly synthesisChallenge: string
  readonly options: readonly {
    readonly text: string
    readonly isCorrect: boolean
    readonly feedback: string
  }[]
}

export interface ElementInteractivitySuite {
  readonly id: string
  readonly title: string
  readonly domain: string
  readonly executiveSummary: string
  readonly workingMemoryThreshold: number // Default Cowan capacity = 4.0
  readonly elements: readonly SystemElement[]
  readonly edges: readonly ElementInteractionEdge[]
  readonly cascadeScenarios: readonly SystemicCascadeScenario[]
}

export interface ElementCognitiveLoadBreakdown {
  readonly intrinsicLoad: number // 0.0 to 10.0
  readonly extraneousLoad: number // 0.0 to 5.0
  readonly germaneLoad: number // 0.0 to 5.0
  readonly totalLoad: number
  readonly workingMemoryLimit: number
  readonly isOverloaded: boolean
  readonly remainingCapacity: number
  readonly tier: ElementInteractivityTier
}

export interface PaasInstructionalEfficiency {
  readonly mentalEffortScore: number // 1 (extremely low) to 9 (extremely high)
  readonly performanceScore: number // 0 to 100
  readonly zEffort: number
  readonly zPerformance: number
  readonly efficiency: number // E = (Z_P - Z_R) / sqrt(2)
  readonly classification:
    | 'optimal_automation' // High performance, low mental effort
    | 'efficient_learning' // Balanced positive efficiency
    | 'cognitive_overload' // Low performance, excessive effort
    | 'under_engaged' // Low performance, minimal effort
    | 'effortful_mastery' // High performance, high effort
}

export interface ElementInteractivityAnalysis {
  readonly suiteId: string
  readonly totalElements: number
  readonly totalInteractions: number
  readonly couplingDensity: number // actual edges / max possible edges
  readonly maxTransitiveDepth: number
  readonly interactivityIndex: number // 0 to 100
  readonly estimatedNoviceLoad: ElementCognitiveLoadBreakdown
  readonly estimatedExpertChunkedLoad: ElementCognitiveLoadBreakdown
}

export interface FSRSElementCard {
  readonly id: string
  readonly suiteId: string
  readonly cardType: 'isolated_element' | 'pairwise_coupling' | 'systemic_synthesis'
  readonly prompt: string
  readonly solution: string
  readonly interactivityTier: ElementInteractivityTier
  readonly recommendedStabilityMultiplier: number
  readonly theoreticalCitation: string
}

// Zod schemas for validation
export const PaasMentalEffortInputSchema = z.object({
  effort: z.number().min(1).max(9),
  performance: z.number().min(0).max(100),
})

// ============================================================================
// 2. Pre-Configured High-Interactivity Suites
// ============================================================================

export const CALIBRATED_INTERACTIVITY_SUITES: Record<string, ElementInteractivitySuite> = {
  raft_consensus_protocol: {
    id: 'raft_consensus_protocol',
    title: 'Raft Distributed Consensus: Multi-State Leader Quorum',
    domain: 'Distributed Systems & Fault-Tolerant Computing',
    executiveSummary:
      'Raft achieves distributed consensus via tightly coupled elements: election timeouts, term numbers, vote requests, log entry matching, and majority commit quorums (Ongaro & Ousterhout 2014). For novices, understanding election safety requires simultaneously holding term transitions, heartbeat timers, and majority thresholds in working memory, resulting in severe cognitive overload without isolated-element scaffolding.',
    workingMemoryThreshold: 4.0,
    elements: [
      {
        id: 'elem_election_timeout',
        label: 'Election Randomized Timeout',
        description:
          'Random timer (150-300ms) after which a follower transitions to candidate if no heartbeat is received.',
        domain: 'Timing & State Transitions',
        intrinsicComplexity: 2,
        isolatedDefinition:
          'A randomized hardware or software timer resets upon receiving an AppendEntries heartbeat; when it fires, a follower initiates election.',
        testPrompt: 'What directly triggers a follower node to transition into a candidate state?',
        correctSolution:
          'Expiration of the randomized election timeout without receiving an AppendEntries RPC or granting a vote.',
        distractorSolutions: [
          'Immediate network partition detection via ping probe.',
          'Receiving an explicit Term Increment packet from the cluster.',
          'Accumulation of 50 uncommitted client command transactions.',
        ],
      },
      {
        id: 'elem_term_monotone_counter',
        label: 'Monotonic Term Number',
        description:
          'Logical clock integer acting as epoch identifier; strictly monotonic and synchronized across all RPCs.',
        domain: 'Logical Clocks',
        intrinsicComplexity: 2,
        isolatedDefinition:
          'Every node stores currentTerm; if an incoming RPC has term > currentTerm, the receiver updates its term and reverts to follower.',
        testPrompt:
          'What is the immediate invariant response when a node receives an RPC containing a term higher than its currentTerm?',
        correctSolution:
          'It immediately updates its currentTerm to match the higher term and converts to follower state.',
        distractorSolutions: [
          'It drops the packet and sends a TermConflict error response.',
          'It retains candidate status and requests a cluster re-vote.',
          'It freezes its log until a human operator reconciles the term disparity.',
        ],
      },
      {
        id: 'elem_majority_quorum',
        label: 'Majority Quorum Threshold',
        description:
          'Strict majority rule: floor(N/2) + 1 nodes required to elect a leader or commit a log entry.',
        domain: 'Fault Tolerance Invariants',
        intrinsicComplexity: 3,
        isolatedDefinition:
          'Because any two majorities of N nodes must overlap by at least one node, at most one leader can be elected per term.',
        testPrompt:
          'In a 5-node Raft cluster, what is the exact minimum quorum size required to win an election or commit a log entry?',
        correctSolution: '3 nodes (floor(5/2) + 1 = 3 nodes).',
        distractorSolutions: [
          '2 nodes (any non-empty partition).',
          '4 nodes (supermajority).',
          '5 nodes (full unweighted consensus).',
        ],
      },
      {
        id: 'elem_log_completeness_invariant',
        label: 'Leader Log Completeness',
        description:
          'Candidate vote denial rule: voter rejects RequestVote if candidate’s log is less up-to-date than voter’s log.',
        domain: 'Data Consistency',
        intrinsicComplexity: 4,
        isolatedDefinition:
          'Voter compares (lastLogTerm, lastLogIndex); candidate must have a higher last term, or same term with equal/greater index.',
        testPrompt:
          'How does Raft guarantee that an elected leader possesses all committed entries from prior terms without log transferring?',
        correctSolution:
          'Followers vote only if the candidate’s log is at least as up-to-date as their own, ensuring any majority contains at least one node with all committed entries.',
        distractorSolutions: [
          'The newly elected leader downloads the entire log history from all followers upon election.',
          'Uncommitted entries are purged immediately whenever a leader dies.',
          'A dedicated metadata coordinator replicates missing logs prior to election.',
        ],
      },
      {
        id: 'elem_append_entries_heartbeat',
        label: 'AppendEntries Heartbeat RPC',
        description:
          'Periodic empty or payload RPC sent by leader to reset follower election timeouts and replicate logs.',
        domain: 'Cluster Maintenance',
        intrinsicComplexity: 2,
        isolatedDefinition:
          'Leader periodically broadcasts AppendEntries to assert authority and suppress new elections among healthy followers.',
        testPrompt: 'What dual role does an AppendEntries RPC with zero log entries serve in Raft?',
        correctSolution:
          'It asserts the leader’s ongoing authority to reset follower election timers while maintaining leader-follower liveness.',
        distractorSolutions: [
          'It executes garbage collection on compacted state machine snapshots.',
          'It re-calculates the Byzantine cryptographic signatures across the cluster.',
          'It forces immediate fsync on follower storage disks.',
        ],
      },
    ],
    edges: [
      {
        sourceElementId: 'elem_append_entries_heartbeat',
        targetElementId: 'elem_election_timeout',
        interactionType: 'feedback_loop',
        couplingStrength: 0.95,
        causalDescription:
          'Leader heartbeats continuously reset follower timers, preventing elections until leader failure.',
        diagnosticQuestion:
          'If network congestion delays heartbeats past the randomized timeout window, what cascade occurs?',
        correctCouplingAnswer:
          'Followers time out, increment their term, transition to candidate, and initiate RequestVote RPCs.',
        distractorAnswers: [
          'Followers shut down into recovery mode.',
          'The leader automatically pauses log intake.',
          'Followers elect the oldest node by IP address.',
        ],
      },
      {
        sourceElementId: 'elem_term_monotone_counter',
        targetElementId: 'elem_majority_quorum',
        interactionType: 'constraint_coupling',
        couplingStrength: 0.9,
        causalDescription:
          'Each node can cast at most one vote per term on a first-come-first-served basis toward the majority.',
        diagnosticQuestion:
          'Why can two candidates never simultaneously achieve a majority quorum in the same term?',
        correctCouplingAnswer:
          'Because each node votes at most once per term, and any two majorities of size floor(N/2)+1 must intersect by at least one node.',
        distractorAnswers: [
          'Because terms are randomized and will never match between candidates.',
          'Because candidates cannot communicate with each other.',
          'Because Raft relies on NTP synchronized wall clocks to sequence votes.',
        ],
      },
      {
        sourceElementId: 'elem_majority_quorum',
        targetElementId: 'elem_log_completeness_invariant',
        interactionType: 'transitive_causal',
        couplingStrength: 0.95,
        causalDescription:
          'Committed entries reside on a majority of nodes; candidate must win a majority vote; intersection guarantees leader has entries.',
        diagnosticQuestion:
          'Suppose an entry is committed on nodes {A, B, C}. Candidate D wins election with votes from {C, D, E}. Why is entry safety preserved?',
        correctCouplingAnswer:
          'Node C holds the committed entry and would have rejected D’s RequestVote if D’s log was less up-to-date than C’s.',
        distractorAnswers: [
          'Node D automatically guesses the missing entry based on monotonic hashes.',
          'Nodes A and B overwrite C’s log during the vote.',
          'The state machine rolls back C’s committed entry to match D.',
        ],
      },
      {
        sourceElementId: 'elem_election_timeout',
        targetElementId: 'elem_term_monotone_counter',
        interactionType: 'transitive_causal',
        couplingStrength: 0.85,
        causalDescription:
          'Timer expiry directly causes term increment: candidate increments currentTerm and votes for itself.',
        diagnosticQuestion:
          'What prevents split votes from causing an infinite election loop when multiple nodes time out?',
        correctCouplingAnswer:
          'Randomized election timeouts (e.g. 150-300ms) desynchronize candidate declarations so one node times out and gathers votes first.',
        distractorAnswers: [
          'Nodes sleep for exactly 10 seconds before retrying.',
          'The candidate with the lowest IP address is prioritized deterministically.',
          'Followers flip coins on each incoming vote request.',
        ],
      },
    ],
    cascadeScenarios: [
      {
        id: 'scenario_network_partition_split_brain',
        perturbationElementId: 'elem_majority_quorum',
        perturbationDescription:
          'A 5-node cluster {A, B, C, D, E} suffers a network partition dividing {A, B} (minority partition with old Leader A) from {C, D, E} (majority partition).',
        expectedCascadeEffects: [
          {
            affectedElementId: 'elem_election_timeout',
            direction: 'destabilize',
            explanation:
              'Nodes C, D, E stop receiving heartbeats from Leader A, causing their election timers to expire.',
          },
          {
            affectedElementId: 'elem_term_monotone_counter',
            direction: 'increase',
            explanation:
              'Node C increments its term, requests votes from D and E, and successfully reaches majority quorum (3/5).',
          },
          {
            affectedElementId: 'elem_append_entries_heartbeat',
            direction: 'destabilize',
            explanation:
              'Old Leader A receives client writes but can never commit them because it can only replicate to B (2/5 < 3).',
          },
        ],
        synthesisChallenge:
          'When the partition heals, what happens when old Leader A encounters new Leader C broadcasting AppendEntries with the higher term?',
        options: [
          {
            text: 'Leader A immediately sees the higher term, steps down to follower, and uncommitted writes on {A, B} are overwritten by C.',
            isCorrect: true,
            feedback:
              'Correct! Raft guarantees linearizability: the minority never committed writes, and the higher term forces A to yield.',
          },
          {
            text: 'Leader A and Leader C merge their logs by interleaving timestamps chronologically.',
            isCorrect: false,
            feedback:
              'Incorrect. Raft uses strict leader log overwrite rather than timestamp interleaving.',
          },
          {
            text: 'Leader A rejects C because A was elected first in the original configuration.',
            isCorrect: false,
            feedback: 'Incorrect. Terms are monotonic; higher term always supersedes lower term.',
          },
        ],
      },
    ],
  },

  cardiovascular_hemodynamics: {
    id: 'cardiovascular_hemodynamics',
    title: 'Cardiovascular Hemodynamics: Frank-Starling & Baroreflex Coupling',
    domain: 'Human Physiology & Biomechanical Regulatory Loops',
    executiveSummary:
      'Cardiovascular regulation coordinates interacting biomechanical and neural elements: venous return, end-diastolic volume (EDV), myocardial stroke volume (Frank-Starling law), mean arterial pressure (MAP), systemic vascular resistance (SVR), and baroreceptor feedback. Novices easily suffer cognitive overload trying to calculate cardiac output while simultaneously balancing sympathetic/parasympathetic compensatory reflexes.',
    workingMemoryThreshold: 4.0,
    elements: [
      {
        id: 'elem_venous_return',
        label: 'Venous Return & Preload',
        description:
          'Rate of blood flow returning to the heart; governs ventricular filling pressure and end-diastolic volume.',
        domain: 'Fluid Dynamics',
        intrinsicComplexity: 2,
        isolatedDefinition:
          'Venous return is the volume of blood entering the right atrium per minute, driven by the pressure gradient between mean circulatory filling pressure and right atrial pressure.',
        testPrompt:
          'What primary physical factor determines ventricular end-diastolic filling volume (preload)?',
        correctSolution: 'Venous return rate and ventricular filling time during diastole.',
        distractorSolutions: [
          'Aortic systolic peak pressure.',
          'Peripheral capillary permeability index.',
          'Hematocrit percentage in the femoral vein.',
        ],
      },
      {
        id: 'elem_frank_starling',
        label: 'Frank-Starling Myocardial Law',
        description:
          'Intrinsic relationship: increased end-diastolic stretch increases actin-myosin overlap, producing higher stroke volume.',
        domain: 'Myocardial Biomechanics',
        intrinsicComplexity: 3,
        isolatedDefinition:
          'Within physiological limits, the force of ventricular contraction is directly proportional to initial myocardial sarcomere muscle fiber length at end diastole.',
        testPrompt:
          'According to the Frank-Starling law, what happens to stroke volume when ventricular end-diastolic volume increases?',
        correctSolution:
          'Stroke volume increases due to optimized sarcomere myofilament calcium sensitivity and actin-myosin cross-bridging.',
        distractorSolutions: [
          'Stroke volume decreases due to myocardial fatigue.',
          'Stroke volume stays strictly constant while heart rate slows.',
          'Stroke volume oscillates randomly independent of preload.',
        ],
      },
      {
        id: 'elem_arterial_pressure',
        label: 'Mean Arterial Pressure (MAP)',
        description:
          'Average perfusion pressure across the systemic circulation: MAP = Cardiac Output (CO) * SVR.',
        domain: 'Hemodynamics',
        intrinsicComplexity: 3,
        isolatedDefinition:
          'MAP is the product of total cardiac output (Heart Rate * Stroke Volume) and systemic vascular resistance (SVR) plus central venous pressure.',
        testPrompt:
          'What is the fundamental mathematical relationship defining Mean Arterial Pressure (MAP)?',
        correctSolution:
          'MAP is approximately equal to Cardiac Output (CO) multiplied by Systemic Vascular Resistance (SVR).',
        distractorSolutions: [
          'MAP is Systolic Blood Pressure plus Diastolic Blood Pressure divided by two.',
          'MAP is Venous Return multiplied by Heart Rate divided by body surface area.',
          'MAP is Pulse Pressure divided by respiratory minute volume.',
        ],
      },
      {
        id: 'elem_baroreceptor_reflex',
        label: 'Carotid & Aortic Baroreceptor Reflex',
        description:
          'Negative feedback neuro-sensory stretch receptor loop adjusting autonomic vagal/sympathetic outflow.',
        domain: 'Autonomic Neuro-Regulation',
        intrinsicComplexity: 4,
        isolatedDefinition:
          'Stretch receptors in the carotid sinus and aortic arch fire in proportion to MAP; increased firing stimulates parasympathetic vagal tone and inhibits sympathetic vascular tone.',
        testPrompt:
          'What is the immediate autonomic response when baroreceptor stretch firing suddenly drops during acute blood loss?',
        correctSolution:
          'Sympathetic outflow increases (elevating heart rate, contractility, and arteriolar vasoconstriction) while vagal parasympathetic outflow decreases.',
        distractorSolutions: [
          'Parasympathetic outflow surges, causing bradycardia and peripheral vasodilation.',
          'Renin-angiotensin secretion is permanently inhibited.',
          'Venous compliance increases to store excess blood in splanchnic circulation.',
        ],
      },
    ],
    edges: [
      {
        sourceElementId: 'elem_venous_return',
        targetElementId: 'elem_frank_starling',
        interactionType: 'transitive_causal',
        couplingStrength: 0.9,
        causalDescription:
          'Increased venous return expands end-diastolic volume, stretching sarcomeres to elevate stroke volume.',
        diagnosticQuestion:
          'If rapid intravenous saline infusion increases venous return by 30%, how does Frank-Starling respond?',
        correctCouplingAnswer:
          'The ventricles fill to greater end-diastolic volume, intrinsically increasing stroke volume and cardiac output.',
        distractorAnswers: [
          'The heart enters cardiac arrest from fluid volume overload.',
          'Stroke volume drops because excessive stretch disengages all actin filaments.',
          'Arterioles immediately dilate to zero resistance.',
        ],
      },
      {
        sourceElementId: 'elem_frank_starling',
        targetElementId: 'elem_arterial_pressure',
        interactionType: 'transitive_causal',
        couplingStrength: 0.85,
        causalDescription:
          'Higher stroke volume increases total cardiac output, which directly exerts upward pressure on MAP.',
        diagnosticQuestion:
          'If stroke volume falls by half due to myocardial infarction, what is the initial direct hemodynamic impact?',
        correctCouplingAnswer:
          'Cardiac output falls by half, immediately dropping Mean Arterial Pressure prior to compensation.',
        distractorAnswers: [
          'Mean Arterial Pressure instantly doubles.',
          'Venous return immediately ceases.',
          'Systemic vascular resistance drops to zero.',
        ],
      },
      {
        sourceElementId: 'elem_arterial_pressure',
        targetElementId: 'elem_baroreceptor_reflex',
        interactionType: 'feedback_loop',
        couplingStrength: 0.95,
        causalDescription:
          'Pressure stretch directly activates baroreceptor afferents into the medulla solitary tract nucleus.',
        diagnosticQuestion: 'How does the baroreflex close the homeostatic loop when MAP drops?',
        correctCouplingAnswer:
          'Decreased receptor stretch un-inhibits sympathetic drive, increasing HR, contractility, and SVR to restore MAP.',
        distractorAnswers: [
          'It stimulates nitric oxide release to further drop arterial pressure.',
          'It induces cardiac slowing to reduce myocardial oxygen demand.',
          'It shuts down systemic venous return.',
        ],
      },
    ],
    cascadeScenarios: [
      {
        id: 'scenario_acute_hemorrhage',
        perturbationElementId: 'elem_venous_return',
        perturbationDescription:
          'Sudden loss of 1,000 mL blood volume (acute Class III hemorrhage) reduces central venous pressure and venous return.',
        expectedCascadeEffects: [
          {
            affectedElementId: 'elem_frank_starling',
            direction: 'decrease',
            explanation:
              'Substantially reduced preload shrinks end-diastolic volume, sharply lowering stroke volume.',
          },
          {
            affectedElementId: 'elem_arterial_pressure',
            direction: 'decrease',
            explanation: 'Reduced cardiac output causes acute systemic hypotension.',
          },
          {
            affectedElementId: 'elem_baroreceptor_reflex',
            direction: 'increase',
            explanation:
              'De-activation of baroreceptor firing triggers massive sympathetic outflow: tachycardia and intense vasoconstriction.',
          },
        ],
        synthesisChallenge:
          'Why does a hemorrhaging patient present with cold, clammy pale extremities despite a rapid tachycardia of 130 bpm?',
        options: [
          {
            text: 'Baroreflex sympathetic surge induces intense peripheral arteriolar vasoconstriction (elevating SVR) to divert blood to brain and heart, while stimulating tachycardia to compensate for low stroke volume.',
            isCorrect: true,
            feedback: 'Spot on! This is the classic compensatory stage of hypovolemic shock.',
          },
          {
            text: 'The heart rate increases because the blood temperature drops below 35 degrees Celsius.',
            isCorrect: false,
            feedback:
              'Incorrect. Tachycardia is mediated by beta-1 adrenergic receptors from baroreceptor disinhibition.',
          },
          {
            text: 'Venous return increases to super-normal levels due to arterial collapse.',
            isCorrect: false,
            feedback: 'Incorrect. Venous return is depleted by blood volume deficit.',
          },
        ],
      },
    ],
  },
}

// ============================================================================
// 3. Cognitive Load & Element Interactivity Mathematical Core
// ============================================================================

/**
 * Calculates topological element interactivity, coupling density,
 * and working memory load breakdown under novice vs chunked expert schemas.
 * (Sweller 2011; Pollock et al. 2002)
 */
export function analyzeElementInteractivity(
  suite: ElementInteractivitySuite,
  extraneousLoadFactor: number = 1.0, // 0.0 (cleanest UI) to 3.0 (confusing split-attention)
): ElementInteractivityAnalysis {
  const n = suite.elements.length
  const totalInteractions = suite.edges.length
  const maxPossibleEdges = (n * (n - 1)) / 2
  const couplingDensity =
    maxPossibleEdges > 0 ? Math.round((totalInteractions / maxPossibleEdges) * 100) / 100 : 0.0

  // Calculate maximum transitive depth using DFS
  const adj = new Map<string, string[]>()
  for (const el of suite.elements) adj.set(el.id, [])
  for (const edge of suite.edges) adj.get(edge.sourceElementId)?.push(edge.targetElementId)

  let maxDepth = 0
  function dfs(curr: string, visited: Set<string>, depth: number) {
    maxDepth = Math.max(maxDepth, depth)
    const neighbors = adj.get(curr) || []
    for (const next of neighbors) {
      if (!visited.has(next)) {
        visited.add(next)
        dfs(next, visited, depth + 1)
        visited.delete(next)
      }
    }
  }

  for (const el of suite.elements) {
    dfs(el.id, new Set([el.id]), 1)
  }

  // Interactivity Index computation: based on element count, coupling density, and transitive depth
  const avgComplexity =
    suite.elements.reduce((acc, el) => acc + el.intrinsicComplexity, 0) / (n || 1)
  const rawIndex = couplingDensity * 40 + avgComplexity * 10 + maxDepth * 6 + n * 2
  const interactivityIndex = Math.min(100, Math.max(10, Math.round(rawIndex)))

  // Estimate novice cognitive load (each element and interaction must be maintained concurrently)
  // L_int(novice) = sum(c_i) * (1 + sum(w_ij) / n)
  const sumComplexity = suite.elements.reduce((acc, el) => acc + el.intrinsicComplexity, 0)
  const totalCouplingWeight = suite.edges.reduce((acc, e) => acc + e.couplingStrength, 0)
  const noviceIntrinsic = Math.round((sumComplexity * 0.35 + totalCouplingWeight * 0.65) * 10) / 10
  const noviceExtraneous = Math.round(extraneousLoadFactor * 1.5 * 10) / 10
  const noviceGermane = Math.max(
    0.5,
    Math.round((suite.workingMemoryThreshold - noviceIntrinsic - noviceExtraneous) * 10) / 10,
  )
  const noviceTotal =
    Math.round(
      (noviceIntrinsic + noviceExtraneous + (noviceGermane > 0 ? noviceGermane : 0)) * 10,
    ) / 10

  // Estimate expert chunked cognitive load (elements consolidated into 1-2 macro-chunks)
  const expertIntrinsic = Math.round(noviceIntrinsic * 0.28 * 10) / 10
  const expertExtraneous = Math.round(extraneousLoadFactor * 0.5 * 10) / 10
  const expertGermane =
    Math.round(
      Math.min(
        1.5,
        Math.max(0.5, (suite.workingMemoryThreshold - expertIntrinsic - expertExtraneous) * 0.5),
      ) * 10,
    ) / 10
  const expertTotal = Math.round((expertIntrinsic + expertExtraneous + expertGermane) * 10) / 10

  const tier: ElementInteractivityTier =
    interactivityIndex >= 75
      ? 'extreme'
      : interactivityIndex >= 50
        ? 'high'
        : interactivityIndex >= 30
          ? 'moderate'
          : 'low'

  const estimatedNoviceLoad: ElementCognitiveLoadBreakdown = {
    intrinsicLoad: noviceIntrinsic,
    extraneousLoad: noviceExtraneous,
    germaneLoad: Math.max(0, noviceGermane),
    totalLoad: noviceTotal,
    workingMemoryLimit: suite.workingMemoryThreshold,
    isOverloaded: noviceTotal > suite.workingMemoryThreshold,
    remainingCapacity: Math.max(
      0,
      Math.round((suite.workingMemoryThreshold - noviceTotal) * 10) / 10,
    ),
    tier,
  }

  const estimatedExpertChunkedLoad: ElementCognitiveLoadBreakdown = {
    intrinsicLoad: expertIntrinsic,
    extraneousLoad: expertExtraneous,
    germaneLoad: expertGermane,
    totalLoad: expertTotal,
    workingMemoryLimit: suite.workingMemoryThreshold,
    isOverloaded: expertTotal > suite.workingMemoryThreshold,
    remainingCapacity: Math.max(
      0,
      Math.round((suite.workingMemoryThreshold - expertTotal) * 10) / 10,
    ),
    tier,
  }

  return {
    suiteId: suite.id,
    totalElements: n,
    totalInteractions,
    couplingDensity,
    maxTransitiveDepth: maxDepth,
    interactivityIndex,
    estimatedNoviceLoad,
    estimatedExpertChunkedLoad,
  }
}

// ============================================================================
// 4. Paas (1992) Instructional Efficiency Metric
// ============================================================================

/**
 * Calculates Paas-Van Merriënboer instructional efficiency metric:
 * E = (Z_Performance - Z_Effort) / sqrt(2)
 *
 * Normative reference values:
 * Effort: mu = 5.0, sigma = 2.0 (on 1-9 Likert scale)
 * Performance: mu = 65.0, sigma = 20.0 (on 0-100% scale)
 */
export function calculateInstructionalEfficiency(
  mentalEffortScore: number, // 1 to 9
  performanceScore: number, // 0 to 100
  muEffort = 5.0,
  sigmaEffort = 2.0,
  muPerf = 65.0,
  sigmaPerf = 20.0,
): PaasInstructionalEfficiency {
  const boundedEffort = Math.min(9, Math.max(1, mentalEffortScore))
  const boundedPerf = Math.min(100, Math.max(0, performanceScore))

  const zEffort = Math.round(((boundedEffort - muEffort) / sigmaEffort) * 100) / 100
  const zPerformance = Math.round(((boundedPerf - muPerf) / sigmaPerf) * 100) / 100

  // E = (Z_P - Z_R) / sqrt(2)
  const rawEfficiency = (zPerformance - zEffort) / Math.SQRT2
  const efficiency = Math.round(rawEfficiency * 100) / 100

  let classification: PaasInstructionalEfficiency['classification'] = 'efficient_learning'

  if (efficiency >= 0.5) {
    classification = 'optimal_automation'
  } else if (boundedEffort <= 3 && boundedPerf < 50) {
    classification = 'under_engaged'
  } else if (efficiency <= -0.5) {
    if (boundedEffort >= 6) {
      classification = 'cognitive_overload'
    } else {
      classification = 'under_engaged'
    }
  } else {
    if (boundedEffort >= 7 && boundedPerf >= 80) {
      classification = 'effortful_mastery'
    } else {
      classification = 'efficient_learning'
    }
  }

  return {
    mentalEffortScore: boundedEffort,
    performanceScore: boundedPerf,
    zEffort,
    zPerformance,
    efficiency,
    classification,
  }
}

// ============================================================================
// 5. Interactive Isolated-Elements Scaffold Session
// ============================================================================

export interface LearnerScaffoldProgress {
  readonly suiteId: string
  readonly currentPhase: ScaffoldPhase
  readonly isolatedMastery: Record<string, boolean>
  readonly pairwiseMastery: Record<string, boolean>
  readonly systemicMastery: Record<string, boolean>
  readonly mentalEffortRatings: readonly number[]
  readonly testPerformances: readonly number[]
  readonly overallChunkingScore: number // 0.0 to 1.0
  readonly isFullyChunked: boolean
}

/**
 * Stateful coordinator managing Pollock et al. (2002) 3-phase scaffold progression.
 */
export class ElementInteractivitySession {
  private readonly suite: ElementInteractivitySuite
  private currentPhase: ScaffoldPhase = 'isolated_elements'
  private isolatedMastery: Map<string, boolean> = new Map()
  private pairwiseMastery: Map<string, boolean> = new Map()
  private systemicMastery: Map<string, boolean> = new Map()
  private mentalEfforts: number[] = []
  private performances: number[] = []

  constructor(suiteId: string) {
    const s = CALIBRATED_INTERACTIVITY_SUITES[suiteId]
    if (!s) {
      throw new Error(`Unknown element interactivity suite: ${suiteId}`)
    }
    this.suite = s
    for (const el of s.elements) this.isolatedMastery.set(el.id, false)
    for (const edge of s.edges)
      this.pairwiseMastery.set(`${edge.sourceElementId}->${edge.targetElementId}`, false)
    for (const scen of s.cascadeScenarios) this.systemicMastery.set(scen.id, false)
  }

  getSuite(): ElementInteractivitySuite {
    return this.suite
  }

  getCurrentPhase(): ScaffoldPhase {
    return this.currentPhase
  }

  setPhase(phase: ScaffoldPhase): void {
    this.currentPhase = phase
  }

  recordIsolatedAnswer(elementId: string, isCorrect: boolean, effortScore?: number): boolean {
    if (this.isolatedMastery.has(elementId)) {
      this.isolatedMastery.set(elementId, isCorrect)
      if (effortScore !== undefined) this.mentalEfforts.push(effortScore)
      this.performances.push(isCorrect ? 100 : 0)
      this.autoAdvancePhaseCheck()
      return true
    }
    return false
  }

  recordPairwiseAnswer(
    sourceId: string,
    targetId: string,
    isCorrect: boolean,
    effortScore?: number,
  ): boolean {
    const key = `${sourceId}->${targetId}`
    if (this.pairwiseMastery.has(key)) {
      this.pairwiseMastery.set(key, isCorrect)
      if (effortScore !== undefined) this.mentalEfforts.push(effortScore)
      this.performances.push(isCorrect ? 100 : 0)
      this.autoAdvancePhaseCheck()
      return true
    }
    return false
  }

  recordSystemicAnswer(scenarioId: string, isCorrect: boolean, effortScore?: number): boolean {
    if (this.systemicMastery.has(scenarioId)) {
      this.systemicMastery.set(scenarioId, isCorrect)
      if (effortScore !== undefined) this.mentalEfforts.push(effortScore)
      this.performances.push(isCorrect ? 100 : 0)
      return true
    }
    return false
  }

  private autoAdvancePhaseCheck(): void {
    if (this.currentPhase === 'isolated_elements') {
      const allDone = Array.from(this.isolatedMastery.values()).every(Boolean)
      if (allDone) {
        this.currentPhase = 'pairwise_coupling'
      }
    } else if (this.currentPhase === 'pairwise_coupling') {
      const allDone = Array.from(this.pairwiseMastery.values()).every(Boolean)
      if (allDone) {
        this.currentPhase = 'systemic_synthesis'
      }
    }
  }

  getProgress(): LearnerScaffoldProgress {
    const isoValues = Array.from(this.isolatedMastery.values())
    const pairValues = Array.from(this.pairwiseMastery.values())
    const sysValues = Array.from(this.systemicMastery.values())

    const isoScore = isoValues.length > 0 ? isoValues.filter(Boolean).length / isoValues.length : 0
    const pairScore =
      pairValues.length > 0 ? pairValues.filter(Boolean).length / pairValues.length : 0
    const sysScore = sysValues.length > 0 ? sysValues.filter(Boolean).length / sysValues.length : 0

    // Weighted composite chunking score
    const overallChunkingScore =
      Math.round((isoScore * 0.25 + pairScore * 0.35 + sysScore * 0.4) * 100) / 100
    const isFullyChunked = overallChunkingScore >= 0.9

    const isoObj: Record<string, boolean> = {}
    for (const [k, v] of this.isolatedMastery.entries()) isoObj[k] = v
    const pairObj: Record<string, boolean> = {}
    for (const [k, v] of this.pairwiseMastery.entries()) pairObj[k] = v
    const sysObj: Record<string, boolean> = {}
    for (const [k, v] of this.systemicMastery.entries()) sysObj[k] = v

    return {
      suiteId: this.suite.id,
      currentPhase: this.currentPhase,
      isolatedMastery: isoObj,
      pairwiseMastery: pairObj,
      systemicMastery: sysObj,
      mentalEffortRatings: [...this.mentalEfforts],
      testPerformances: [...this.performances],
      overallChunkingScore,
      isFullyChunked,
    }
  }

  /**
   * Generates FSRS-6 Epistemic stability cards with chunking boost multipliers.
   */
  exportFSRSCards(_baseStabilityDays = 4.0): readonly FSRSElementCard[] {
    const progress = this.getProgress()
    const cards: FSRSElementCard[] = []

    // 1. Isolated element atomic recognition cards
    for (const el of this.suite.elements) {
      const isMastered = progress.isolatedMastery[el.id] ?? false
      const multiplier = isMastered
        ? Math.round((1.0 + 0.15 * progress.overallChunkingScore) * 100) / 100
        : 0.85

      cards.push({
        id: `fsrs_${this.suite.id}_iso_${el.id}`,
        suiteId: this.suite.id,
        cardType: 'isolated_element',
        prompt: `[${this.suite.title} - Atomic Element]\n${el.testPrompt}`,
        solution: `${el.correctSolution}\n\nKey Concept: ${el.isolatedDefinition}`,
        interactivityTier: 'low',
        recommendedStabilityMultiplier: multiplier,
        theoreticalCitation: 'Pollock, Chandler & Sweller (2002) Isolated-Elements Effect Phase 1',
      })
    }

    // 2. Relational pairwise coupling cards
    for (const edge of this.suite.edges) {
      const key = `${edge.sourceElementId}->${edge.targetElementId}`
      const isMastered = progress.pairwiseMastery[key] ?? false
      const multiplier = isMastered
        ? Math.round((1.0 + 0.25 * progress.overallChunkingScore) * 100) / 100
        : 0.8

      cards.push({
        id: `fsrs_${this.suite.id}_pair_${edge.sourceElementId}_${edge.targetElementId}`,
        suiteId: this.suite.id,
        cardType: 'pairwise_coupling',
        prompt: `[${this.suite.title} - Binary Coupling]\n${edge.diagnosticQuestion}`,
        solution: `${edge.correctCouplingAnswer}\n\nCoupling Mechanism: ${edge.causalDescription}`,
        interactivityTier: 'moderate',
        recommendedStabilityMultiplier: multiplier,
        theoreticalCitation:
          'Sweller (2011) Cognitive Load Theory: Relational Subsystem Integration',
      })
    }

    // 3. Systemic synthesis invariance cards
    for (const scen of this.suite.cascadeScenarios) {
      const isMastered = progress.systemicMastery[scen.id] ?? false
      const multiplier = isMastered
        ? Math.round((1.0 + 0.35 * progress.overallChunkingScore) * 100) / 100
        : 0.75

      const correctOpt = scen.options.find((o) => o.isCorrect)?.text ?? ''
      cards.push({
        id: `fsrs_${this.suite.id}_sys_${scen.id}`,
        suiteId: this.suite.id,
        cardType: 'systemic_synthesis',
        prompt: `[${this.suite.title} - Systemic Invariance]\nPerturbation: ${scen.perturbationDescription}\n\nChallenge: ${scen.synthesisChallenge}`,
        solution: `${correctOpt}\n\nSystem Cascade: ${scen.expectedCascadeEffects.map((e) => `• ${e.affectedElementId} [${e.direction}]: ${e.explanation}`).join('\n')}`,
        interactivityTier: 'extreme',
        recommendedStabilityMultiplier: multiplier,
        theoreticalCitation:
          'Pollock et al. (2002) & Cowan (2001) Schema Chunking in Working Memory',
      })
    }

    return cards
  }
}
