/**
 * @file apps/web/tests/pf-studio-integration.test.ts
 * @description Integration tests for Productive Failure & Canonical Consolidation Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { calculatePFMetrics, getCanonicalPFScenarios } from '@learning-hub/core/productive-failure'
import { ProductiveFailureHUD } from '../src/ui/ProductiveFailureHUD'
import { ProductiveFailureStudio } from '../src/components/ProductiveFailureStudio'
import ProductiveFailurePage from '../app/productive-failure/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/productive-failure/route'

describe('Productive Failure Studio Web Integration', () => {
  it('renders ProductiveFailureHUD correctly in server context', () => {
    const scenario = getCanonicalPFScenarios()[0]
    const metrics = calculatePFMetrics({
      representations: scenario.exemplarStudentRepresentations,
      impasse: {
        impasseEncountered: true,
        failureModeIdentified: 'Zero cancellation balance',
        boundaryConditionsTested: ['Outliers', 'Zeros'],
        knowledgeGapArticulated: 'Need smooth differentiable metric',
        affectiveImpasseRating: 5,
        impasseDepthScore: 90,
      },
      consolidationRatings: {
        featureAlignment: 90,
        parameterMapping: 90,
        invariantGrasp: 90,
      },
      transferResults: [
        { probeId: 'tp-1', isCorrect: true, confidence: 5 },
        { probeId: 'tp-2', isCorrect: true, confidence: 5 },
        { probeId: 'tp-3', isCorrect: true, confidence: 5 },
      ],
    })

    const html = renderToString(
      React.createElement(ProductiveFailureHUD, {
        metrics,
        activeScenarioTitle: 'Mathematical Consistency & Dispersion',
      }),
    )

    expect(html).toContain('Productive Failure Telemetry')
    expect(html).toContain('Kapur-Sinha Engine')
    expect(html).toContain('Productive Failure (PFI)')
    expect(html).toContain('Generation Diversity (GDI)')
    expect(html).toContain('Impasse Depth (ISS)')
    expect(html).toContain('Adaptive Transfer (ATS)')
    expect(html).toContain('Consolidation Integration Gain (CIG)')
    expect(html).toContain('Mathematical Consistency &amp; Dispersion')
  })

  it('renders ProductiveFailureStudio with tabs, scenario selection, and interactive controls', () => {
    const html = renderToString(React.createElement(ProductiveFailureStudio))

    // Tab buttons
    expect(html).toContain('1. Exploration &amp; Generation')
    expect(html).toContain('2. Impasse Crucible')
    expect(html).toContain('3. Canonical Consolidation')
    expect(html).toContain('4. Adaptive Transfer &amp; Cards')

    // Scenario selection
    expect(html).toContain('Mathematical Consistency &amp; Dispersion')
    expect(html).toContain('Statistics &amp; Data Science')

    // Challenge context
    expect(html).toContain('The First-Principles Challenge')
    expect(html).toContain('Intuitive Heuristic Starters')

    // Hypotheses
    expect(html).toContain('Canonical Student Hypotheses')
    expect(html).toContain('Generate Your Own Solution Model')
  })

  it('renders ProductiveFailurePage Next.js route entrypoint without crashing', () => {
    const html = renderToString(React.createElement(ProductiveFailurePage))
    expect(html).toContain('Productive Failure Telemetry')
    expect(html).toContain('The First-Principles Challenge')
  })

  it('verifies that /productive-failure is registered in navigation model', () => {
    const item = ALL_NAV_ITEMS.find((i) => i.href === '/productive-failure')
    expect(item).toBeDefined()
    expect(item?.label).toBe('Productive Failure')
    expect(item?.icon).toBeDefined()
  })

  it('verifies GET /api/productive-failure endpoint returns canonical scenarios', async () => {
    const res = await GET(new Request('http://localhost/api/productive-failure'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.scenarios.length).toBeGreaterThanOrEqual(5)
  })

  it('verifies POST /api/productive-failure endpoint evaluates representations and metrics', async () => {
    // 1. Evaluate representation
    const evalReq = new Request('http://localhost/api/productive-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate_representation',
        scenarioId: 'pf-variance-dispersion',
        representationInput: {
          title: 'Outlier Squared Distance',
          description: 'Squaring distance to penalize large spread',
          mechanism: 'Mean squared deviation',
          structuralFeatures: ['outlier sensitivity', 'deviation from center'],
        },
      }),
    })
    const evalRes = await POST(evalReq)
    expect(evalRes.status).toBe(200)
    const evalData = await evalRes.json()
    expect(evalData.success).toBe(true)
    expect(evalData.representation.title).toBe('Outlier Squared Distance')

    // 2. Calculate metrics
    const metricsReq = new Request('http://localhost/api/productive-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'calculate_metrics',
        scenarioId: 'pf-variance-dispersion',
        consolidationRatings: {
          featureAlignment: 90,
          parameterMapping: 90,
          invariantGrasp: 90,
        },
      }),
    })
    const metricsRes = await POST(metricsReq)
    expect(metricsRes.status).toBe(200)
    const metricsData = await metricsRes.json()
    expect(metricsData.success).toBe(true)
    expect(metricsData.metrics.productiveFailureIndex).toBeGreaterThan(0)

    // 3. Generate deck
    const deckReq = new Request('http://localhost/api/productive-failure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generate_deck',
        scenarioId: 'pf-variance-dispersion',
      }),
    })
    const deckRes = await POST(deckReq)
    expect(deckRes.status).toBe(200)
    const deckData = await deckRes.json()
    expect(deckData.success).toBe(true)
    expect(deckData.deck.length).toBeGreaterThanOrEqual(3)
  })
})
