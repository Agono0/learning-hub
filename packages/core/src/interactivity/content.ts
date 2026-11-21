/**
 * Scenario corpora for the element interactivity engine (TD-05).
 *
 * CONTENT, not logic: the calibrated high-interactivity suite library — Raft
 * distributed consensus and cardiovascular hemodynamics teaching suites with
 * their element graphs, interaction edges and systemic cascade scenarios
 * (Sweller 1988/2011; Pollock, Chandler & Sweller 2002; Paas 1992). Kept out of
 * `element-interactivity-engine.ts` so engine diffs stay about algorithms, not
 * data. The `ElementInteractivitySuite` type stays in the engine (type-only
 * import here — type-only cycles are safe); the engine re-exports this constant
 * so every existing import path keeps working (MCP tools, CLI commands, server
 * routes, web handlers and the web studio all import it from the engine/barrel).
 *
 * @module @learning-hub/core/interactivity
 */
import type { ElementInteractivitySuite } from './element-interactivity-engine'

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
