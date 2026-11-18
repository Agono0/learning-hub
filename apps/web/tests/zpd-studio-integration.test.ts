/**
 * @file apps/web/tests/zpd-studio-integration.test.ts
 * @description Integration tests for Dynamic Assessment & Zone of Proximal Development Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { calculateZpdMetrics } from '@learning-hub/core/dynamic-assessment'
import { DynamicAssessmentHUD } from '../src/ui/DynamicAssessmentHUD'
import { DynamicAssessmentStudio } from '../src/components/DynamicAssessmentStudio'
import DynamicAssessmentPage from '../app/zpd/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/zpd/route'

describe('Dynamic Assessment & ZPD Studio Web Integration', () => {
  it('renders DynamicAssessmentHUD correctly in server context', () => {
    const metrics = calculateZpdMetrics(30, 75, 2, [80, 75, 70])

    const html = renderToString(
      React.createElement(DynamicAssessmentHUD, {
        metrics,
        activeScenarioTitle: 'Optimal Substructure DP',
      }),
    )

    expect(html).toContain('Dynamic Assessment Telemetry')
    expect(html).toContain('Actual Level (ADL)')
    expect(html).toContain('30%')
    expect(html).toContain('Potential Level (PDL)')
    expect(html).toContain('75%')
    expect(html).toContain('ZPD Bandwidth')
    expect(html).toContain('+45%')
    expect(html).toContain('Learning Potential')
    expect(html).toContain('Cognitive Modifiability (CMI)')
    expect(html).toContain('Transfer Autonomy (TAS)')
    expect(html).toContain('Optimal Substructure DP')
  })

  it('renders DynamicAssessmentStudio with tabs, scenario buttons, and interactive controls', () => {
    const html = renderToString(React.createElement(DynamicAssessmentStudio))

    // Tab buttons
    expect(html).toContain('Test-Mediate-Retest Workbench')
    expect(html).toContain('ZPD Radar &amp; Modifiability')
    expect(html).toContain('Transfer Distance Crucible')
    expect(html).toContain('FSRS-6 Mediated Deck')

    // Scenario selection buttons
    expect(html).toContain('Optimal Substructure &amp; Memoized Recurrence')

    // Step indicators
    expect(html).toContain('Pre-Test (ADL Baseline)')
    expect(html).toContain('Graduated Mediation (MLE)')
    expect(html).toContain('Post-Test (PDL Gain)')

    // First problem context
    expect(html).toContain('0/1 Knapsack State Formulation')
    expect(html).toContain('Submit Independent Answer')
  })

  it('renders DynamicAssessmentPage Next.js route entrypoint without crashing', () => {
    const html = renderToString(React.createElement(DynamicAssessmentPage))
    expect(html).toContain('Dynamic Assessment Telemetry')
    expect(html).toContain('Test-Mediate-Retest Workbench')
  })

  it('verifies that /zpd is registered in navigation model', () => {
    const zpdItem = ALL_NAV_ITEMS.find((item) => item.href === '/zpd')
    expect(zpdItem).toBeDefined()
    expect(zpdItem?.label).toBe('Dynamic Assessment')
    expect(zpdItem?.icon).toBeDefined()
  })

  it('verifies GET /api/zpd endpoint returns canonical scenarios', async () => {
    const res = await GET(new Request('http://localhost/api/zpd'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.scenarios.length).toBeGreaterThanOrEqual(4)
  })

  it('verifies POST /api/zpd endpoint computes metrics and generates decks', async () => {
    // 1. Calculate metrics
    const metricsReq = new Request('http://localhost/api/zpd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'calculate_metrics',
        preTestScore: 25,
        postTestScore: 75,
        promptsConsumed: 2,
        transferScores: [80, 70],
      }),
    })
    const metricsRes = await POST(metricsReq)
    expect(metricsRes.status).toBe(200)
    const metricsData = await metricsRes.json()
    expect(metricsData.success).toBe(true)
    expect(metricsData.metrics.actualDevelopmentalLevel).toBe(25)
    expect(metricsData.metrics.potentialDevelopmentalLevel).toBe(75)
    expect(metricsData.metrics.zpdBandwidth).toBe(50)

    // 2. Request prompt
    const promptReq = new Request('http://localhost/api/zpd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'request_prompt',
        scenarioId: 'algo_dynamic_programming',
        tierLevel: 3,
      }),
    })
    const promptRes = await POST(promptReq)
    expect(promptRes.status).toBe(200)
    const promptData = await promptRes.json()
    expect(promptData.success).toBe(true)
    expect(promptData.prompt.tierLevel).toBe(3)
    expect(promptData.prompt.title).toContain('Strategic')

    // 3. Generate FSRS deck
    const deckReq = new Request('http://localhost/api/zpd', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generate_deck',
        scenarioId: 'algo_dynamic_programming',
        preTestScore: 30,
        postTestScore: 80,
      }),
    })
    const deckRes = await POST(deckReq)
    expect(deckRes.status).toBe(200)
    const deckData = await deckRes.json()
    expect(deckData.success).toBe(true)
    expect(deckData.deck.length).toBeGreaterThanOrEqual(5)
  })
})
