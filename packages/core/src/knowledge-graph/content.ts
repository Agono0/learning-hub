/**
 * Calibrated multi-domain concept schema corpora for the schema distillation
 * engine (TD-05).
 *
 * CONTENT, not logic: the calibrated Ausubel/Novak concept schema maps
 * (cognitive memory architecture, distributed consensus hierarchy, transformer
 * attention mechanisms) with their anchor nodes, propositional links, cross-link
 * targets and validity scores. Kept out of `schema-distillation.ts` so engine
 * diffs stay about algorithms, not data. The `ConceptSchemaMap` type stays in
 * the engine (type-only import here — type-only cycles are safe); the engine
 * imports and re-exports this constant so every existing import path keeps
 * working.
 *
 * @module @learning-hub/core/knowledge-graph
 */

import type { ConceptSchemaMap } from './schema-distillation'

export const CALIBRATED_CONCEPT_SCHEMAS: Record<string, ConceptSchemaMap> = {
  cognitive_memory_architecture: {
    id: 'cognitive_memory_architecture',
    title: 'Human Memory & Epistemic Schema Consolidation',
    domain: 'cognitive_science',
    rootConceptId: 'cma_wm',
    targetCrossLinkCount: 3,
    nodes: [
      {
        id: 'cma_wm',
        label: 'Working Memory (WM)',
        hierarchicalLevel: 1,
        subsumptionRole: 'root_anchor',
        definition:
          'Capacity-limited executive workspace buffering 4 ± 1 chunks (Cowan 2001; Baddeley 2000).',
        domain: 'cognitive_science',
        examples: ['Phonological Loop', 'Visuospatial Sketchpad', 'Central Executive'],
        isAnchor: true,
      },
      {
        id: 'cma_clt',
        label: 'Cognitive Load Theory',
        hierarchicalLevel: 2,
        subsumptionRole: 'correlative_subsumption',
        definition:
          'Instructional model quantifying intrinsic, extraneous, and germane load (Sweller 1988, 2010).',
        domain: 'cognitive_science',
        examples: ['Split-Attention Effect', 'Worked-Example Fading', 'Modality Effect'],
      },
      {
        id: 'cma_ltm',
        label: 'Long-Term Memory (LTM)',
        hierarchicalLevel: 2,
        subsumptionRole: 'derivative_subsumption',
        definition:
          'Virtually boundless repository of automated schemas and semantic networks (Tulving 1972).',
        domain: 'cognitive_science',
        examples: ['Declarative Memory', 'Procedural Automations', 'Episodic Traces'],
      },
      {
        id: 'cma_consolidation',
        label: 'Systems Memory Consolidation',
        hierarchicalLevel: 3,
        subsumptionRole: 'correlative_subsumption',
        definition:
          'Time-dependent transfer of episodic traces from hippocampus to neocortex during SWS sleep (Diekelmann & Born 2010).',
        domain: 'neuroscience',
        examples: [
          'Slow-Wave Sleep Replay',
          'Targeted Memory Reactivation (TMR)',
          'Sharp-Wave Ripples',
        ],
      },
      {
        id: 'cma_fsrs',
        label: 'FSRS-6 Spaced Repetition',
        hierarchicalLevel: 3,
        subsumptionRole: 'derivative_subsumption',
        definition:
          'Modern memory scheduling algorithm modeling stability S and difficulty D under power decay R = (1 + factor * t / S)^decay (Ye et al. 2024).',
        domain: 'learning_algorithms',
        examples: ['Optimal Retrievability Targeting', 'Stability Matrix Optimization'],
      },
    ],
    links: [
      {
        id: 'l_cma_1',
        sourceId: 'cma_wm',
        targetId: 'cma_clt',
        linkingPhrase: 'imposes hard capacity constraints upon',
        propositionType: 'hierarchical_subsumption',
        scientificValidityScore: 1.0,
        semanticRationale:
          'Sweller’s Cognitive Load Theory is directly founded upon the finite capacity of Working Memory.',
      },
      {
        id: 'l_cma_2',
        sourceId: 'cma_wm',
        targetId: 'cma_ltm',
        linkingPhrase: 'retrieves automated schemas from',
        propositionType: 'hierarchical_subsumption',
        scientificValidityScore: 0.95,
        semanticRationale:
          'Automated schemas in LTM act as single chunks in WM, bypassing capacity limits.',
      },
      {
        id: 'l_cma_3',
        sourceId: 'cma_ltm',
        targetId: 'cma_consolidation',
        linkingPhrase: 'is structurally stabilized via',
        propositionType: 'causal_mechanism',
        scientificValidityScore: 0.95,
        semanticRationale:
          'Hippocampal-neocortical dialogue transforms labile memories into durable long-term storage.',
      },
      {
        id: 'l_cma_4',
        sourceId: 'cma_ltm',
        targetId: 'cma_fsrs',
        linkingPhrase: 'is quantitatively scheduled by',
        propositionType: 'correlative_qualification',
        scientificValidityScore: 0.9,
        semanticRationale:
          'FSRS mathematically models the stability decay curves of memories residing in LTM.',
      },
      {
        id: 'l_cma_5',
        sourceId: 'cma_clt',
        targetId: 'cma_fsrs',
        linkingPhrase: 'informs desired retention targets to balance cognitive load in',
        propositionType: 'cross_link_synthesis',
        scientificValidityScore: 0.95,
        semanticRationale:
          'Targeting higher retrievability in FSRS lowers working memory cognitive load during active retrieval practice.',
        isCrossBranchLink: true,
      },
    ],
  },

  distributed_consensus_hierarchy: {
    id: 'distributed_consensus_hierarchy',
    title: 'Distributed Consensus & Quorum State Replication',
    domain: 'distributed_systems',
    rootConceptId: 'dch_smr',
    targetCrossLinkCount: 3,
    nodes: [
      {
        id: 'dch_smr',
        label: 'State Machine Replication (SMR)',
        hierarchicalLevel: 1,
        subsumptionRole: 'root_anchor',
        definition:
          'Architectural paradigm where multiple distributed replicas execute an identical sequence of deterministic commands (Schneider 1990).',
        domain: 'distributed_systems',
        examples: ['Deterministic State Transitions', 'Replicated Append-Only Logs'],
        isAnchor: true,
      },
      {
        id: 'dch_flp',
        label: 'FLP Impossibility Result',
        hierarchicalLevel: 2,
        subsumptionRole: 'correlative_subsumption',
        definition:
          'Fischer-Lynch-Paterson (1985) theorem: no deterministic asynchronous consensus algorithm can guarantee liveness with even one unannounced crash.',
        domain: 'distributed_systems',
        examples: ['Asynchronous Bounded Delay Fallacy', 'Partial Synchrony Assumption'],
      },
      {
        id: 'dch_paxos',
        label: 'Paxos Consensus Synod',
        hierarchicalLevel: 2,
        subsumptionRole: 'derivative_subsumption',
        definition:
          'Lamport (1998) two-phase consensus protocol guaranteeing safety over asynchronous channels via majority proposal numbers.',
        domain: 'distributed_systems',
        examples: ['Phase 1a Prepare / 1b Promise', 'Phase 2a Accept / 2b Accepted'],
      },
      {
        id: 'dch_raft',
        label: 'Raft Consensus Protocol',
        hierarchicalLevel: 3,
        subsumptionRole: 'derivative_subsumption',
        definition:
          'Decomposed consensus protocol equivalent to Multi-Paxos using strong leader leases and log matching invariants (Ongaro 2014).',
        domain: 'distributed_systems',
        examples: ['Leader Election', 'Log Replication', 'Leader Completeness'],
      },
      {
        id: 'dch_quorum',
        label: 'Majority Quorum Intersection',
        hierarchicalLevel: 3,
        subsumptionRole: 'superordinate_synthesis',
        definition:
          'Pigeonhole property ensuring any two majority subsets (⌊N/2⌋ + 1) in a cluster of N nodes share at least one witness node (Gifford 1979).',
        domain: 'distributed_systems',
        examples: ['Overlapping Voter Witness', 'Read-Write Quorum Invariant'],
      },
    ],
    links: [
      {
        id: 'l_dch_1',
        sourceId: 'dch_smr',
        targetId: 'dch_paxos',
        linkingPhrase: 'is formally guaranteed by',
        propositionType: 'hierarchical_subsumption',
        scientificValidityScore: 1.0,
        semanticRationale:
          'Paxos provides the underlying consensus engine enabling fault-tolerant State Machine Replication.',
      },
      {
        id: 'l_dch_2',
        sourceId: 'dch_smr',
        targetId: 'dch_flp',
        linkingPhrase: 'is bounded by the theoretical limits of',
        propositionType: 'boundary_constraint',
        scientificValidityScore: 1.0,
        semanticRationale:
          'FLP establishes that asynchronous SMR must sacrifice deterministic termination during network partitions.',
      },
      {
        id: 'l_dch_3',
        sourceId: 'dch_paxos',
        targetId: 'dch_raft',
        linkingPhrase: 'is reformulated for human understandability into',
        propositionType: 'correlative_qualification',
        scientificValidityScore: 0.95,
        semanticRationale:
          'Raft decomposes Paxos into discrete leader election and log replication stages.',
      },
      {
        id: 'l_dch_4',
        sourceId: 'dch_paxos',
        targetId: 'dch_quorum',
        linkingPhrase: 'enforces commit safety via',
        propositionType: 'causal_mechanism',
        scientificValidityScore: 1.0,
        semanticRationale:
          'Quorum intersection guarantees that the highest proposal number is observed by subsequent leaders.',
      },
      {
        id: 'l_dch_5',
        sourceId: 'dch_raft',
        targetId: 'dch_quorum',
        linkingPhrase: 'proves leader completeness through',
        propositionType: 'cross_link_synthesis',
        scientificValidityScore: 1.0,
        semanticRationale:
          'Raft uses majority election quorums intersecting commit quorums to guarantee new leaders contain all committed entries.',
        isCrossBranchLink: true,
      },
    ],
  },

  transformer_attention_mechanisms: {
    id: 'transformer_attention_mechanisms',
    title: 'Transformer Architecture & Self-Attention Foundations',
    domain: 'machine_learning',
    rootConceptId: 'tam_transformer',
    targetCrossLinkCount: 3,
    nodes: [
      {
        id: 'tam_transformer',
        label: 'Transformer Architecture',
        hierarchicalLevel: 1,
        subsumptionRole: 'root_anchor',
        definition:
          'Sequence transduction model relying entirely on self-attention mechanisms without recurrence or convolution (Vaswani et al. 2017).',
        domain: 'machine_learning',
        examples: ['Encoder-Decoder Networks', 'Autoregressive Decoder LLMs'],
        isAnchor: true,
      },
      {
        id: 'tam_mha',
        label: 'Scaled Dot-Product Multi-Head Attention',
        hierarchicalLevel: 2,
        subsumptionRole: 'derivative_subsumption',
        definition:
          'Linear projection of queries, keys, and values into parallel subspace heads computed as Softmax(QK^T / sqrt(d_k))V.',
        domain: 'machine_learning',
        examples: ['8-Head Attention in Base Transformer', 'Multi-Query Attention (MQA)'],
      },
      {
        id: 'tam_pos_encoding',
        label: 'Positional Encoding (Sinusoidal & RoPE)',
        hierarchicalLevel: 2,
        subsumptionRole: 'correlative_subsumption',
        definition:
          'Deterministic or learned vectors injected into input embeddings to supply permutation-invariant attention with sequence order information (Su et al. 2021).',
        domain: 'machine_learning',
        examples: ['Sinusoidal Absolute Encoding', 'Rotary Position Embedding (RoPE)'],
      },
      {
        id: 'tam_kv_cache',
        label: 'Autoregressive Key-Value Cache',
        hierarchicalLevel: 3,
        subsumptionRole: 'derivative_subsumption',
        definition:
          'Inference runtime optimization caching past computed key and value tensors to prevent O(N^2) recomputation during token generation.',
        domain: 'machine_learning',
        examples: ['PagedAttention in vLLM', 'Static KV Buffer Allocation'],
      },
      {
        id: 'tam_flash_attention',
        label: 'FlashAttention IO-Aware Tiling',
        hierarchicalLevel: 3,
        subsumptionRole: 'superordinate_synthesis',
        definition:
          'Exact attention algorithm utilizing SRAM tiling and online softmax scaling to avoid High Bandwidth Memory (HBM) read/write bottlenecks (Dao et al. 2022).',
        domain: 'machine_learning',
        examples: ['Tiled Kernel Fusion', 'Online Softmax Normalization'],
      },
    ],
    links: [
      {
        id: 'l_tam_1',
        sourceId: 'tam_transformer',
        targetId: 'tam_mha',
        linkingPhrase: 'models token contextual dependencies via',
        propositionType: 'causal_mechanism',
        scientificValidityScore: 1.0,
        semanticRationale:
          'Multi-head attention allows the model to jointly attend to information from different representation subspaces at different positions.',
      },
      {
        id: 'l_tam_2',
        sourceId: 'tam_transformer',
        targetId: 'tam_pos_encoding',
        linkingPhrase: 'restores permutation order invariance using',
        propositionType: 'hierarchical_subsumption',
        scientificValidityScore: 0.95,
        semanticRationale:
          'Because self-attention contains no inherent order bias, positional encodings must be explicitly synthesized into the representations.',
      },
      {
        id: 'l_tam_3',
        sourceId: 'tam_mha',
        targetId: 'tam_kv_cache',
        linkingPhrase: 'is optimized during autoregressive decoding with',
        propositionType: 'correlative_qualification',
        scientificValidityScore: 0.95,
        semanticRationale:
          'Reusing past key-value states prevents redundant self-attention matrix computations for historical prompt tokens.',
      },
      {
        id: 'l_tam_4',
        sourceId: 'tam_mha',
        targetId: 'tam_flash_attention',
        linkingPhrase: 'is hardware-accelerated at scale through',
        propositionType: 'causal_mechanism',
        scientificValidityScore: 1.0,
        semanticRationale:
          'FlashAttention eliminates intermediate N x N attention matrix materialization in GPU global memory.',
      },
      {
        id: 'l_tam_5',
        sourceId: 'tam_flash_attention',
        targetId: 'tam_kv_cache',
        linkingPhrase: 'minimizes memory bandwidth footprint when combined with',
        propositionType: 'cross_link_synthesis',
        scientificValidityScore: 0.95,
        semanticRationale:
          'Fusing SRAM attention computation with paged KV caching removes memory-bound bottlenecks in long-context inference.',
        isCrossBranchLink: true,
      },
    ],
  },
}
