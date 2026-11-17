import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { ConceptSchemaHUD } from '../src/ui/ConceptSchemaHUD'
import { SchemaDistillationStudio } from '../src/components/SchemaDistillationStudio'
import { CALIBRATED_CONCEPT_SCHEMAS, evaluateSchemaRigor } from '@learning-hub/core/knowledge-graph'

describe('Meaningful Learning & Schema Distillation Web Integration', () => {
  const memorySchema = CALIBRATED_CONCEPT_SCHEMAS.cognitive_memory_architecture!
  const healthyMetrics = evaluateSchemaRigor(memorySchema)

  describe('ConceptSchemaHUD Component', () => {
    it('renders PVS, CSD, Meaningful Learning Index, and sound status', () => {
      const html = renderToString(
        React.createElement(ConceptSchemaHUD, {
          metrics: healthyMetrics,
          schemaTitle: memorySchema.title,
          domain: memorySchema.domain,
          activeConceptLabel: 'Working Memory (WM)',
        }),
      )

      expect(html).toContain('Ausubel-Novak Propositional Schema')
      expect(html).toContain('Propositional Validity (PVS)')
      expect(html).toContain('Cross-Link Synthesis (CSD)')
      expect(html).toContain('Meaningful Learning Index')
      expect(html).toContain('Scientifically Sound Schema')
      expect(html).toContain('Working Memory (WM)')
    })

    it('renders anomaly warning when high-severity anomalies are present', () => {
      const flawedMetrics = {
        ...healthyMetrics,
        isSchemaSound: false,
        detectedAnomalies: [
          {
            id: 'flaw_1',
            anomalyType: 'inverted_hierarchy' as const,
            description: 'Test inverted hierarchy',
            affectedNodeIds: ['cma_fsrs', 'cma_wm'],
            severity: 'high' as const,
            suggestedRepair: 'Reverse link direction',
          },
        ],
      }

      const html = renderToString(
        React.createElement(ConceptSchemaHUD, {
          metrics: flawedMetrics,
          schemaTitle: memorySchema.title,
          domain: memorySchema.domain,
        }),
      )

      expect(html).toContain('Misconception')
      expect(html).toContain('Anomaly')
    })
  })

  describe('SchemaDistillationStudio Component', () => {
    it('renders schema selector, workspace tabs, and hierarchy levels', () => {
      const html = renderToString(
        React.createElement(SchemaDistillationStudio, {
          initialSchemaId: 'cognitive_memory_architecture',
        }),
      )

      expect(html).toContain('Schema Domain:')
      expect(html).toContain('Hierarchy &amp; Concept Web')
      expect(html).toContain('Proposition Builder (Novak 1984)')
      expect(html).toContain('Misconception Crucible')
      expect(html).toContain('FSRS Flashcard Tree')
      expect(html).toContain('Level 1: Root Anchor Schema')
      expect(html).toContain('Working Memory (WM)')
    })
  })
})
