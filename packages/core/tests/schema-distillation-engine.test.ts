import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_CONCEPT_SCHEMAS,
  SchemaDistillationSession,
  calculateCrossLinkSynthesisRatio,
  calculatePropositionalValidityScore,
  detectSchemaAnomalies,
  evaluateLinkingPhrasePrecision,
  evaluateSchemaRigor,
  exportSchemaToFSRSCards,
  type ConceptSchemaMap,
} from '../src/knowledge-graph/schema-distillation'

describe('Meaningful Learning & Propositional Concept Schema Engine', () => {
  const memorySchema = CALIBRATED_CONCEPT_SCHEMAS.cognitive_memory_architecture!
  const consensusSchema = CALIBRATED_CONCEPT_SCHEMAS.distributed_consensus_hierarchy!

  describe('Propositional Precision & Validity (Novak 1984)', () => {
    it('flags vacuous linking words and scores substantive phrases highly', () => {
      const vacuous = evaluateLinkingPhrasePrecision('is related to')
      expect(vacuous.isVacuous).toBe(true)
      expect(vacuous.precisionScore).toBeLessThan(0.4)
      expect(vacuous.rationale).toContain('vacuous')

      const substantive = evaluateLinkingPhrasePrecision('enforces consensus via')
      expect(substantive.isVacuous).toBe(false)
      expect(substantive.precisionScore).toBeGreaterThanOrEqual(0.9)
    })

    it('computes Propositional Validity Score across schema links', () => {
      const pvs = calculatePropositionalValidityScore(memorySchema.links)
      expect(pvs).toBeGreaterThanOrEqual(0.8)
      expect(pvs).toBeLessThanOrEqual(1.0)
    })

    it('calculates Cross-Link Synthesis Ratio correctly', () => {
      const csr = calculateCrossLinkSynthesisRatio(memorySchema.nodes, memorySchema.links)
      expect(csr).toBeGreaterThan(0.0)
      expect(csr).toBeLessThanOrEqual(1.0)
    })
  })

  describe('Ausubelian Assimilation & Anomaly Detection', () => {
    it('detects inverted hierarchy when a specific leaf claims to subsume a root anchor', () => {
      const flawedSchema: ConceptSchemaMap = {
        ...memorySchema,
        links: [
          ...memorySchema.links,
          {
            id: 'flawed_inv',
            sourceId: 'cma_fsrs', // Level 3 leaf
            targetId: 'cma_wm', // Level 1 root anchor
            linkingPhrase: 'subsumes the structure of',
            propositionType: 'hierarchical_subsumption',
            scientificValidityScore: 0.9,
            semanticRationale: 'Inverted assertion for testing',
          },
        ],
      }

      const anomalies = detectSchemaAnomalies(flawedSchema)
      expect(anomalies.some((a) => a.anomalyType === 'inverted_hierarchy')).toBe(true)
    })

    it('detects circular tautologies between two concepts', () => {
      const circularSchema: ConceptSchemaMap = {
        ...memorySchema,
        links: [
          ...memorySchema.links,
          {
            id: 'circ_forward',
            sourceId: 'cma_wm',
            targetId: 'cma_fsrs',
            linkingPhrase: 'determines review timing for',
            propositionType: 'causal_mechanism',
            scientificValidityScore: 0.8,
            semanticRationale: 'Test forward link',
          },
          {
            id: 'circ_reverse',
            sourceId: 'cma_fsrs',
            targetId: 'cma_wm',
            linkingPhrase: 'determines buffer size for',
            propositionType: 'causal_mechanism',
            scientificValidityScore: 0.8,
            semanticRationale: 'Test reverse link causing circularity',
          },
        ],
      }

      const anomalies = detectSchemaAnomalies(circularSchema)
      expect(anomalies.some((a) => a.anomalyType === 'circular_tautology')).toBe(true)
    })

    it('detects isolated concept islands', () => {
      const islandSchema: ConceptSchemaMap = {
        ...memorySchema,
        nodes: [
          ...memorySchema.nodes,
          {
            id: 'isolated_node',
            label: 'Floating Concept',
            hierarchicalLevel: 2,
            subsumptionRole: 'correlative_subsumption',
            definition: 'Isolated from the graph',
            domain: 'cognitive_science',
            examples: [],
          },
        ],
      }

      const anomalies = detectSchemaAnomalies(islandSchema)
      expect(anomalies.some((a) => a.anomalyType === 'isolated_island')).toBe(true)
    })
  })

  describe('Schema Rigor Metrics & Meaningful Learning Index', () => {
    it('evaluates healthy calibrated schemas with high MLI and no high-severity anomalies', () => {
      const metrics = evaluateSchemaRigor(consensusSchema)
      expect(metrics.totalNodes).toBe(5)
      expect(metrics.totalPropositions).toBe(5)
      expect(metrics.hierarchicalDepth).toBe(3)
      expect(metrics.meaningfulLearningIndex).toBeGreaterThanOrEqual(75)
      expect(metrics.isSchemaSound).toBe(true)
      expect(metrics.detectedAnomalies.length).toBe(0)
    })
  })

  describe('FSRS Flashcard Tree Generation Bridge', () => {
    it('generates bidirectional relational cards and cross-link clozes', () => {
      const cards = exportSchemaToFSRSCards(memorySchema)
      expect(cards.length).toBeGreaterThan(memorySchema.links.length) // Cross-links generate additional cloze

      const relationalCard = cards.find((c) => c.front.includes('Concept Relation:'))!
      expect(relationalCard).toBeDefined()
      expect(relationalCard.back).toContain('Propositional Link:')
      expect(relationalCard.tags).toContain('ausubel-novak')

      const clozeCard = cards.find((c) => c.front.includes('Integrative Reconciliation Cloze:'))!
      expect(clozeCard).toBeDefined()
      expect(clozeCard.back).toContain('Target Linking Phrase:')
    })
  })

  describe('SchemaDistillationSession State Machine', () => {
    it('supports interactive proposition synthesis and real-time metric updates', () => {
      const session = new SchemaDistillationSession('distributed_consensus_hierarchy')
      expect(session.getState().schemaId).toBe('distributed_consensus_hierarchy')
      expect(session.getState().metrics.isSchemaSound).toBe(true)

      // Add a valid proposition
      const result = session.addProposition({
        sourceId: 'dch_raft',
        targetId: 'dch_smr',
        linkingPhrase: 'guarantees safe execution sequence in',
        propositionType: 'hierarchical_subsumption',
        semanticRationale: 'Raft replicates state machine logs faithfully.',
      })

      expect(result.success).toBe(true)
      expect(session.getState().customPropositionsCount).toBe(1)
      expect(session.getState().metrics.totalPropositions).toBe(6)

      // Reject self-referential loops
      const selfLoop = session.addProposition({
        sourceId: 'dch_raft',
        targetId: 'dch_raft',
        linkingPhrase: 'is identical to',
        propositionType: 'causal_mechanism',
        semanticRationale: 'Invalid self loop',
      })
      expect(selfLoop.success).toBe(false)
      expect(selfLoop.feedback).toContain('Self-referential')

      // Remove the custom proposition
      const removed = session.removeProposition(result.linkId!)
      expect(removed).toBe(true)
      expect(session.getState().metrics.totalPropositions).toBe(5)
    })

    it('initializes and verifies the transformer attention mechanisms calibrated schema', () => {
      const session = new SchemaDistillationSession('transformer_attention_mechanisms')
      const state = session.getState()
      expect(state.schemaId).toBe('transformer_attention_mechanisms')
      expect(state.schemaMap.nodes).toHaveLength(5)
      expect(state.schemaMap.links).toHaveLength(5)
      expect(state.metrics.isSchemaSound).toBe(true)
      expect(state.metrics.crossLinkSynthesisRatio).toBeGreaterThanOrEqual(0.2)
      expect(state.metrics.meaningfulLearningIndex).toBeGreaterThan(60)

      const cards = exportSchemaToFSRSCards(state.schemaMap)
      expect(cards.length).toBeGreaterThan(5)
      expect(cards.some((c) => c.tags.includes('machine_learning'))).toBe(true)
    })
  })
})
