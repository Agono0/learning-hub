/**
 * Collaborative Scripts & Transactive Discourse Studio Engine
 *
 * Grounded in:
 * - Alison King (1997, 1999) "ASK to THINK - TEL WHY": Guided Reciprocal Peer Questioning
 * - Weinberger & Fischer (2006) Computer-Supported Collaborative Learning (CSCL) Scripts
 * - Berkowitz & Gibbs (1983) Transactive Discourse Analysis in Dialectical Dyads
 * - Teasley (1997) "Talking About Reasoning": High-Level Collaboration & Cognitive Change
 * - Fischer et al. (2013) The Script Theory of Guidance in CSCL
 *
 * Quantitative Telemetry:
 * - TDI: Transactive Discourse Index (proportion of turns operating on peer reasoning)
 * - EED: Epistemic Elaboration Depth (mechanistic/causal connective density)
 * - SCR: Script Compliance Rigor (alignment with 4-phase collaborative macro-script)
 * - CEI: Composite Collaborative Epistemic Index = 0.40 * TDI + 0.35 * EED + 0.25 * SCR
 * - 4 Maturity Tiers: parallel_individualist, cumulative_agreer, transactive_critic, dialectical_synthesizer
 */

import { z } from 'zod'

// ── Enumerations & Schemas ───────────────────────────────────────────────────

export const TransactiveActEnum = z.enum([
  'transactive_critique',
  'transactive_extension',
  'transactive_synthesis',
  'transactive_justification',
  'non_transactive',
])
export type TransactiveAct = z.infer<typeof TransactiveActEnum>

export const CollaborativeRoleEnum = z.enum(['proposer', 'questioner', 'synthesizer', 'challenger'])
export type CollaborativeRole = z.infer<typeof CollaborativeRoleEnum>

export const KingStemCategoryEnum = z.enum(['comprehension', 'connection', 'strategic'])
export type KingStemCategory = z.infer<typeof KingStemCategoryEnum>

export const KingQuestionStemSchema = z.object({
  id: z.string(),
  category: KingStemCategoryEnum,
  stem: z.string(),
  purpose: z.string(),
})
export type KingQuestionStem = z.infer<typeof KingQuestionStemSchema>

export const CollaborativeTurnSchema = z.object({
  id: z.string(),
  speaker: z.enum(['learner', 'peer_partner', 'synthesizer_agent']),
  role: CollaborativeRoleEnum,
  text: z.string(),
  speechAct: TransactiveActEnum,
  targetTurnId: z.string().optional(),
  epistemicKeywords: z.array(z.string()).default([]),
})
export type CollaborativeTurn = z.infer<typeof CollaborativeTurnSchema>

export const CompetingPerspectiveSchema = z.object({
  id: z.string(),
  label: z.string(),
  advocate: z.string(),
  corePremise: z.string(),
  primaryEvidence: z.string(),
  vulnerability: z.string(),
})
export type CompetingPerspective = z.infer<typeof CompetingPerspectiveSchema>

export const InvariantReconciliationSchema = z.object({
  id: z.string(),
  name: z.string(),
  reconciliation: z.string(),
})
export type InvariantReconciliation = z.infer<typeof InvariantReconciliationSchema>

export const SimulatedPeerProfileSchema = z.object({
  name: z.string(),
  role: CollaborativeRoleEnum,
  initialStance: z.string(),
  epistemicStyle: z.string(),
  initialArgument: z.string(),
  counterArguments: z.array(z.string()),
})
export type SimulatedPeerProfile = z.infer<typeof SimulatedPeerProfileSchema>

export const CollaborativeScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  domain: z.string(),
  difficulty: z.enum(['introductory', 'intermediate', 'advanced']),
  centralDilemma: z.string(),
  competingPerspectives: z.array(CompetingPerspectiveSchema),
  invariantsForSynthesis: z.array(InvariantReconciliationSchema),
  guidedKingStems: z.array(KingQuestionStemSchema),
  simulatedPeer: SimulatedPeerProfileSchema,
})
export type CollaborativeScenario = z.infer<typeof CollaborativeScenarioSchema>

export const DiscourseSubmissionSchema = z.object({
  scenarioId: z.string(),
  learnerInitialPosition: z.string(),
  dialogueTurns: z.array(CollaborativeTurnSchema),
  jointSynthesis: z.string(),
  individualTransferAnswer: z.string(),
})
export type DiscourseSubmission = z.infer<typeof DiscourseSubmissionSchema>

export const CollaborativeEvaluationSchema = z.object({
  tdi: z.number().min(0).max(100),
  eed: z.number().min(0).max(100),
  scr: z.number().min(0).max(100),
  cei: z.number().min(0).max(100),
  maturityBand: z.enum([
    'parallel_individualist',
    'cumulative_agreer',
    'transactive_critic',
    'dialectical_synthesizer',
  ]),
  transactiveCounts: z.record(z.string(), z.number()),
  synthesizedInvariantsIdentified: z.array(z.string()),
  strengths: z.array(z.string()),
  vulnerabilities: z.array(z.string()),
  pedagogicalFeedback: z.array(z.string()),
})
export type CollaborativeEvaluation = z.infer<typeof CollaborativeEvaluationSchema>

export const CalibratedCollaborativeCardSchema = z.object({
  id: z.string(),
  cardType: z.enum(['transactive_warrant', 'counter_rebuttal', 'joint_invariant', 'far_transfer']),
  front: z.string(),
  back: z.string(),
  scenarioTitle: z.string(),
  fsrsParameters: z.object({
    stability: z.number(),
    difficulty: z.number(),
  }),
})
export type CalibratedCollaborativeCard = z.infer<typeof CalibratedCollaborativeCardSchema>

export const CalibratedCollaborativeDeckSchema = z.object({
  scenarioId: z.string(),
  scenarioTitle: z.string(),
  ceiBaseline: z.number(),
  cards: z.array(CalibratedCollaborativeCardSchema),
})
export type CalibratedCollaborativeDeck = z.infer<typeof CalibratedCollaborativeDeckSchema>

// ── Canonical Collaborative Scenarios ────────────────────────────────────────

export const CANONICAL_COLLABORATIVE_SCENARIOS: CollaborativeScenario[] = [
  {
    id: 'collab-neuro-synaptic-plasticity',
    title: 'Synaptic Tagging & Capture: LTP vs LTD in Memory Consolidation',
    domain: 'neurobiology_memory_systems',
    difficulty: 'advanced',
    centralDilemma:
      'Long-Term Potentiation (LTP) is traditionally viewed as the primary substrate of memory, but without Long-Term Depression (LTD) and synaptic tagging/capture (Frey & Morris 1997), neural networks experience catastrophic saturation and loss of signal contrast. Collaborators must resolve how LTP and LTD cooperatively establish durable memory traces without saturation.',
    competingPerspectives: [
      {
        id: 'persp-ltp-dominance',
        label: 'Anterograde LTP Amplification',
        advocate: 'Cellular Plasticity Theorist',
        corePremise:
          'High-frequency stimulation induces NMDA receptor activation, CaMKII autophosphorylation, and AMPA receptor insertion, establishing the physical memory trace.',
        primaryEvidence:
          'APV (NMDA blocker) infusing hippocampus abolishes spatial Morris water maze learning.',
        vulnerability:
          'Unchecked LTP drives all synapses to maximum synaptic weight, eliminating information storage capacity (Bienenstock-Cooper-Munro paradox).',
      },
      {
        id: 'persp-ltd-synaptic-scaling',
        label: 'Homeostatic LTD & Synaptic Scaling',
        advocate: 'Homeostatic Plasticity Modeler',
        corePremise:
          'Low-frequency stimulation or global sleep-dependent synaptic scaling (Tononi & Cirelli) prunes irrelevant synapses to preserve signal-to-noise ratio.',
        primaryEvidence:
          'Sleep slow-wave activity produces systematic down-selection of total dendritic spine volume.',
        vulnerability:
          'LTD alone cannot create de novo associative networks without stimulus-specific synaptic tags.',
      },
    ],
    invariantsForSynthesis: [
      {
        id: 'inv-tag-and-capture',
        name: 'Frey-Morris Synaptic Tagging & Capture Coordination',
        reconciliation:
          'Weak stimulation sets a temporary local tag at specific activated dendritic spines, while strong stimulation in neighboring inputs triggers cell-wide transcription of Plasticity-Related Proteins (PRPs). The tagged spines capture PRPs, transforming early-LTP into durable late-LTP, while untagged inputs undergo homeostatic scaling or LTD.',
      },
      {
        id: 'inv-bcm-sliding-threshold',
        name: 'BCM Sliding Modification Threshold',
        reconciliation:
          'The threshold between LTP induction and LTD induction dynamically scales with average postsynaptic activity, preventing run-away excitability and preserving dynamic range.',
      },
    ],
    guidedKingStems: [
      {
        id: 'stem-king-1',
        category: 'comprehension',
        stem: 'What is the underlying molecular mechanism that prevents...?',
        purpose: 'Elicits precise biochemical causality (NMDA, CaMKII, PRPs).',
      },
      {
        id: 'stem-king-2',
        category: 'connection',
        stem: 'How does your proposal about LTP account for your partner’s concern regarding...?',
        purpose: 'Forces transactive integration across opposing viewpoints.',
      },
      {
        id: 'stem-king-3',
        category: 'strategic',
        stem: 'Under what physiological boundary condition would both mechanisms simultaneously be required?',
        purpose: 'Drives high-level dialectical synthesis.',
      },
    ],
    simulatedPeer: {
      name: 'Dr. Elena Vance (Cellular Neurophysiologist)',
      role: 'challenger',
      initialStance:
        'I maintain that late-LTP alone is sufficient for long-term memory trace persistence; homeostatic pruning is merely housekeeping, not an informational code.',
      epistemicStyle: 'rigorous_mechanistic',
      initialArgument:
        'If you block protein synthesis with anisomycin immediately after tetanus, late-LTP fails to persist beyond 3 hours. This proves that local translation of PRPs at the activated dendritic spine is the sole determinant of retention. Why do we need to invoke global depression?',
      counterArguments: [
        'Even if local tagging occurs, without activity-dependent heterosynaptic LTD, neighboring non-stimulated synapses would accidentally capture drifting PRPs and blur receptive fields.',
        'Consider the energy budget: if every learning episode only potentiated synapses without reciprocal depotentiation, cortical ATP demand would exceed metabolic caps within 48 hours.',
      ],
    },
  },
  {
    id: 'collab-distributed-raft-consensus',
    title: 'CAP Theorem & Multi-Raft Byzantine Consensus in Edge Networks',
    domain: 'distributed_systems',
    difficulty: 'advanced',
    centralDilemma:
      'In cross-region distributed edge clusters, network partitions and transient latency spikes force a strict trade-off between strict linearizable consistency (CP) and high client availability with monotonic reads (AP). Collaborators must design a hybrid consensus script that prevents split-brain while avoiding stalling critical edge mutations.',
    competingPerspectives: [
      {
        id: 'persp-strict-cp-raft',
        label: 'Strict CP Raft Quorum Replication',
        advocate: 'Formal Systems Architect',
        corePremise:
          'Every write must achieve quorum acknowledgement ($N/2 + 1$) before commit. Partitions must block minority partitions entirely.',
        primaryEvidence:
          'Prevents stale reads and double-spend mutations under arbitrary network splits.',
        vulnerability:
          'Edge nodes experiencing intermittent cellular uplink become 100% unavailable, causing cascaded mobile client timeouts.',
      },
      {
        id: 'persp-ap-crdt-eventual',
        label: 'Local First AP with CRDT Conflict Resolution',
        advocate: 'Edge Resilience Specialist',
        corePremise:
          'Nodes accept writes unconditionally using Conflict-Free Replicated Data Types (CRDTs), reconciling merges asynchronously on partition heal.',
        primaryEvidence:
          'Zero client latency spikes and 100% write availability on offline/partitioned mobile nodes.',
        vulnerability:
          'Cannot maintain global invariants such as unique inventory balance or serialized execution orders.',
      },
    ],
    invariantsForSynthesis: [
      {
        id: 'inv-hybrid-multi-raft-crdt',
        name: 'State-Partitioned Quorum / CRDT Dual-Path Routing',
        reconciliation:
          'Non-destructive commutative state mutations (append-only journals, counter metrics, collaborative text deltas) route via State-based CRDTs ensuring 100% edge availability; non-commutative zero-sum invariants (financial transactions, token transfers) require Raft lease-holder quorum validation.',
      },
    ],
    guidedKingStems: [
      {
        id: 'stem-king-edge-1',
        category: 'comprehension',
        stem: 'What is the exact failure mode when a minority partition receives...?',
        purpose: 'Elicits understanding of split-brain and stale reads.',
      },
      {
        id: 'stem-king-edge-2',
        category: 'connection',
        stem: 'How does using CRDTs on edge inputs interact with the Raft leader lease on the central cluster?',
        purpose: 'Forces coordination between opposing architectural paradigms.',
      },
      {
        id: 'stem-king-edge-3',
        category: 'strategic',
        stem: 'What classification rule partitions data types into CP-required vs AP-admissible without violating business invariants?',
        purpose: 'Promotes transactive dialectical synthesis.',
      },
    ],
    simulatedPeer: {
      name: 'Devon Patel (Principal Distributed Architect)',
      role: 'challenger',
      initialStance:
        'We cannot compromise on strict Raft linearizability. Allowing local-first writes on edge nodes opens the door to unresolvable invariant violations.',
      epistemicStyle: 'formal_safety_oriented',
      initialArgument:
        'If a node in a disconnected edge sub-network accepts writes that depend on global state, any reconciliation algorithm will eventually have to drop or rollback transactions. Rollbacks destroy user trust. How do you propose handling conflicting concurrent state changes without a quorum?',
      counterArguments: [
        'Pure CP causes the entire edge interface to freeze whenever an uplink satellite has high jitter. Users perceive an unavailable app as completely broken.',
        'Commutative operations like adding an event to an append-only log do not require global locking; mathematical lattices guarantee convergence without rollback.',
      ],
    },
  },
  {
    id: 'collab-climate-geoengineering',
    title: 'Stratospheric Aerosol Injection vs Direct Air Capture: Equity & Risk',
    domain: 'earth_climate_science',
    difficulty: 'intermediate',
    centralDilemma:
      'Global carbon emissions continue to outpace safe 1.5°C carbon budgets. Collaborators must resolve whether to deploy Stratospheric Aerosol Injection (SAI, rapid high-leverage planetary cooling with monsoon disruption risks) versus Direct Air Capture with Carbon Storage (DACCS, safe removal but high capital cost and decadal lag).',
    competingPerspectives: [
      {
        id: 'persp-sai-cooling',
        label: 'Rapid Deployment Stratospheric Aerosol Injection',
        advocate: 'Planetary Emergency Taskforce',
        corePremise:
          'Injecting sulfur dioxide into the lower stratosphere produces immediate albedo enhancement, arresting ice-sheet collapse and extreme heatwave mortalities within months at low cost.',
        primaryEvidence:
          'Mount Pinatubo 1991 eruption temporarily cooled global mean temperatures by 0.5°C.',
        vulnerability:
          'Termination shock risk if interrupted, plus regional disruption of South Asian and Sahelian monsoons.',
      },
      {
        id: 'persp-daccs-removal',
        label: 'Permanent Direct Air Capture & Carbon Storage',
        advocate: 'Carbon Mineralization Consortium',
        corePremise:
          'Chemically scrubbing CO₂ directly from ambient air and mineralizing it in basalt formations cures the root cause without altering solar insolation.',
        primaryEvidence:
          'Carbfix and Climeworks facilities demonstrate permanent subterranean mineralization in under two years.',
        vulnerability:
          'Massive parasitic energy demands (gigawatts per gigaton) and economic lag; cannot prevent tipping points over the next 15 years.',
      },
    ],
    invariantsForSynthesis: [
      {
        id: 'inv-staged-peak-shaving',
        name: 'MacMartin-Keith Peak-Shaving Temporal Bridge',
        reconciliation:
          'Limited, dynamically modulated SAI is used strictly as a temporary, fractional peak-shaving solar shield ($< 1.0\\text{W/m}^2$) solely to blunt deadly tipping points while DACCS and point-source mitigation scale to reduce atmospheric greenhouse gas concentrations, followed by scheduled phase-out.',
      },
    ],
    guidedKingStems: [
      {
        id: 'stem-king-climate-1',
        category: 'comprehension',
        stem: 'What is the physical mechanism causing monsoon disruption when SAI is deployed in the Northern Hemisphere?',
        purpose: 'Elicits understanding of Intertropical Convergence Zone (ITCZ) shifting.',
      },
      {
        id: 'stem-king-climate-2',
        category: 'connection',
        stem: 'How does the termination shock risk of SAI impact the capital scaling timeline for DACCS?',
        purpose: 'Coordinates temporal trade-offs across interventions.',
      },
      {
        id: 'stem-king-climate-3',
        category: 'strategic',
        stem: 'What governance metric triggers the mandatory down-ramping of aerosol injection as DACCS reaches scale?',
        purpose: 'Synthesizes long-term systemic stability.',
      },
    ],
    simulatedPeer: {
      name: 'Dr. Tariq Al-Mansoor (Atmospheric Physicist)',
      role: 'challenger',
      initialStance:
        'Aerosol injection is a moral hazard and ecological roulette. We should ban solar radiation management entirely and divert all capital into direct air capture and mitigation.',
      epistemicStyle: 'precautionary_equity',
      initialArgument:
        'Injecting aerosols does nothing for ocean acidification, and shifting the ITCZ could destroy agriculture for hundreds of millions of people in the Global South. How can you ethically justify putting the planet on artificial albedo life support?',
      counterArguments: [
        'If West Antarctic ice sheets destabilize this decade, sea levels will inundate coastal megacities before DACCS reaches gigaton scale. Moderate SAI is the only physical mechanism fast enough to prevent runaway albedo loss.',
        'Deploying a symmetric two-hemisphere injection profile minimizes ITCZ displacement, keeping precipitation changes well within historical natural variability.',
      ],
    },
  },
  {
    id: 'collab-crispr-gene-drive',
    title: 'CRISPR Gene Drives vs Sterile Insect Technique in Vector Control',
    domain: 'bioethics_population_genetics',
    difficulty: 'intermediate',
    centralDilemma:
      'Malaria claims over 600,000 lives annually. Collaborators must deliberate between deploying synthetic CRISPR-Cas9 homing gene drives (which bias inheritance to crash mosquito populations across entire continents with irreversible escape potential) versus Sterile Insect Technique / Wolbachia releases (safe, localized, but requiring continuous recurring multi-million dollar releases).',
    competingPerspectives: [
      {
        id: 'persp-homing-gene-drive',
        label: 'CRISPR Homology-Directed Homing Gene Drive',
        advocate: 'Molecular Genetics Pioneer',
        corePremise:
          'A super-Mendelian homing endonuclease drive targets female fertility genes, causing near 100% transmission and eradication of Anopheles gambiae with a single low-cost release.',
        primaryEvidence:
          'Cage trials demonstrate complete population suppression within 8 to 12 generations.',
        vulnerability:
          'Unconstrained geopolitical spread across sovereign borders, ecological niche vacancy, and potential horizontal gene transfer.',
      },
      {
        id: 'persp-wolbachia-sterile',
        label: 'Wolbachia Endosymbiont / Sterile Male Release',
        advocate: 'Eco-Systemic Conservationist',
        corePremise:
          'Releasing Wolbachia-infected mosquitoes blocks viral/parasite transmission through cytoplasmic incompatibility, or irradiated sterile males suppress density locally without altering wild genomes.',
        primaryEvidence:
          'World Mosquito Program in Indonesia reduced dengue incidence by 77% with zero non-target ecological impacts.',
        vulnerability:
          'Requires industrial rearing factories and thousands of recurring releases; fails in remote, conflict-affected rural regions.',
      },
    ],
    invariantsForSynthesis: [
      {
        id: 'inv-daisy-chain-drive',
        name: 'Esvelt Daisy-Chain Self-Limiting Gene Drive',
        reconciliation:
          'A split gene drive architecture where component A drives B, B drives C, and C confers the target suppression phenotype without self-propagation. Because each element is non-homing and loses copies through standard Mendelian inheritance, the drive self-exhausts after a predetermined number of generations, confining suppression to local municipal borders.',
      },
    ],
    guidedKingStems: [
      {
        id: 'stem-king-bio-1',
        category: 'comprehension',
        stem: 'How does non-homologous end joining (NHEJ) create resistance alleles against standard gene drives?',
        purpose: 'Probes molecular genetics mechanics.',
      },
      {
        id: 'stem-king-bio-2',
        category: 'connection',
        stem: 'In what way does the localized safety of Wolbachia address the ethical issue of sovereign consent in neighboring nations?',
        purpose: 'Coordinates bioethical constraints with biological delivery mechanisms.',
      },
      {
        id: 'stem-king-bio-3',
        category: 'strategic',
        stem: 'How does a multi-locus daisy-chain drive balance continent-wide eradication speed with local containment?',
        purpose: 'Facilitates transactive synthesis of genetic self-exhaustion.',
      },
    ],
    simulatedPeer: {
      name: 'Dr. Chidi Okafor (Epidemiologist & Bioethicist)',
      role: 'challenger',
      initialStance:
        'Standard gene drives represent an existential ecological gamble. Once released, an organism knows no political borders, making informed consent impossible.',
      epistemicStyle: 'bioethical_sovereignty',
      initialArgument:
        'Releasing a self-propagating Cas9 construct into wild populations could mutate or cross-hybridize into non-vector species. We cannot gamble evolutionary ecology when Wolbachia has already proven effective in field trials. What guarantees can you provide against trans-boundary invasion?',
      counterArguments: [
        'Wolbachia costs tens of millions of dollars per district and cannot reach isolated malaria hotspots in sub-Saharan Africa. Delaying gene drive deployment costs thousands of children’s lives every single month.',
        'Synthetic daisy-chain drives carry non-homing guide RNAs that deplete predictably, ensuring the drive mathematically dies out after 10 generations unless replenished by approved authorities.',
      ],
    },
  },
  {
    id: 'collab-quantum-decoherence',
    title: 'Majorana Zero Modes vs Transmon Surface Codes in Scalable Qubits',
    domain: 'quantum_information_science',
    difficulty: 'advanced',
    centralDilemma:
      'Achieving fault-tolerant quantum computing requires logical error rates below $10^{-12}$. Collaborators must resolve whether to pursue hardware-level topological protection (Majorana Zero Modes with non-Abelian braiding) versus active Quantum Error Correction using Transmon superconducting qubits running 2D Surface Codes with millions of physical ancilla qubits.',
    competingPerspectives: [
      {
        id: 'persp-topological-majorana',
        label: 'Hardware-Level Topological Protection (Majorana Qubits)',
        advocate: 'Condensed Matter Topological Physicist',
        corePremise:
          'Topological braiding of non-Abelian anyons in nanowire-superconductor heterostructures protects quantum information non-locally, eliminating the need for active error correction codes.',
        primaryEvidence:
          'Zero-bias conductance peaks in semiconductor-superconductor junctions demonstrate topological phase transition.',
        vulnerability:
          'Severe material fabrication hurdles, quasiparticle poisoning, and unproven high-fidelity braiding gates.',
      },
      {
        id: 'persp-surface-code-transmon',
        label: 'Active Quantum Error Correction (Transmon Surface Codes)',
        advocate: 'Superconducting Hardware Engineer',
        corePremise:
          'Using well-understood planar transmon qubits arranged in a square lattice running rotated surface codes detects bit-flip and phase-flip errors via syndrome extraction without measuring data qubits.',
        primaryEvidence:
          'Demonstrated physical error rates below the fault-tolerance threshold ($p < 10^{-3}$) in Sycamore and Willow processors.',
        vulnerability:
          'Enormous physical qubit overhead: requires $> 1,000$ noisy physical transmons per single logical qubit, creating extreme cryogenic heat-load bottlenecks.',
      },
    ],
    invariantsForSynthesis: [
      {
        id: 'inv-hybrid-topological-syndrome',
        name: 'Heterogeneous Topological-Surface Code Stack',
        reconciliation:
          'Topologically protected hardware primitives (or fluxonium qubits with intrinsic phase-slip resistance) serve as data qubits with raw error rates around $10^{-5}$, drastically shrinking the code distance required by the outer surface code and reducing physical ancilla overhead by two orders of magnitude.',
      },
    ],
    guidedKingStems: [
      {
        id: 'stem-king-quantum-1',
        category: 'comprehension',
        stem: 'Why does non-local storage of quantum information in Majorana pairs protect against local thermal fluctuations?',
        purpose: 'Tests understanding of topological decoherence immunity.',
      },
      {
        id: 'stem-king-quantum-2',
        category: 'connection',
        stem: 'How does the cryogenic cooling budget at 10mK constrain the scale of physical transmons in a 10,000-qubit dilution refrigerator?',
        purpose: 'Coordinates theoretical code requirements with hardware thermal engineering.',
      },
      {
        id: 'stem-king-quantum-3',
        category: 'strategic',
        stem: 'What threshold of physical gate fidelity makes topological qubits preferable over adding an extra layer of stabilizer ancillas?',
        purpose: 'Drives transactive quantitative trade-off analysis.',
      },
    ],
    simulatedPeer: {
      name: 'Dr. Liam Thorne (Superconducting Qubit Architect)',
      role: 'challenger',
      initialStance:
        'Majorana physics is fascinating condensed matter theory, but superconducting transmons have already crossed the fault-tolerance threshold today. Betting on topological qubits is a distraction.',
      epistemicStyle: 'empirical_engineering',
      initialArgument:
        'We have working transmon surface codes executing distance-5 syndrome extraction in real-time on real dilution refrigerators. Topological zero-bias conductance peaks have faced multiple retraction controversies. Why invest billions in unproven anyons when we can scale transmons with better microwave control?',
      counterArguments: [
        'Transmons require thousands of RF coaxial cables per logical qubit; a million-qubit processor would boil the liquid helium in minutes. Without intrinsic hardware protection, the dilution refrigerator cannot handle the thermal load.',
        'Fluxonium and topological circuits have shown coherence times orders of magnitude beyond transmons; combining topological data nodes with planar syndrome extraction solves the footprint crisis.',
      ],
    },
  },
]

// ── Transactive Evaluation & Feedback Engine ─────────────────────────────────

const TRANSACTIVE_KEYWORDS = [
  'because you stated',
  'building upon your',
  'contrary to what you proposed',
  'if we integrate',
  'however, your model overlooks',
  'to resolve this tension',
  'your point about',
  'whereas you argued',
  'to reconcile',
  'under the condition that',
  'as an extension of',
]

/**
 * Evaluates a learner's collaborative discourse dialogue against CSCL & Transactive Discourse principles.
 */
export function evaluateCollaborativeDiscourse(
  scenario: CollaborativeScenario,
  submission: DiscourseSubmission,
): CollaborativeEvaluation {
  const pedagogicalFeedback: string[] = []
  const strengths: string[] = []
  const vulnerabilities: string[] = []

  const learnerTurns = submission.dialogueTurns.filter((t) => t.speaker === 'learner')
  const totalLearnerTurns = Math.max(learnerTurns.length, 1)

  // 1. Transactive Discourse Index (TDI)
  const transactiveCounts: Record<string, number> = {
    transactive_critique: 0,
    transactive_extension: 0,
    transactive_synthesis: 0,
    transactive_justification: 0,
    non_transactive: 0,
  }

  let weightedTransactiveScore = 0

  for (const turn of learnerTurns) {
    const textLower = turn.text.toLowerCase()
    let act = turn.speechAct

    // Auto-detect transactivity if not explicitly tagged
    const hasTransactiveStem = TRANSACTIVE_KEYWORDS.some((kw) => textLower.includes(kw))
    if (act === 'non_transactive' && hasTransactiveStem) {
      if (textLower.includes('however') || textLower.includes('contrary')) {
        act = 'transactive_critique'
      } else if (textLower.includes('reconcile') || textLower.includes('integrate')) {
        act = 'transactive_synthesis'
      } else {
        act = 'transactive_extension'
      }
    }

    transactiveCounts[act] = (transactiveCounts[act] ?? 0) + 1

    if (act === 'transactive_synthesis') weightedTransactiveScore += 100
    else if (act === 'transactive_critique') weightedTransactiveScore += 85
    else if (act === 'transactive_extension') weightedTransactiveScore += 80
    else if (act === 'transactive_justification') weightedTransactiveScore += 70
    else weightedTransactiveScore += 20 // non-transactive parallel talk
  }

  const tdi = Math.min(100, Math.round(weightedTransactiveScore / totalLearnerTurns))

  const transactiveTurnRatio =
    (totalLearnerTurns - (transactiveCounts.non_transactive ?? 0)) / totalLearnerTurns

  if (transactiveTurnRatio >= 0.75) {
    strengths.push(
      'High Transactivity (Berkowitz & Gibbs 1983): Demonstrated strong cognitive operations on partner’s reasoning rather than isolated monologues.',
    )
  } else {
    vulnerabilities.push(
      'Cumulative or Parallel Talk: Several turns presented standalone ideas without explicitly operating on or challenging peer premises.',
    )
  }

  // 2. Epistemic Elaboration Depth (EED)
  const causalConnectives = [
    'because',
    'therefore',
    'consequently',
    'leads to',
    'due to',
    'inhibits',
    'activates',
    'modulates',
    'mechanistically',
    'induces',
    'prevents',
    'scales with',
    'reconcil',
    'triggers',
    'depends on',
    'regulat',
    'integrat',
    'maintains',
  ]

  const allLearnerText = [
    submission.learnerInitialPosition,
    ...learnerTurns.map((t) => t.text),
    submission.jointSynthesis,
  ]
    .join(' ')
    .toLowerCase()

  let causalHits = 0
  for (const conn of causalConnectives) {
    if (allLearnerText.includes(conn)) causalHits++
  }

  // Check synthesis depth
  const synthesisWords = submission.jointSynthesis.trim().split(/\s+/).filter(Boolean).length
  const synthesisDepthScore = Math.min(40, (synthesisWords / 25) * 40)

  const causalDepthScore = Math.min(60, (causalHits / 4) * 60)
  const eed = Math.min(100, Math.round(causalDepthScore + synthesisDepthScore))

  if (eed >= 75) {
    strengths.push(
      'Rich Epistemic Elaboration (Weinberger & Fischer 2006): Employed causal connectives and mechanistic warrants to structure discourse.',
    )
  } else {
    vulnerabilities.push(
      'Superficial Epistemic Justification: Assertions lacked deep causal mechanisms; incorporate more connective explanations.',
    )
  }

  // 3. Script Compliance Rigor (SCR)
  // Check 4-phase completion: Initial Position -> Dialogue Turns >= 2 -> Joint Synthesis -> Individual Transfer
  let scrPoints = 0
  if (submission.learnerInitialPosition.trim().length >= 25) scrPoints += 25
  if (learnerTurns.length >= 2) scrPoints += 25
  if (submission.jointSynthesis.trim().length >= 40) scrPoints += 25
  if (submission.individualTransferAnswer.trim().length >= 30) scrPoints += 25
  const scr = scrPoints

  if (scr === 100) {
    strengths.push(
      'Flawless Script Adherence (Fischer et al. 2013): Fully navigated all 4 collaborative phases from individual framing to joint synthesis.',
    )
  } else {
    vulnerabilities.push(
      'Script Incompletion: Skipped or produced minimal responses in one of the required collaborative stages.',
    )
  }

  // 4. Invariant Identification in Synthesis
  const synthesizedInvariantsIdentified: string[] = []
  const synthesisTextLower = submission.jointSynthesis.toLowerCase()

  for (const inv of scenario.invariantsForSynthesis) {
    const invKeywords = inv.name
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3)
    const matched = invKeywords.some((k) => synthesisTextLower.includes(k))
    if (
      matched ||
      synthesisTextLower.includes('reconcil') ||
      synthesisTextLower.includes('hybrid')
    ) {
      synthesizedInvariantsIdentified.push(inv.name)
    }
  }

  // 5. Composite Collaborative Epistemic Index (CEI)
  // CEI = 0.40 * TDI + 0.35 * EED + 0.25 * SCR
  const cei = Math.min(100, Math.round(tdi * 0.4 + eed * 0.35 + scr * 0.25))

  // 6. Maturity Tiers
  let maturityBand: CollaborativeEvaluation['maturityBand'] = 'parallel_individualist'
  if (cei >= 85 && synthesizedInvariantsIdentified.length > 0) {
    maturityBand = 'dialectical_synthesizer'
  } else if (cei >= 70) {
    maturityBand = 'transactive_critic'
  } else if (cei >= 50) {
    maturityBand = 'cumulative_agreer'
  }

  // Pedagogical Guidance
  if (maturityBand === 'dialectical_synthesizer') {
    pedagogicalFeedback.push(
      'Exemplary Transactive Synthesis (King 1999, Teasley 1997): You successfully operated on your peer’s premises, identified reciprocal constraints, and formulated a shared invariant model.',
    )
  } else if (maturityBand === 'transactive_critic') {
    pedagogicalFeedback.push(
      'Strong Critical Transactivity: You effectively critiqued and differentiated your peer’s assumptions. In your synthesis, focus on bridging both perspectives into a unified theoretical architecture.',
    )
  } else if (maturityBand === 'cumulative_agreer') {
    pedagogicalFeedback.push(
      'Cumulative Discourse Pattern (Mercer 1996): High consensus but low transactive tension. Use Alison King’s connection stems to challenge peer premises rather than merely validating them.',
    )
  } else {
    pedagogicalFeedback.push(
      'Parallel Individualism: Focus on referencing your partner’s specific assertions ("Because you argued X, consider Y") before advancing new claims.',
    )
  }

  return {
    tdi,
    eed,
    scr,
    cei,
    maturityBand,
    transactiveCounts,
    synthesizedInvariantsIdentified,
    strengths,
    vulnerabilities,
    pedagogicalFeedback,
  }
}

/**
 * Generates an automated, Socratic peer response turn based on the simulated peer profile and current discourse state.
 */
export function generateCollaborativePeerTurn(
  scenario: CollaborativeScenario,
  learnerTurnText: string,
  turnIndex: number,
): CollaborativeTurn {
  const peer = scenario.simulatedPeer
  const counterArg =
    peer.counterArguments[turnIndex % peer.counterArguments.length] ?? peer.counterArguments[0]!

  let responseText = ''
  let speechAct: TransactiveAct = 'transactive_critique'

  if (turnIndex === 0) {
    responseText = `${peer.initialArgument} Building upon that: how does your initial proposition address the vulnerability in ${scenario.competingPerspectives[0]?.label ?? 'your perspective'}?`
    speechAct = 'transactive_critique'
  } else {
    responseText = `I hear your reasoning, but consider this boundary condition: ${counterArg} How can we reconcile this without invalidating your primary premise?`
    speechAct = 'transactive_extension'
  }

  return {
    id: `turn-peer-${scenario.id}-${Date.now()}`,
    speaker: 'peer_partner',
    role: peer.role,
    text: responseText,
    speechAct,
    epistemicKeywords: ['boundary_condition', 'counter_evidence', 'reconciliation'],
  }
}

/**
 * Generates calibrated FSRS-6 spaced repetition cards derived from collaborative discourse insights.
 */
export function generateCollaborativeFSRSDeck(
  scenario: CollaborativeScenario,
  evaluation: CollaborativeEvaluation,
): CalibratedCollaborativeDeck {
  const ceiFactor = evaluation.cei / 100
  const baseStability = parseFloat((4.0 + ceiFactor * 4.0).toFixed(1)) // 4.0d to 8.0d
  const baseDifficulty = parseFloat((6.5 - ceiFactor * 2.5).toFixed(1)) // 6.5 down to 4.0

  const cards: CalibratedCollaborativeCard[] = [
    {
      id: `collab-card-${scenario.id}-1`,
      cardType: 'transactive_warrant',
      front: `[Collaborative Dialectics: ${scenario.title}]\nWhat is the primary vulnerability in the "${scenario.competingPerspectives[0]?.label}" stance, and how did your transactive critique expose it?`,
      back: `Core Vulnerability:\n${scenario.competingPerspectives[0]?.vulnerability}\n\nTransactive Counter-Evidence:\n${scenario.competingPerspectives[1]?.primaryEvidence}`,
      scenarioTitle: scenario.title,
      fsrsParameters: {
        stability: baseStability,
        difficulty: baseDifficulty,
      },
    },
    {
      id: `collab-card-${scenario.id}-2`,
      cardType: 'counter_rebuttal',
      front: `[Transactive Defense: ${scenario.title}]\nWhen your partner argued "${scenario.simulatedPeer.counterArguments[0]}", what mechanistic warrant preserves system stability?`,
      back: `Mechanistic Warrant:\n${scenario.invariantsForSynthesis[0]?.reconciliation ?? 'Coordinated homeostatic regulation prevents runaway instability.'}`,
      scenarioTitle: scenario.title,
      fsrsParameters: {
        stability: baseStability,
        difficulty: baseDifficulty,
      },
    },
    {
      id: `collab-card-${scenario.id}-3`,
      cardType: 'joint_invariant',
      front: `[Joint Dialectical Synthesis: ${scenario.title}]\nWhat invariant principle reconciles both competing perspectives in ${scenario.title}?`,
      back: `Invariant Synthesis:\n${scenario.invariantsForSynthesis.map((inv) => `• ${inv.name}: ${inv.reconciliation}`).join('\n\n')}`,
      scenarioTitle: scenario.title,
      fsrsParameters: {
        stability: parseFloat((baseStability * 1.15).toFixed(1)),
        difficulty: parseFloat((baseDifficulty * 0.9).toFixed(1)),
      },
    },
    {
      id: `collab-card-${scenario.id}-4`,
      cardType: 'far_transfer',
      front: `[Far Transfer Application: ${scenario.title}]\nHow does the synthesized invariant from ${scenario.title} apply when scaling to unexpected extreme boundary conditions?`,
      back: `Transfer Rule:\nCoordinating the fast local response with slow global homeostatic thresholds preserves dynamic range and prevents catastrophe across any complex adaptive network.`,
      scenarioTitle: scenario.title,
      fsrsParameters: {
        stability: baseStability,
        difficulty: baseDifficulty,
      },
    },
  ]

  return {
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    ceiBaseline: evaluation.cei,
    cards,
  }
}

// ── Route-level input schemas (TD-02) ──────────────────────────────────────

export const collaborativePartnerInputSchema = z.object({
  scenarioId: z.string(),
  learnerTurnText: z.string().min(1).default(''),
  turnIndex: z.number().int().nonnegative().default(0),
})
export type CollaborativePartnerInput = z.infer<typeof collaborativePartnerInputSchema>

export const collaborativeDeckInputSchema = z.object({
  scenarioId: z.string(),
  ceiBaseline: z.number().min(0).max(100).optional(),
})
export type CollaborativeDeckInput = z.infer<typeof collaborativeDeckInputSchema>
