/**
 * @file apps/web/tests/conceptual-change-integration.test.ts
 * @description Integration tests for Conceptual Change & Ontological Category Shift Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_MISCONCEPTION_SCENARIOS,
  CANONICAL_ATTRIBUTE_CATALOG,
  CANONICAL_PPRIM_CATALOG,
  calculateConceptualChangeReadiness,
  calculateOntologicalDiscrepancyGap,
  detectSyntheticCompromiseRisk,
  evaluatePosnerAccommodationIndex,
} from '@learning-hub/core/conceptual-change'
import { OntologicalShiftHUD } from '../src/ui/OntologicalShiftHUD'
import { OntologicalShiftStudio } from '../src/components/OntologicalShiftStudio'
import ConceptualChangePage from '../app/conceptual-change/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'

describe('Conceptual Change & Ontological Category Shift Studio Web Integration', () => {
  it('renders OntologicalShiftHUD correctly in server context', () => {
    const scenario = CALIBRATED_MISCONCEPTION_SCENARIOS[0]
    const gap = calculateOntologicalDiscrepancyGap({
      selectedAttributes: ['distinct_agent', 'intentional_purpose', 'centralized_control'],
      scenario,
    })
    const posnerConditions = {
      dissatisfaction: 0.75,
      intelligibility: 0.8,
      plausibility: 0.7,
      fruitfulness: 0.65,
    }
    const posnerIndex = evaluatePosnerAccommodationIndex(posnerConditions)
    const risk = detectSyntheticCompromiseRisk({
      discrepancyGap: gap,
      posnerConditions,
    })
    const readiness = calculateConceptualChangeReadiness({
      posnerIndex,
      discrepancyGap: gap,
      syntheticRisk: risk,
    })

    const html = renderToString(
      React.createElement(OntologicalShiftHUD, {
        diagnosis: {
          scenarioId: scenario.id,
          learnerBranch: 'direct_process',
          targetBranch: scenario.targetOntologicalBranch,
          isOntologicalMismatch: true,
          discrepancyGap: gap,
          detectedPPrim: scenario.dominantPPrim,
          mentalModelStage: 'synthetic_compromise_model',
          posnerAccommodationIndex: posnerIndex,
          syntheticCompromiseRisk: risk,
          conceptualShiftReadiness: readiness,
        },
        posnerConditions,
        scenarioTitle: scenario.title,
      }),
    )

    expect(html).toContain('Ontological Category Shift HUD')
    expect(html).toContain('Chi 2013 · Vosniadou · diSessa')
    expect(html).toContain('Shift Readiness')
    expect(html).toContain('Posner Accommodation')
    expect(html).toContain('Discrepancy Gap')
    expect(html).toContain('Synthetic Model Risk')
    expect(html).toContain('Active Phenomenological Primitive')
    expect(html).toContain(CANONICAL_PPRIM_CATALOG[scenario.dominantPPrim].name)
  })

  it('renders OntologicalShiftStudio with active scenario, 4 tabs, and 5 scenario buttons', () => {
    const html = renderToString(React.createElement(OntologicalShiftStudio))

    expect(html).toContain('Conceptual Change &amp; Emergence Engine')
    expect(html).toContain('1. Attribute Crucible')
    expect(html).toContain('2. Ontological Tree')
    expect(html).toContain('3. Posner Refutation')
    expect(html).toContain('4. FSRS Shift Deck')
    expect(html).toContain('Natural Selection')
    expect(html).toContain('Thermal Conduction')
    expect(html).toContain('DC Electric Current')
    expect(html).toContain('Diffusion &amp; Osmosis')
    expect(html).toContain('Market Price Discovery')
  })

  it('renders the complete ConceptualChangePage route component', () => {
    const html = renderToString(React.createElement(ConceptualChangePage))

    expect(html).toContain('Ontological Category Shift Studio')
    expect(html).toContain('Chi (2013) Process Attribute Diagnostic')
    expect(html).toContain('Select Process Attributes Across 6 Dimensions')
  })

  it('registers /conceptual-change correctly in global navigation with GitBranch icon', () => {
    const navItem = ALL_NAV_ITEMS.find((item) => item.href === '/conceptual-change')
    expect(navItem).toBeDefined()
    expect(navItem?.label).toBe('Conceptual Change')
    expect(navItem?.icon).toBeDefined()
  })

  it('verifies that all 12 attributes in CANONICAL_ATTRIBUTE_CATALOG have labels and cognitive indicators', () => {
    const keys = Object.keys(CANONICAL_ATTRIBUTE_CATALOG)
    expect(keys.length).toBe(12)
    for (const key of keys) {
      const entry = CANONICAL_ATTRIBUTE_CATALOG[key as keyof typeof CANONICAL_ATTRIBUTE_CATALOG]
      expect(entry.label.length).toBeGreaterThan(0)
      expect(entry.definition.length).toBeGreaterThan(0)
      expect(entry.cognitiveIndicator.length).toBeGreaterThan(0)
    }
  })

  it('verifies that all 5 calibrated scenarios have refutational anomalies and emergent explanations', () => {
    expect(CALIBRATED_MISCONCEPTION_SCENARIOS.length).toBe(5)
    for (const sc of CALIBRATED_MISCONCEPTION_SCENARIOS) {
      expect(sc.refutationalAnomalies.length).toBeGreaterThanOrEqual(3)
      expect(sc.scientificEmergentExplanation.length).toBeGreaterThan(50)
      expect(sc.attributeContrasts.length).toBe(6)
    }
  })
})
