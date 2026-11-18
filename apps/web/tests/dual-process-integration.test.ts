/**
 * @file apps/web/tests/dual-process-integration.test.ts
 * @description Integration tests for Dual-Process Diagnostic & Cognitive Forcing Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CALIBRATED_DIAGNOSTIC_SCENARIOS,
  CANONICAL_COGNITIVE_BIAS_CATALOG,
  calculateBiasVulnerabilityScore,
  calculateCognitiveDecouplingScore,
  calculateReflectiveMindIndex,
} from '@learning-hub/core/dualprocess'
import { DualProcessHUD } from '../src/ui/DualProcessHUD'
import { DualProcessStudio } from '../src/components/DualProcessStudio'
import DualProcessPage from '../app/dual-process/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'

describe('Dual-Process Diagnostic & Cognitive Forcing Studio Web Integration', () => {
  it('renders DualProcessHUD correctly in server context', () => {
    const scenario = CALIBRATED_DIAGNOSTIC_SCENARIOS[0]
    const decoupling = calculateCognitiveDecouplingScore({
      hypothesesConsideredCount: 3,
      anomaliesDiscoveredCount: 2,
      forcingStepsCompletedCount: 3,
      totalForcingStepsCount: 4,
    })
    const vulnerability = calculateBiasVulnerabilityScore({
      initialDecisionLatencyMs: 4500,
      forcingStepsCompletedCount: 3,
      totalForcingStepsCount: 4,
      anomaliesDiscoveredCount: 2,
      totalAnomaliesCount: 4,
    })
    const reflectiveIndex = calculateReflectiveMindIndex({
      cognitiveDecouplingScore: decoupling,
      biasVulnerabilityScore: vulnerability,
      reflectiveOverrideOccurred: true,
      diagnosticAccuracyAchieved: true,
    })

    const html = renderToString(
      React.createElement(DualProcessHUD, {
        activeMindSystem: 'reflective_mind',
        metrics: {
          scenarioId: scenario.id,
          system1InitialDiagnosisId: scenario.defaultSystem1DiagnosisId,
          system1DecisionLatencyMs: 4500,
          system1InitialConfidence: 0.8,
          completedForcingStepIds: ['cff_pause_chest', 'cff_diff_chest', 'cff_disconfirm_chest'],
          discoveredAnomalies: [scenario.subtleAnomalies[0], scenario.subtleAnomalies[1]],
          system2FinalDiagnosisId: 'type_a_aortic_dissection',
          system2FinalConfidence: 0.95,
          reflectiveOverrideOccurred: true,
          cognitiveDecouplingScore: decoupling,
          biasVulnerabilityScore: vulnerability,
          reflectiveMindIndex: reflectiveIndex,
          diagnosticAccuracyAchieved: true,
        },
        scenarioTitle: scenario.title,
      }),
    )

    expect(html).toContain('Dual-Process Diagnostic HUD')
    expect(html).toContain('Stanovich Tripartite')
    expect(html).toContain('Hyperacute Retrosternal Tearing Pain')
    expect(html).toContain('Reflective Mind Index')
    expect(html).toContain('Cognitive Decoupling')
    expect(html).toContain('Bias Vulnerability')
    expect(html).toContain('Reflective Override Engaged')
  })

  it('renders DualProcessStudio with active scenario and 4 stages', () => {
    const html = renderToString(React.createElement(DualProcessStudio))

    expect(html).toContain('Cognitive Forcing &amp; Diagnostic Calibration')
    expect(html).toContain('Kahneman · Stanovich · Croskerry')
    expect(html).toContain('Stage 1: System 1')
    expect(html).toContain('Stage 2: Forcing')
    expect(html).toContain('Stage 3: Reflection')
    expect(html).toContain('Stage 4: FSRS Deck')
    expect(html).toContain('Emergency Medicine')
    expect(html).toContain('Distributed Raft')
    expect(html).toContain('Macro-Finance ABCP')
    expect(html).toContain('GPU MoE Kernels')
  })

  it('renders the complete DualProcessPage route component', () => {
    const html = renderToString(React.createElement(DualProcessPage))

    expect(html).toContain('Dual-Process Diagnostic HUD')
    expect(html).toContain('Select Your Immediate Gut Impression')
    expect(html).toContain('Salient Triage Telemetry')
  })

  it('registers /dual-process correctly in global navigation with Split icon', () => {
    const navItem = ALL_NAV_ITEMS.find((item) => item.href === '/dual-process')
    expect(navItem).toBeDefined()
    expect(navItem?.label).toBe('Dual-Process Diagnostic')
    expect(navItem?.icon).toBeDefined()
  })

  it('verifies that all bias types in CANONICAL_COGNITIVE_BIAS_CATALOG have labels and definitions', () => {
    const biases = Object.keys(CANONICAL_COGNITIVE_BIAS_CATALOG)
    expect(biases.length).toBeGreaterThanOrEqual(7)
    for (const key of biases) {
      const bias =
        CANONICAL_COGNITIVE_BIAS_CATALOG[key as keyof typeof CANONICAL_COGNITIVE_BIAS_CATALOG]
      expect(bias.label.length).toBeGreaterThan(0)
      expect(bias.definition.length).toBeGreaterThan(0)
      expect(bias.croskerryAntidote.length).toBeGreaterThan(0)
    }
  })

  it('renders scenario selector tabs for all 4 calibrated challenge scenarios', () => {
    const html = renderToString(React.createElement(DualProcessStudio))
    expect(html).toContain('Emergency Medicine')
    expect(html).toContain('Distributed Raft')
    expect(html).toContain('Macro-Finance ABCP')
    expect(html).toContain('GPU MoE Kernels')
  })
})
