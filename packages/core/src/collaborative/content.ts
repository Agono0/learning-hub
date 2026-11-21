/**
 * Scenario corpora for the collaborative scripts & transactive discourse studio engine (TD-05).
 *
 * CONTENT, not logic: the canonical multidisciplinary collaborative dilemma
 * library — competing perspectives, synthesis invariants, guided King (1997, 1999)
 * question stems and simulated peer challenger profiles. Kept out of
 * `collaborative-engine.ts` so engine diffs stay about algorithms, not data. Types
 * are imported type-only from the engine (type-only cycles are safe); the engine
 * re-exports this constant so every existing import path keeps working.
 *
 * @module @learning-hub/core/collaborative
 */
import type { CollaborativeScenario } from './collaborative-engine'
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
