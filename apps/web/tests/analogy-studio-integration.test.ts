/**
 * @file analogy-studio-integration.test.ts
 * @description SSR and component integration tests for Analogical Transfer & Schema Induction Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AnalogicalTransferHUD } from '../src/ui/AnalogicalTransferHUD'
import { AnalogicalTransferStudio } from '../src/components/AnalogicalTransferStudio'
import { CALIBRATED_ANALOGICAL_SUITES } from '@learning-hub/core/analogy/structure-mapping-engine'

describe('Analogical Transfer & Schema Induction Web Integration', () => {
  it('renders AnalogicalTransferHUD with Gentner Systematicity score and transfer forecast', () => {
    const html = renderToString(
      React.createElement(AnalogicalTransferHUD, {
        telemetry: {
          suiteId: 'convergence_radiation_oncology',
          entityAlignmentAccuracy: 1.0,
          predicatePreservationAccuracy: 1.0,
          systematicityScore: 92,
          surfaceFeatureDisparity: 0.85,
          schemaInductionMaturity: 88,
          spontaneousTransferProbability: 0.84,
          fsrsStabilityBonus: 2.4,
          misalignedEntities: [],
          missingPredicates: [],
          feedbackMessage: 'Exceptional Structure Mapping!',
          schemaSynthesisAdvice: 'Converge sub-threshold forces.',
        },
        currentSuiteTitle: 'The Convergence Schema: Fortress & Radiation',
        targetDomainName: 'Medical Oncology',
        baseDomainName: 'Military Warfare',
      }),
    )

    expect(html).toContain('Systematicity')
    expect(html).toContain('92')
    expect(html).toContain('Transfer Forecast')
    expect(html).toContain('84%')
    expect(html).toContain('Military Warfare')
    expect(html).toContain('Medical Oncology')
    expect(html).toContain('The Convergence Schema: Fortress &amp; Radiation')
  })

  it('renders AnalogicalTransferStudio with base and target panels, tabs, and entity selectors', () => {
    const html = renderToString(
      React.createElement(AnalogicalTransferStudio, {
        initialSuites: CALIBRATED_ANALOGICAL_SUITES,
      }),
    )

    expect(html).toContain('Isomorphic Mapping')
    expect(html).toContain('Convergence Schema')
    expect(html).toContain('False Analogy Decoy')
    expect(html).toContain('FSRS Schema Deck')
    expect(html).toContain('Duncker&#x27;s Inoperable Stomach Tumor')
    expect(html).toContain('Gentner Higher-Order Predicate Preservation')
  })
})
