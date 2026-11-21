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

// TD-05: the calibrated multi-domain concept schemas are CONTENT, not logic —
// they live in ./content.ts so engine diffs stay about algorithms. The
// SchemaDistillationSession below imports the corpus from there; it is
// re-exported so every existing import path keeps working (the barrel does
// `export * from` this file).
import { CALIBRATED_CONCEPT_SCHEMAS } from './content'
export { CALIBRATED_CONCEPT_SCHEMAS } from './content'

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

// Corpus moved verbatim to ./content.ts (TD-05 — content, not logic); imported
// and re-exported at the top of this file so import paths are unchanged.

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
