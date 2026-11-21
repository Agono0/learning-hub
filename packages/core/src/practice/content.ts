/**
 * Calibrated adaptive question banks for the CAT/IRT engine (TD-05).
 *
 * CONTENT, not logic: the calibrated multi-domain adaptive question item banks
 * (neuroscience of memory, distributed systems, cognitive psychology) —
 * IRT-annotated items (3PL a/b/c parameters, Bloom levels, distractor
 * rationales) with no selection, scoring or session logic. Kept out of
 * `cat-engine.ts` — which sits on the one-grading-path (executeReview) pipeline —
 * so engine diffs stay about algorithms, not data. The `AdaptiveQuestionItem`
 * type stays in the engine (type-only import here — type-only cycles are safe);
 * the engine re-exports this constant so every existing import path keeps
 * working.
 *
 * @module @learning-hub/core/practice
 */

import type { AdaptiveQuestionItem } from './cat-engine'

export const CALIBRATED_QUESTION_BANKS: Record<string, AdaptiveQuestionItem[]> = {
  neuroscience_memory: [
    {
      id: 'neuro-01',
      domain: 'Neurobiology of Memory',
      bloomLevel: 'remember',
      prompt:
        'Which anatomical subfield of the hippocampus gives rise to Schaffer collateral axons synapsing onto CA1 pyramidal dendrites?',
      options: [
        'Dentate Gyrus granule cells',
        'CA3 pyramidal neurons',
        'Subiculum projection neurons',
        'Entorhinal cortex layer II',
      ],
      correctOptionIndex: 1,
      distractorRationales: [
        'Dentate gyrus granule cells give rise to mossy fibers, not Schaffer collaterals.',
        'Correct: CA3 pyramidal cell axons bifurcate into recurrent collaterals and Schaffer collaterals projecting to CA1.',
        'The subiculum is the primary hippocampal output structure receiving CA1 input.',
        'Entorhinal cortex layer II gives rise to the perforant path to the dentate gyrus.',
      ],
      explanation:
        'In the canonical trisynaptic loop, CA3 pyramidal neurons send Schaffer collateral projections to apical dendrites of CA1 pyramidal cells.',
      conceptTags: ['hippocampus', 'trisynaptic-circuit', 'Schaffer-collaterals'],
      discrimination: 1.45,
      difficulty: -0.8,
      guessing: 0.25,
    },
    {
      id: 'neuro-02',
      domain: 'Neurobiology of Memory',
      bloomLevel: 'understand',
      prompt:
        'Why does the induction of classical NMDAR-dependent Long-Term Potentiation (LTP) strictly require simultaneous presynaptic glutamate release and postsynaptic depolarization?',
      options: [
        'Glutamate cannot bind to NMDA receptors until AMPA receptors phosphorylate CaMKII.',
        'Magnesium (Mg2+) ions physically block the NMDA channel pore at resting membrane potentials and are only repelled by postsynaptic depolarization.',
        'Calcium influx through voltage-gated sodium channels is required to synthesize retrograde nitric oxide.',
        'Postsynaptic GABAergic interneurons must be inhibited before presynaptic vesicle fusion can occur.',
      ],
      correctOptionIndex: 1,
      distractorRationales: [
        'Glutamate binds to NMDARs regardless of CaMKII phosphorylation.',
        'Correct: The voltage-dependent Mg2+ block is expelled electrostatically upon postsynaptic depolarization, allowing Ca2+ influx.',
        'Nitric oxide is synthesized downstream of Ca2+/calmodulin, not sodium channel activation.',
        'GABAergic inhibition modulates net depolarization but is not the biophysical gating mechanism of the NMDAR pore.',
      ],
      explanation:
        'The NMDA receptor operates as a molecular coincidence detector because extracellular Mg2+ blocks the pore at resting potentials (-70 mV) and is expelled only when the postsynaptic spine is depolarized (-30 mV).',
      conceptTags: ['LTP', 'NMDA', 'coincidence-detector', 'magnesium-block'],
      discrimination: 1.8,
      difficulty: 0.1,
      guessing: 0.25,
    },
    {
      id: 'neuro-03',
      domain: 'Neurobiology of Memory',
      bloomLevel: 'apply',
      prompt:
        'A researcher applies an anisomycin protein synthesis inhibitor 15 minutes AFTER high-frequency stimulation in hippocampal slices. What electrophysiological trajectory is observed over the next 4 hours?',
      options: [
        'Synaptic transmission collapses immediately to baseline within 5 minutes.',
        'Early LTP (E-LTP) is established normally for ~60–90 minutes, but fails to transition into Late LTP (L-LTP) and decays to baseline.',
        'Both E-LTP and L-LTP remain permanently elevated because protein synthesis is only required before stimulation.',
        'Long-Term Depression (LTD) is paradoxically induced due to runaway phosphatase calcineurin activity.',
      ],
      correctOptionIndex: 1,
      distractorRationales: [
        'Early LTP depends on post-translational modification (CaMKII autophosphorylation) and AMPAR insertion, not de novo protein translation.',
        'Correct: E-LTP persists for 1-2 hours via existing synaptic proteins, but maintenance beyond 2 hours (L-LTP) requires transcription and de novo protein synthesis.',
        'L-LTP strictly requires protein synthesis; anisomycin destroys consolidation permanence.',
        'LTD is not induced by protein synthesis blockade alone.',
      ],
      explanation:
        'Early LTP is protein synthesis-independent (relying on phosphorylation of AMPARs). Late LTP requires gene expression (CREB) and de novo protein synthesis (PKM-zeta, BDNF) for structural remodeling.',
      conceptTags: ['LTP-maintenance', 'protein-synthesis', 'anisomycin', 'synaptic-consolidation'],
      discrimination: 2.1,
      difficulty: 0.85,
      guessing: 0.25,
    },
    {
      id: 'neuro-04',
      domain: 'Neurobiology of Memory',
      bloomLevel: 'analyze',
      prompt:
        'Under the Synaptic Tagging and Capture (STC) hypothesis (Frey & Morris 1997), how can a weak subthreshold stimulus at Synapse S1 yield sustained Late-LTP lasting > 8 hours?',
      options: [
        'Synapse S1 must be stimulated twice within 10 milliseconds to double intracellular sodium.',
        'A strong stimulus at an independent Synapse S2 in the same neuron triggers somatic protein synthesis, and the PRPs are captured by the synaptic tag at S1.',
        'Retrograde BDNF diffusing through the extracellular matrix overrides the requirement for postsynaptic receptor trafficking.',
        'Astrocytic calcium waves selectively supply ATP exclusively to the unpotentiated synapse.',
      ],
      correctOptionIndex: 1,
      distractorRationales: [
        'Subthreshold stimulation cannot produce PRPs on its own via paired pulse facilitation.',
        'Correct: The weak stimulus sets a local "synaptic tag" at S1. A strong heterosynaptic stimulus at S2 generates Plasticity-Related Proteins (PRPs) that diffuse cell-wide and are captured by S1.',
        'BDNF acts locally and does not bypass the intracellular capture mechanism.',
        'Astrocytes modulate synaptic transmission but do not execute the STC intracellular capture cascade.',
      ],
      explanation:
        'Synaptic Tagging & Capture decouples the local setting of a synaptic tag (cytoskeletal/CaMKII mark) from the cell-wide synthesis of Plasticity-Related Proteins (PRPs).',
      conceptTags: ['synaptic-tagging', 'STC', 'plasticity-related-proteins'],
      discrimination: 2.3,
      difficulty: 1.45,
      guessing: 0.25,
    },
  ],
  distributed_consensus: [
    {
      id: 'dist-01',
      domain: 'Distributed Computer Systems',
      bloomLevel: 'understand',
      prompt:
        'In the Raft consensus algorithm, how does a candidate guarantee that it cannot overwrite previously committed log entries upon winning an election?',
      options: [
        'The candidate queries the previous leader for its uncompacted commit index.',
        'A candidate’s RequestVote RPC is rejected by any voter whose own log is more up-to-date (higher term, or longer log at same term).',
        'Candidates write a distributed lock entry into ZooKeeper before broadcasting heartbeats.',
        'Voters only grant votes if the candidate has fewer log entries to minimize network serialization overhead.',
      ],
      correctOptionIndex: 1,
      distractorRationales: [
        'The previous leader may be dead or partitioned; Raft requires no coordinator query.',
        'Correct: Raft enforces the Election Safety Property: a voter denies its vote if its own log is more up-to-date than the candidate’s log.',
        'Raft is self-contained and uses no external coordination service.',
        'Candidates with shorter logs are missing recent commits and are strictly rejected.',
      ],
      explanation:
        'Raft guarantees the Leader Completeness Property: if a log entry is committed in a given term, that entry will be present in the logs of the leaders for all higher-numbered terms.',
      conceptTags: ['raft', 'election-safety', 'consensus', 'leader-completeness'],
      discrimination: 1.6,
      difficulty: -0.2,
      guessing: 0.25,
    },
    {
      id: 'dist-02',
      domain: 'Distributed Computer Systems',
      bloomLevel: 'apply',
      prompt:
        'Under the CAP Theorem, when a network partition P divides a cluster into two equal halves {N1, N2} and {N3, N4}, why cannot a system simultaneously maintain linearizable Consistency and high Availability?',
      options: [
        'Network partitions cause hardware clock drift exceeding 200 milliseconds.',
        'Writes accepted in partition {N1, N2} cannot be communicated to {N3, N4}, forcing nodes in {N3, N4} to either return stale/divergent data (violating Consistency) or reject requests (violating Availability).',
        'Byzantine nodes spontaneously inject forged signatures during packet loss.',
        'TCP sockets automatically terminate when inter-rack latency exceeds 50 milliseconds.',
      ],
      correctOptionIndex: 1,
      distractorRationales: [
        'Partitions do not alter quartz clock oscillator frequencies.',
        'Correct: If inter-partition communication is severed, nodes must either proceed independently (diverging) or wait/fail (refusing availability).',
        'CAP assumes crash-recovery / fail-stop models, not arbitrary Byzantine malice.',
        'Socket timeouts reflect software settings, not the theoretical impossibility proof.',
      ],
      explanation:
        'Gilbert & Lynch (2002) proved that in an asynchronous network with partitions, no distributed algorithm can guarantee that every non-failing node returns a response that matches total order read-after-write consistency.',
      conceptTags: ['CAP-theorem', 'linearizability', 'partitions', 'availability'],
      discrimination: 1.9,
      difficulty: 0.3,
      guessing: 0.25,
    },
    {
      id: 'dist-03',
      domain: 'Distributed Computer Systems',
      bloomLevel: 'evaluate',
      prompt:
        'A system uses Conflict-Free Replicated Data Types (CRDTs) to bypass CAP availability limits. Under which mathematical precondition is convergence guaranteed without coordination?',
      options: [
        'State transitions form a bounded semi-lattice where the merge operation is associative, commutative, and idempotent.',
        'Every message must be delivered in strict FIFO order across a single TCP stream.',
        'Clock drift across nodes must be synchronized to within 1 microsecond via atomic TrueTime hardware.',
        'Write operations must be serialized through a single Raft state machine.',
      ],
      correctOptionIndex: 0,
      distractorRationales: [
        'Correct: State-based CRDTs (CvRDT) require a join-semilattice where merge(A, B) = merge(B, A) and merge(A, A) = A.',
        'CRDTs are specifically designed to tolerate out-of-order and duplicated message delivery.',
        'Hardware clocks are not required for semi-lattice algebraic convergence.',
        'Raft introduces coordinated consensus, which CRDTs deliberately avoid.',
      ],
      explanation:
        'CRDTs achieve Strong Eventual Consistency (SEC) because state transitions commute, associate, and are idempotent (join-semilattice), guaranteeing identical states once all updates are delivered.',
      conceptTags: ['crdt', 'join-semilattice', 'eventual-consistency', 'idempotency'],
      discrimination: 2.2,
      difficulty: 1.2,
      guessing: 0.25,
    },
  ],
  cognitive_psychology: [
    {
      id: 'cog-01',
      domain: 'Cognitive Science & Memory',
      bloomLevel: 'understand',
      prompt:
        'In the Free Spaced Repetition Scheduler (FSRS) algorithm, what does the Stability (S) parameter formally represent?',
      options: [
        'The absolute number of times a card has been reviewed since creation.',
        'The time interval in days required for the probability of successful recall (retrievability R) to decay from 100% to 90%.',
        'The subjective cognitive difficulty rated by the learner on a 1-to-4 scale.',
        'The amount of working memory load imposed by the question stem.',
      ],
      correctOptionIndex: 1,
      distractorRationales: [
        'Review count is review history (reps), not stability.',
        'Correct: FSRS defines stability S as the duration (in days) over which retention drops from 1.0 to the target request retention threshold (default R = 0.9).',
        'Subjective difficulty is the D parameter in FSRS.',
        'Working memory load is cognitive load (Sweller), not memory stability.',
      ],
      explanation:
        'In the DSR (Difficulty, Stability, Retrievability) memory model, Stability S is defined as the time needed for Retrievability R to decay from 1.0 to 0.90 under the power forgetting curve R(t) = (1 + factor * t / S)^decay.',
      conceptTags: ['FSRS', 'stability', 'DSR-model', 'retrievability'],
      discrimination: 1.7,
      difficulty: -0.4,
      guessing: 0.25,
    },
    {
      id: 'cog-02',
      domain: 'Cognitive Science & Memory',
      bloomLevel: 'apply',
      prompt:
        'According to Cognitive Load Theory (Sweller 1988), which instructional design intervention most effectively reduces extraneous cognitive load when teaching multi-component diagrams?',
      options: [
        'Placing textual explanations directly adjacent to or integrated within the corresponding visual elements (Split-Attention Effect elimination).',
        'Doubling the number of complex formulas displayed simultaneously on a single slide.',
        'Requiring students to search through an appendix for symbol definitions while inspecting the graph.',
        'Playing loud rhythmic music to stimulate dopamine release during difficult problem-solving.',
      ],
      correctOptionIndex: 0,
      distractorRationales: [
        'Correct: Integrating text and visual elements eliminates the split-attention effect, freeing working memory capacity for germane schema construction.',
        'Displaying multiple redundant formulas increases extraneous cognitive load.',
        'Appendix searching creates severe split-attention and spatial search overhead.',
        'Extraneous audio competes for phonological loop bandwidth in Baddeley’s working memory model.',
      ],
      explanation:
        'The Split-Attention Effect occurs when learners must mentally integrate disparate visual and textual sources of information. Physical integration eliminates unnecessary visual search.',
      conceptTags: ['cognitive-load', 'split-attention', 'Sweller', 'instructional-design'],
      discrimination: 1.85,
      difficulty: 0.2,
      guessing: 0.25,
    },
  ],
}
