/**
 * @file apps/web/tests/inquiry-studio-integration.test.ts
 * @description Integration tests for Dual-Space Scientific Discovery & Inquiry Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  calculateInquiryMetrics,
  getCanonicalInquiryLabs,
  runInquiryTrial,
} from '@learning-hub/core/inquiry'
import { InquiryHUD } from '../src/ui/InquiryHUD'
import { InquiryStudio } from '../src/components/InquiryStudio'
import InquiryPage from '../app/inquiry/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/inquiry/route'

describe('Scientific Inquiry Studio Web Integration', () => {
  it('renders InquiryHUD correctly in server context', () => {
    const lab = getCanonicalInquiryLabs()[0]!
    const t1 = runInquiryTrial(lab, 0, { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 })
    const t2 = runInquiryTrial(
      lab,
      1,
      { length: 1.5, mass: 0.2, angle: 15, gravity: 9.81 },
      t1.variableSettings,
    )

    const metrics = calculateInquiryMetrics({
      lab,
      trials: [t1, t2],
      anomalousSubmissions: [
        {
          anomalyId: 'anomaly-pendulum-mass-invariance',
          reaction: 'theory_revision',
          articulatedExplanation: 'Inertial mass cancels gravitational mass.',
        },
      ],
      falsificationTrialCount: 1,
      finalHypothesisCapturesInvariant: true,
    })

    const html = renderToString(
      React.createElement(InquiryHUD, {
        metrics,
        activeLabTitle: lab.title,
      }),
    )

    expect(html).toContain('Inquiry &amp; Discovery Telemetry')
    expect(html).toContain('Klahr-Dunbar SDDS Engine')
    expect(html).toContain('VOTAT Rigor (VRI)')
    expect(html).toContain('Confirmation Bias')
    expect(html).toContain('Anomaly Resolution')
    expect(html).toContain('Discovery Index')
    expect(html).toContain('SDDS Dual-Space Search Efficiency')
    expect(html).toContain(lab.title)
  })

  it('renders InquiryStudio with tabs, lab selection, and interactive controls', () => {
    const html = renderToString(React.createElement(InquiryStudio))

    // Tab buttons
    expect(html).toContain('1. Hypothesis &amp; Workbench')
    expect(html).toContain('2. Empirical Trials (0)')
    expect(html).toContain('3. Anomalous Crucible')
    expect(html).toContain('4. Causal Law &amp; Cards')

    // Lab selector
    expect(html).toContain('Galilean Pendulum Dynamics')
    expect(html).toContain('Classical Mechanics &amp; Oscillations')

    // Challenge context
    expect(html).toContain('Step 1: Hypothesis Space Search')
    expect(html).toContain('Guiding Empirical Research Question:')
    expect(html).toContain('Independent Variables Calibration')
  })

  it('renders InquiryPage Next.js route entrypoint without crashing', () => {
    const html = renderToString(React.createElement(InquiryPage))
    expect(html).toContain('Inquiry &amp; Discovery Telemetry')
    expect(html).toContain('Guiding Empirical Research Question:')
  })

  it('verifies that /inquiry is registered in navigation model', () => {
    const item = ALL_NAV_ITEMS.find((i) => i.href === '/inquiry')
    expect(item).toBeDefined()
    expect(item?.label).toBe('Scientific Inquiry')
    expect(item?.icon).toBeDefined()
  })

  it('verifies GET /api/inquiry endpoint returns canonical inquiry labs', async () => {
    const res = await GET(new Request('http://localhost/api/inquiry'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.labs.length).toBeGreaterThanOrEqual(5)
  })

  it('verifies POST /api/inquiry endpoint executes trials, metrics, and decks', async () => {
    // 1. Run simulation trial
    const trialReq = new Request('http://localhost/api/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'run_trial',
        labId: 'lab-pendulum-period',
        variableSettings: { length: 1.5, mass: 0.2, angle: 15, gravity: 9.81 },
      }),
    })
    const trialRes = await POST(trialReq)
    expect(trialRes.status).toBe(200)
    const trialData = await trialRes.json()
    expect(trialData.success).toBe(true)
    expect(trialData.trial.observedOutputs.period).toBeGreaterThan(0)

    // 2. Calculate metrics
    const metricsReq = new Request('http://localhost/api/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'calculate_metrics',
        labId: 'lab-pendulum-period',
        variableSettings: { length: 1.5, mass: 0.2, angle: 15, gravity: 9.81 },
        previousSettings: { length: 1.0, mass: 0.2, angle: 15, gravity: 9.81 },
        anomalousReaction: 'theory_revision',
        finalHypothesisCapturesInvariant: true,
      }),
    })
    const metricsRes = await POST(metricsReq)
    expect(metricsRes.status).toBe(200)
    const metricsData = await metricsRes.json()
    expect(metricsData.success).toBe(true)
    expect(metricsData.metrics.scientificDiscoveryIndex).toBeGreaterThan(0)
    expect(metricsData.metrics.votatRigorIndex).toBe(1.0)

    // 3. Generate deck
    const deckReq = new Request('http://localhost/api/inquiry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'generate_deck',
        labId: 'lab-pendulum-period',
      }),
    })
    const deckRes = await POST(deckReq)
    expect(deckRes.status).toBe(200)
    const deckData = await deckRes.json()
    expect(deckData.success).toBe(true)
    expect(deckData.deck.length).toBeGreaterThanOrEqual(3)
  })
})
