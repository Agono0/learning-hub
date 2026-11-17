/**
 * Learning HUB — Meaningful Learning & Propositional Concept Schema Engine.
 *
 * Implements:
 * 1. David Ausubel's Assimilation Theory of Meaningful Learning (1968, 2000):
 *    - Subsumption Processes:
 *      * Derivative Subsumption (new concept is an exemplar of an established anchor)
 *      * Correlative Subsumption (new concept elaborates or qualifies the anchor schema)
 *      * Superordinate Learning (synthesis of lower-order concepts into an overarching umbrella)
 *      * Combinatorial Learning (horizontal cross-domain linking without hierarchical subordination)
 *    - Progressive Differentiation (hierarchical decomposition from general to specific)
 *    - Integrative Reconciliation (resolving apparent contradictions & boundary conflations)
 * 2. Joseph Novak's Concept Mapping Theory (1984, 2010):
 *    - Propositions as the fundamental units of human knowledge:
 *      [Concept A] --(linking phrase)--> [Concept B]
 *    - Propositional Validity Score (PVS): Ratio of scientifically sound, non-vacuous linking phrases
 *    - Cross-Link Synthesis Density (CSD): Creative lateral connections across distinct hierarchical branches
 * 3. Misconception Cycle & Inversion Diagnostic:
 *    - Detecting circular tautologies, inverted hierarchies, and isolated cognitive islands
 * 4. Calibrated Multi-Domain Schemas:
 *    - Cognitive Memory Architecture
 *    - Distributed Systems & Consensus
 *    - Deep Learning & Transformer Foundations
 *    - Quantum Information & Entanglement
 * 5. FSRS v5 Spaced Repetition Flashcard Tree Generation Bridge
 */

// ---------------------------------------------------------------------------
// 1. Types & Schemas
// ---------------------------------------------------------------------------

export type SubsumptionRole =
  | 'root_anchor'
  | 'derivative_subsumption'
  | 'correlative_subsumption'
  | 'superordinate_synthesis'
  | 'combinatorial_link'

export type PropositionType =
  | 'hierarchical_subsumption'
  | 'cross_link_synthesis'
  | 'causal_mechanism'
  | 'correlative_qualification'
  | 'boundary_constraint'

export type AnomalyType =
  | 'circular_tautology'
  | 'inverted_hierarchy'
  | 'isolated_island'
  | 'vacuous_linking_phrase'
  | 'domain_conflation'

export interface ConceptSchemaNode {
  id: string
  label: string
  hierarchicalLevel: number // 1: Root Anchor, 2: Intermediate Construct, 3: Specific Exemplar
  subsumptionRole: SubsumptionRole
  definition: string
  domain: string
  examples: string[]
  isAnchor?: boolean
}

export interface PropositionalLink {
  id: string
  sourceId: string
  targetId: string
  linkingPhrase: string // e.g., "is subsumed by", "enforces consensus via", "scales quadratically with"
  propositionType: PropositionType
  scientificValidityScore: number // 0.0 to 1.0 scale
  semanticRationale: string
  isCrossBranchLink?: boolean
}

export interface MisconceptionAnomaly {
  id: string
  anomalyType: AnomalyType
  description: string
  affectedNodeIds: string[]
  affectedLinkIds?: string[]
  severity: 'low' | 'medium' | 'high'
  suggestedRepair: string
}

export interface ConceptSchemaMap {
  id: string
  title: string
  domain: string
  rootConceptId: string
  nodes: ConceptSchemaNode[]
  links: PropositionalLink[]
  targetCrossLinkCount: number
}

export interface SchemaRigorMetrics {
  totalNodes: number
  totalPropositions: number
  hierarchicalDepth: number
  propositionalValidityScore: number // 0.0 to 1.0 (mean validity of all links)
  crossLinkSynthesisRatio: number // Ratio of cross-branch links to total links
  meaningfulLearningIndex: number // Composite Ausubel score (0 to 100)
  dominantAssimilationMode: SubsumptionRole
  detectedAnomalies: MisconceptionAnomaly[]
  isSchemaSound: boolean
}

export interface FSRSPropositionCard {
  front: string
  back: string
  tags: string[]
  suggestedDifficulty: number
  suggestedStability: number
  metadata: {
    sourceConcept: string
    targetConcept: string
    linkingPhrase: string
    propositionType: PropositionType
    schemaId: string
  }
}

// ---------------------------------------------------------------------------
// 2. Propositional Validity & Semantic Rigor Scoring (Novak 1984)
// ---------------------------------------------------------------------------

const VACUOUS_LINKING_WORDS = new Set([
  'is',
  'has',
  'related to',
  'is related to',
  'connected with',
  'is connected with',
  'goes with',
  'and',
  'involves',
  'associated with',
  'is associated with',
  'links to',
  'is part of',
])

/**
 * Evaluates whether a linking phrase is semantically precise and scientifically non-vacuous.
 */
export function evaluateLinkingPhrasePrecision(phrase: string): {
  isVacuous: boolean
  precisionScore: number
  rationale: string
} {
  const clean = phrase.trim().toLowerCase()
  if (!clean || clean.length < 3) {
    return {
      isVacuous: true,
      precisionScore: 0.1,
      rationale: 'Linking phrase is empty or too short to assert a scientific proposition.',
    }
  }

  if (VACUOUS_LINKING_WORDS.has(clean)) {
    return {
      isVacuous: true,
      precisionScore: 0.25,
      rationale: `"${phrase}" is a vacuous linking phrase (Novak 1984). Use precise verbs specifying causal, hierarchical, or correlative mechanisms.`,
    }
  }

  // Check for substantive verbs or qualifiers
  const substantiveMarkers = [
    'subsumes',
    'enforces',
    'derives',
    'constrains',
    'transforms',
    'synthesizes',
    'proves',
    'modulates',
    'guarantees',
    'minimizes',
    'maximizes',
    'causes',
    'inhibits',
    'stabilizes',
  ]

  const hasSubstantiveMarker = substantiveMarkers.some((marker) => clean.includes(marker))
  const precisionScore = hasSubstantiveMarker ? 0.95 : Math.min(0.85, 0.4 + clean.length * 0.03)

  return {
    isVacuous: false,
    precisionScore: Number(precisionScore.toFixed(2)),
    rationale: 'Linking phrase establishes a clear propositional assertion.',
  }
}

/**
 * Calculates Propositional Validity Score (PVS) across all links in the concept map.
 */
export function calculatePropositionalValidityScore(links: PropositionalLink[]): number {
  if (links.length === 0) return 0.0
  const sum = links.reduce((acc, link) => {
    const evalResult = evaluateLinkingPhrasePrecision(link.linkingPhrase)
    const baseScore = link.scientificValidityScore ?? 0.8
    return acc + (evalResult.isVacuous ? evalResult.precisionScore : baseScore)
  }, 0)
  return Number((sum / links.length).toFixed(2))
}

/**
 * Calculates Cross-Link Synthesis Ratio (CSR) per Novak (1984).
 * Cross-links connect different hierarchical branches and represent creative integrative reconciliation.
 */
export function calculateCrossLinkSynthesisRatio(
  nodes: ConceptSchemaNode[],
  links: PropositionalLink[],
): number {
  if (links.length === 0) return 0.0

  const nodeLevelMap = new Map<string, number>()
  for (const n of nodes) {
    nodeLevelMap.set(n.id, n.hierarchicalLevel)
  }

  let crossLinkCount = 0
  for (const link of links) {
    if (link.isCrossBranchLink) {
      crossLinkCount++
      continue
    }
    const srcLevel = nodeLevelMap.get(link.sourceId) ?? 1
    const tgtLevel = nodeLevelMap.get(link.targetId) ?? 1

    // Horizontal links on same level or links across non-adjacent levels
    if (
      link.propositionType === 'cross_link_synthesis' ||
      (srcLevel === tgtLevel && srcLevel > 1)
    ) {
      crossLinkCount++
    }
  }

  return Number((crossLinkCount / links.length).toFixed(2))
}

// ---------------------------------------------------------------------------
// 3. Ausubelian Assimilation & Anomaly Detection
// ---------------------------------------------------------------------------

/**
 * Detects structural and semantic misconceptions in the concept schema map:
 * - Circular tautologies (A -> B -> A)
 * - Inverted hierarchies (Leaf concept placed higher than its root anchor)
 * - Isolated concept islands (Nodes with 0 incident propositions)
 * - Vacuous linking phrases
 */
export function detectSchemaAnomalies(schema: ConceptSchemaMap): MisconceptionAnomaly[] {
  const anomalies: MisconceptionAnomaly[] = []
  const { nodes, links } = schema

  const nodeMap = new Map<string, ConceptSchemaNode>()
  for (const n of nodes) {
    nodeMap.set(n.id, n)
  }

  // 1. Detect isolated islands (no inbound or outbound links)
  const connectedNodeIds = new Set<string>()
  for (const l of links) {
    connectedNodeIds.add(l.sourceId)
    connectedNodeIds.add(l.targetId)
  }

  for (const n of nodes) {
    if (!connectedNodeIds.has(n.id)) {
      anomalies.push({
        id: `iso_${n.id}`,
        anomalyType: 'isolated_island',
        description: `Concept "${n.label}" is isolated from the cognitive schema with zero propositional linkers.`,
        affectedNodeIds: [n.id],
        severity: 'high',
        suggestedRepair: `Connect "${n.label}" to an established anchor concept using a meaningful proposition.`,
      })
    }
  }

  // 2. Detect vacuous linking phrases
  for (const l of links) {
    const { isVacuous, rationale } = evaluateLinkingPhrasePrecision(l.linkingPhrase)
    if (isVacuous) {
      const src = nodeMap.get(l.sourceId)?.label || l.sourceId
      const tgt = nodeMap.get(l.targetId)?.label || l.targetId
      anomalies.push({
        id: `vac_${l.id}`,
        anomalyType: 'vacuous_linking_phrase',
        description: `Vacuous proposition between [${src}] and [${tgt}]: "${l.linkingPhrase}". ${rationale}`,
        affectedNodeIds: [l.sourceId, l.targetId],
        affectedLinkIds: [l.id],
        severity: 'medium',
        suggestedRepair: `Replace "${l.linkingPhrase}" with an active, domain-specific verb phrase.`,
      })
    }
  }

  // 3. Detect circular tautologies
  const adj = new Map<string, string[]>()
  for (const l of links) {
    const cur = adj.get(l.sourceId) || []
    cur.push(l.targetId)
    adj.set(l.sourceId, cur)
  }

  for (const [src, targets] of adj.entries()) {
    for (const tgt of targets) {
      const reverse = adj.get(tgt) || []
      if (reverse.includes(src)) {
        const srcLabel = nodeMap.get(src)?.label || src
        const tgtLabel = nodeMap.get(tgt)?.label || tgt
        const key = [src, tgt].sort().join('-')
        if (!anomalies.some((a) => a.id === `circ_${key}`)) {
          anomalies.push({
            id: `circ_${key}`,
            anomalyType: 'circular_tautology',
            description: `Circular bidirectional dependency between [${srcLabel}] and [${tgtLabel}].`,
            affectedNodeIds: [src, tgt],
            severity: 'high',
            suggestedRepair:
              'Disambiguate direction of subsumption or convert one link into a correlative qualification.',
          })
        }
      }
    }
  }

  // 4. Detect inverted hierarchy
  for (const l of links) {
    const src = nodeMap.get(l.sourceId)
    const tgt = nodeMap.get(l.targetId)
    if (src && tgt && l.propositionType === 'hierarchical_subsumption') {
      if (src.hierarchicalLevel > tgt.hierarchicalLevel) {
        anomalies.push({
          id: `inv_${l.id}`,
          anomalyType: 'inverted_hierarchy',
          description: `Inverted hierarchy: Specific construct [${src.label}] (Level ${src.hierarchicalLevel}) claims to subsume higher-order construct [${tgt.label}] (Level ${tgt.hierarchicalLevel}).`,
          affectedNodeIds: [src.id, tgt.id],
          affectedLinkIds: [l.id],
          severity: 'high',
          suggestedRepair: `Reverse link direction so higher-order concept [${tgt.label}] subsumes [${src.label}].`,
        })
      }
    }
  }

  return anomalies
}

/**
 * Computes full Schema Rigor Metrics combining Ausubel's assimilation theory and Novak's PVS.
 */
export function evaluateSchemaRigor(schema: ConceptSchemaMap): SchemaRigorMetrics {
  const { nodes, links } = schema
  const totalNodes = nodes.length
  const totalPropositions = links.length

  let maxLevel = 1
  for (const n of nodes) {
    if (n.hierarchicalLevel > maxLevel) maxLevel = n.hierarchicalLevel
  }

  const pvs = calculatePropositionalValidityScore(links)
  const csr = calculateCrossLinkSynthesisRatio(nodes, links)
  const anomalies = detectSchemaAnomalies(schema)

  // Meaningful Learning Index (0-100 scale):
  // 40% Propositional Validity + 30% Cross-link density + 20% Hierarchical depth + 10% Anomaly penalty
  const depthFactor = Math.min(1.0, maxLevel / 3)
  const crossLinkTarget = Math.max(1, schema.targetCrossLinkCount || 2)
  const crossLinkFactor = Math.min(1.0, (csr * totalPropositions) / crossLinkTarget)
  const anomalyPenalty = Math.max(0, anomalies.length * 8)

  const rawIndex = pvs * 45 + crossLinkFactor * 30 + depthFactor * 25 - anomalyPenalty
  const meaningfulLearningIndex = Math.max(5, Math.min(100, Math.round(rawIndex)))

  // Dominant assimilation mode
  let derivativeCount = 0
  let correlativeCount = 0
  let superordinateCount = 0
  let combinatorialCount = 0

  for (const n of nodes) {
    if (n.subsumptionRole === 'derivative_subsumption') derivativeCount++
    else if (n.subsumptionRole === 'correlative_subsumption') correlativeCount++
    else if (n.subsumptionRole === 'superordinate_synthesis') superordinateCount++
    else if (n.subsumptionRole === 'combinatorial_link') combinatorialCount++
  }

  let dominantAssimilationMode: SubsumptionRole = 'derivative_subsumption'
  const maxRole = Math.max(
    derivativeCount,
    correlativeCount,
    superordinateCount,
    combinatorialCount,
  )
  if (maxRole === correlativeCount) dominantAssimilationMode = 'correlative_subsumption'
  else if (maxRole === superordinateCount) dominantAssimilationMode = 'superordinate_synthesis'
  else if (maxRole === combinatorialCount) dominantAssimilationMode = 'combinatorial_link'

  const isSchemaSound = anomalies.filter((a) => a.severity === 'high').length === 0 && pvs >= 0.7

  return {
    totalNodes,
    totalPropositions,
    hierarchicalDepth: maxLevel,
    propositionalValidityScore: pvs,
    crossLinkSynthesisRatio: csr,
    meaningfulLearningIndex,
    dominantAssimilationMode,
    detectedAnomalies: anomalies,
    isSchemaSound,
  }
}

// ---------------------------------------------------------------------------
// 4. FSRS Flashcard Tree Generation Bridge
// ---------------------------------------------------------------------------

/**
 * Converts valid propositions into two-way FSRS v5 relational spaced-repetition cards.
 */
export function exportSchemaToFSRSCards(schema: ConceptSchemaMap): FSRSPropositionCard[] {
  const cards: FSRSPropositionCard[] = []
  const nodeMap = new Map<string, ConceptSchemaNode>()
  for (const n of schema.nodes) {
    nodeMap.set(n.id, n)
  }

  for (const link of schema.links) {
    const src = nodeMap.get(link.sourceId)
    const tgt = nodeMap.get(link.targetId)
    if (!src || !tgt) continue

    // Card 1: Forward Propositional Retrieval (Given Concept A, what is its relation to Concept B?)
    const front1 = `**[${schema.domain.toUpperCase()}] Concept Relation:**\n\nHow does **${src.label}** relate to **${tgt.label}** in the schema *${schema.title}*?`
    let back1 = `**Propositional Link:** \`${src.label}\` **${link.linkingPhrase}** \`${tgt.label}\`\n\n`
    back1 += `**Type:** *${link.propositionType.replace('_', ' ')}*\n\n`
    back1 += `**Scientific Rationale:** ${link.semanticRationale || 'Internalizes meaningful subsumption in cognitive structure.'}`

    cards.push({
      front: front1,
      back: back1,
      tags: ['concept-map', 'ausubel-novak', schema.domain, link.propositionType],
      suggestedDifficulty: link.isCrossBranchLink ? 7 : 4,
      suggestedStability: link.isCrossBranchLink ? 3.0 : 4.5,
      metadata: {
        sourceConcept: src.label,
        targetConcept: tgt.label,
        linkingPhrase: link.linkingPhrase,
        propositionType: link.propositionType,
        schemaId: schema.id,
      },
    })

    // Card 2: Fill-in-the-Blank Relational Cloze for Cross-Links
    if (link.isCrossBranchLink || link.propositionType === 'cross_link_synthesis') {
      const front2 = `**[${schema.domain.toUpperCase()}] Integrative Reconciliation Cloze:**\n\nComplete the propositional synthesis:\n\`${src.label}\` **[ ... ]** \`${tgt.label}\``
      const back2 = `**Target Linking Phrase:** **${link.linkingPhrase}**\n\n**Theoretical Justification:** ${link.semanticRationale}`
      cards.push({
        front: front2,
        back: back2,
        tags: ['concept-map', 'cross-link', schema.domain],
        suggestedDifficulty: 8,
        suggestedStability: 2.5,
        metadata: {
          sourceConcept: src.label,
          targetConcept: tgt.label,
          linkingPhrase: link.linkingPhrase,
          propositionType: link.propositionType,
          schemaId: schema.id,
        },
      })
    }
  }

  return cards
}

// ---------------------------------------------------------------------------
// 5. Calibrated Multi-Domain Concept Schemas
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// 6. Interactive Schema Distillation Session State Machine
// ---------------------------------------------------------------------------

export interface SchemaSessionState {
  schemaId: string
  activeConceptId: string | null
  activePropositionId: string | null
  schemaMap: ConceptSchemaMap
  metrics: SchemaRigorMetrics
  repairedAnomalyIds: string[]
  customPropositionsCount: number
}

export class SchemaDistillationSession {
  private schemaMap: ConceptSchemaMap
  private state: SchemaSessionState

  constructor(schemaId: string) {
    const calibrated = CALIBRATED_CONCEPT_SCHEMAS[schemaId]
    if (!calibrated) {
      throw new Error(`Calibrated schema not found: ${schemaId}`)
    }

    // Deep clone to allow safe interactive mutation
    this.schemaMap = JSON.parse(JSON.stringify(calibrated)) as ConceptSchemaMap
    const metrics = evaluateSchemaRigor(this.schemaMap)

    this.state = {
      schemaId,
      activeConceptId: this.schemaMap.rootConceptId,
      activePropositionId: null,
      schemaMap: this.schemaMap,
      metrics,
      repairedAnomalyIds: [],
      customPropositionsCount: 0,
    }
  }

  public getState(): Readonly<SchemaSessionState> {
    return { ...this.state }
  }

  public getSchemaMap(): Readonly<ConceptSchemaMap> {
    return this.schemaMap
  }

  public setActiveConcept(conceptId: string | null): void {
    this.state.activeConceptId = conceptId
  }

  public addProposition(params: {
    sourceId: string
    targetId: string
    linkingPhrase: string
    propositionType: PropositionType
    semanticRationale: string
  }): { success: boolean; linkId?: string; feedback: string } {
    const { sourceId, targetId, linkingPhrase, propositionType, semanticRationale } = params

    // Validate nodes exist
    const hasSource = this.schemaMap.nodes.some((n) => n.id === sourceId)
    const hasTarget = this.schemaMap.nodes.some((n) => n.id === targetId)
    if (!hasSource || !hasTarget) {
      return { success: false, feedback: 'Source or target concept not found in schema.' }
    }

    if (sourceId === targetId) {
      return { success: false, feedback: 'Self-referential loops cannot form valid propositions.' }
    }

    const precision = evaluateLinkingPhrasePrecision(linkingPhrase)
    const linkId = `custom_l_${Date.now()}`

    const newLink: PropositionalLink = {
      id: linkId,
      sourceId,
      targetId,
      linkingPhrase: linkingPhrase.trim(),
      propositionType,
      scientificValidityScore: precision.precisionScore,
      semanticRationale,
      isCrossBranchLink: propositionType === 'cross_link_synthesis',
    }

    this.schemaMap.links.push(newLink)
    this.state.customPropositionsCount++
    this.refreshMetrics()

    return {
      success: true,
      linkId,
      feedback: precision.isVacuous
        ? `Proposition added with warning: ${precision.rationale}`
        : 'Proposition successfully synthesized and integrated into cognitive structure.',
    }
  }

  public removeProposition(linkId: string): boolean {
    const idx = this.schemaMap.links.findIndex((l) => l.id === linkId)
    if (idx === -1) return false
    this.schemaMap.links.splice(idx, 1)
    this.refreshMetrics()
    return true
  }

  public repairAnomaly(
    anomalyId: string,
    repairPatch: { linkId?: string; updatedPhrase?: string },
  ): boolean {
    const anomaly = this.state.metrics.detectedAnomalies.find((a) => a.id === anomalyId)
    if (!anomaly) return false

    if (repairPatch.linkId && repairPatch.updatedPhrase) {
      const link = this.schemaMap.links.find((l) => l.id === repairPatch.linkId)
      if (link) {
        link.linkingPhrase = repairPatch.updatedPhrase
        const prec = evaluateLinkingPhrasePrecision(repairPatch.updatedPhrase)
        link.scientificValidityScore = prec.precisionScore
      }
    }

    if (!this.state.repairedAnomalyIds.includes(anomalyId)) {
      this.state.repairedAnomalyIds.push(anomalyId)
    }

    this.refreshMetrics()
    return true
  }

  private refreshMetrics(): void {
    this.state.metrics = evaluateSchemaRigor(this.schemaMap)
  }
}
