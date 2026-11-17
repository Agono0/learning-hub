/**
 * @file dual-coding-engine.test.ts
 * @description Unit tests for Paivio (1971) Dual-Coding Theory and Mayer (2001, 2014) CTML engine.
 */

import { describe, expect, it } from 'vitest'
import {
  auditMayerCompliance,
  calculateDualCodingMetrics,
  CALIBRATED_DUAL_CODING_SCHEMATA,
  DualCodingSchemaItem,
  DualCodingSession,
  exportDualCodedCards,
} from '../src/multimodal/dual-coding-engine'

describe('Paivio Dual-Coding Theory (DCT) Metrics', () => {
  it('calculates balanced dual-coding ratio and additive multiplier for calibrated schema', () => {
    const bftSchema = CALIBRATED_DUAL_CODING_SCHEMATA['bft_consensus_quorum']!
    const metrics = calculateDualCodingMetrics(bftSchema)

    expect(metrics.logogenCount).toBe(4)
    expect(metrics.imagenCount).toBe(4)
    expect(metrics.referentialLinkCount).toBe(4)
    expect(metrics.dualCodingBalanceRatio).toBe(1.0)
    expect(metrics.referentialDensity).toBeGreaterThanOrEqual(0.8)
    expect(metrics.dualCodingRetentionMultiplier).toBeGreaterThan(1.5)
    expect(metrics.status).toBe('optimally_dual_coded')
  })

  it('identifies purely verbal or purely visual vulnerabilities', () => {
    const verbalOnly: DualCodingSchemaItem = {
      id: 'verbal_test',
      domain: 'psychometrics',
      title: 'Verbal Test',
      coreConcept: 'Pure Text',
      summary: 'Summary without diagrams',
      logogens: [
        {
          id: 'l1',
          text: 'Proposition A',
          modality: 'verbal_proposition',
          importanceWeight: 0.8,
          keyTokens: [],
        },
        {
          id: 'l2',
          text: 'Proposition B',
          modality: 'verbal_proposition',
          importanceWeight: 0.8,
          keyTokens: [],
        },
      ],
      imagens: [],
      referentialLinks: [],
      stageSteps: [],
    }

    const verbalMetrics = calculateDualCodingMetrics(verbalOnly)
    expect(verbalMetrics.status).toBe('purely_verbal_vulnerable')
    expect(verbalMetrics.dualCodingBalanceRatio).toBe(0)
    expect(verbalMetrics.dualCodingRetentionMultiplier).toBeLessThan(1.2)

    const visualOnly: DualCodingSchemaItem = {
      ...verbalOnly,
      logogens: [],
      imagens: [
        {
          id: 'i1',
          label: 'Box 1',
          shape: 'state_box',
          x: 10,
          y: 10,
          width: 20,
          height: 10,
          colorTone: 'cyan',
          iconSymbol: 'box',
          signalingHighlight: false,
        },
        {
          id: 'i2',
          label: 'Box 2',
          shape: 'state_box',
          x: 50,
          y: 10,
          width: 20,
          height: 10,
          colorTone: 'cyan',
          iconSymbol: 'box',
          signalingHighlight: false,
        },
      ],
    }

    const visualMetrics = calculateDualCodingMetrics(visualOnly)
    expect(visualMetrics.status).toBe('purely_visual_unanchored')
  })
})

describe('Mayer CTML Multimedia Compliance Audit', () => {
  it('produces high compliance score for fully integrated schema', () => {
    const bftSchema = CALIBRATED_DUAL_CODING_SCHEMATA['bft_consensus_quorum']!
    const audit = auditMayerCompliance(bftSchema)

    expect(audit.overallComplianceScore).toBeGreaterThanOrEqual(85)
    expect(audit.spatialContiguityScore).toBeGreaterThanOrEqual(80)
    expect(audit.coherencePurityScore).toBeGreaterThanOrEqual(90)
    expect(audit.signalingSalienceScore).toBeGreaterThanOrEqual(70)
    expect(audit.segmentingModularityScore).toBe(100)
    expect(audit.identifiedViolations.length).toBe(0)
  })

  it('detects spatial contiguity violations when links exceed distance thresholds', () => {
    const bftSchema = CALIBRATED_DUAL_CODING_SCHEMATA['bft_consensus_quorum']!
    const distantSchema: DualCodingSchemaItem = {
      ...bftSchema,
      referentialLinks: [
        {
          id: 'distant_ref',
          logogenId: 'log_bft_n_size',
          imagenId: 'img_quorum_a',
          relation: 'illustrates',
          couplingStrength: 0.5,
          spatialSeparationDistance: 65, // Far distance
          isIntegratedCaption: false,
        },
      ],
    }

    const audit = auditMayerCompliance(distantSchema)
    expect(audit.spatialContiguityScore).toBeLessThan(70)
    expect(audit.identifiedViolations.some((v) => v.includes('Spatial Contiguity'))).toBe(true)
    expect(audit.evidenceBasedRecommendations.length).toBeGreaterThan(0)
  })
})

describe('DualCodingSession & FSRS Cards Export Bridge', () => {
  it('initializes session and supports referential connection addition', () => {
    const session = new DualCodingSession()
    const state = session.getState()

    expect(state.currentSchemaId).toBe('bft_consensus_quorum')
    const current = session.getCurrentSchema()
    expect(current?.logogens.length).toBe(4)

    session.selectLogogen('log_bft_intersection')
    expect(session.getState().activeLogogenId).toBe('log_bft_intersection')
    expect(session.getState().activeImagenId).toBe('img_intersection_lens')

    session.setActiveStep(2)
    expect(session.getState().activeStepIndex).toBe(2)
  })

  it('exports dual-coded schema into FSRS cards with stability boost', () => {
    const bftSchema = CALIBRATED_DUAL_CODING_SCHEMATA['bft_consensus_quorum']!
    const cards = exportDualCodedCards(bftSchema)

    expect(cards.length).toBeGreaterThanOrEqual(2)
    const synthCard = cards[0]!
    expect(synthCard.front).toContain('Dual-Coding Synthesis')
    expect(synthCard.back).toContain('Key Referential Mappings')
    expect(synthCard.suggestedInitialStability).toBeGreaterThan(4.5)
    expect(synthCard.tags).toContain('dual-coding')
    expect(synthCard.tags).toContain('distributed_systems')
  })
})
