import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { GET, POST } from '../src/server/handlers/threshold/route'
import { ThresholdLiminalHUD } from '../src/ui/ThresholdLiminalHUD'

describe('Threshold Concepts & Liminal Space Navigation Integration', () => {
  it('GET /api/threshold returns benchmark concepts and boundary probes', async () => {
    const req = new Request('http://localhost/api/threshold', { method: 'GET' })
    const res = await GET(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.concepts).toBeInstanceOf(Array)
    expect(data.concepts.length).toBeGreaterThanOrEqual(4)
    expect(data.probes).toBeInstanceOf(Array)
    expect(data.probes.length).toBeGreaterThanOrEqual(2)
  })

  it('POST /api/threshold evaluates liminal trajectory and bridges to curriculum', async () => {
    const req = new Request('http://localhost/api/threshold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate_trajectory',
        conceptId: 'tc_pointers_memory',
        selectedOptionIds: {
          probe_pointers_swap: 'ptr_opt_genuine',
        },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.diagnostic.phase).toBe('POST_LIMINAL_TRANSFORMED')
    expect(data.diagnostic.canCrossPortal).toBe(true)
    expect(data.diagnostic.overallFluencyScore).toBe(100)
    expect(data.bridge.gatewayMultiplier).toBe(1.35)
    expect(data.bridge.modulatedMastery).toBeGreaterThan(0.8)
  })

  it('POST /api/threshold computes oscillation index and TSI', async () => {
    // Oscillation computation
    const oscReq = new Request('http://localhost/api/threshold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'compute_oscillation',
        evaluations: [
          {
            timestamp: '2026-11-18T00:00:00Z',
            confidenceScore: 85,
            performanceScore: 80,
            isMimicryDetected: false,
            notes: 'Attempt 1',
          },
          {
            timestamp: '2026-11-18T01:00:00Z',
            confidenceScore: 90,
            performanceScore: 88,
            isMimicryDetected: false,
            notes: 'Attempt 2',
          },
        ],
      }),
    })

    const oscRes = await POST(oscReq)
    expect(oscRes.status).toBe(200)
    const oscData = await oscRes.json()
    expect(oscData.success).toBe(true)
    expect(oscData.oscillationIndex).toBeLessThan(0.3)

    // TSI computation
    const tsiReq = new Request('http://localhost/api/threshold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'compute_tsi',
        conceptId: 'tc_opportunity_cost',
      }),
    })

    const tsiRes = await POST(tsiReq)
    expect(tsiRes.status).toBe(200)
    const tsiData = await tsiRes.json()
    expect(tsiData.success).toBe(true)
    expect(tsiData.tsi).toBeGreaterThan(0.8)
  })

  it('renders ThresholdLiminalHUD correctly via SSR without runtime error', () => {
    const html = renderToString(
      React.createElement(ThresholdLiminalHUD, {
        phase: 'POST_LIMINAL_TRANSFORMED',
        fluencyScore: 100,
        mimicryRiskScore: 0,
        oscillationStability: 90,
        unlockedDownstreamCount: 4,
        canCrossPortal: true,
        remediationSummary:
          'Portal crossed: Troublesome knowledge transformed into irreversible intuitive schema.',
      }),
    )

    expect(html).toContain('Meyer &amp; Land (2003, 2005) Pedagogical Gateways')
    expect(html).toContain('PORTAL CROSSED (POST-LIMINAL)')
    expect(html).toContain('100%')
    expect(html).toContain('0%')
    expect(html).toContain('90%')
    expect(html).toContain('4 Unlocked')
  })
})
