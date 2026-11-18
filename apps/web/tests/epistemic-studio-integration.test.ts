import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import { GET, POST } from '../src/server/handlers/epistemic/route'
import { EpistemicNetworkHUD } from '../src/ui/EpistemicNetworkHUD'

describe('Epistemic Network Analysis (ENA) Studio Integration', () => {
  it('GET /api/epistemic returns initialized model and standard codes', async () => {
    const res = await GET()
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.model).toBeDefined()
    expect(data.model.codes.length).toBeGreaterThanOrEqual(5)
    expect(data.model.network.networkDensity).toBeGreaterThan(0)
    expect(data.model.projection.dimension1Coord).toBeDefined()
    expect(data.standardCodes.length).toBeGreaterThanOrEqual(5)
  })

  it('POST /api/epistemic recomputes discourse model and SVD coordinates', async () => {
    const utterances = [
      {
        id: 'u_1',
        unitId: 'unit_test',
        conversationId: 'conv_test',
        lineIndex: 0,
        timestamp: new Date().toISOString(),
        speaker: 'Learner',
        text: 'The CAP Theorem dictates that in a network partition, we must choose either consistency or availability.',
        appliedCodes: ['code_domain_principle', 'code_causal_reasoning'],
      },
      {
        id: 'u_2',
        unitId: 'unit_test',
        conversationId: 'conv_test',
        lineIndex: 1,
        timestamp: new Date().toISOString(),
        speaker: 'Learner',
        text: 'In our Paxos benchmark, latency spiked to 250ms when cross-region replication dropped packets.',
        appliedCodes: ['code_empirical_evidence', 'code_procedural_execution'],
      },
    ]

    const req = new Request('http://localhost:3000/api/epistemic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'build_model',
        title: 'Distributed Consensus & CAP Theorem',
        domain: 'Distributed Systems',
        utterances,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.model).toBeDefined()
    expect(data.model.title).toBe('Distributed Consensus & CAP Theorem')
    expect(data.model.network.networkDensity).toBeGreaterThanOrEqual(0)
    expect(data.model.projection.epistemicInterpretation).toBeDefined()
  })

  it('POST /api/epistemic bridges epistemic density to curriculum transfer', async () => {
    const req = new Request('http://localhost:3000/api/epistemic', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'bridge_curriculum',
        baseMastery: 0.8,
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.bridge).toBeDefined()
    expect(data.bridge.originalMastery).toBe(0.8)
    expect(data.bridge.transferMultiplier).toBeGreaterThan(0.8)
    expect(data.bridge.modulatedMastery).toBeGreaterThan(0)
  })

  it('renders EpistemicNetworkHUD correctly via SSR without runtime error', () => {
    const html = renderToString(
      React.createElement(EpistemicNetworkHUD, {
        networkDensity: 0.72,
        overallMaturityScore: 84,
        dimension1Coord: 0.52,
        dimension2Coord: 0.38,
        dominantConnection: 'Domain Principle ↔ Empirical Evidence',
        centralHubCode: 'Causal Mechanism',
        interpretation: 'High-order theoretical synthesis with empirical validation.',
      }),
    )

    expect(html).toContain('Quantitative Ethnography')
    expect(html).toContain('Epistemic Network Analysis (ENA) Telemetry')
    expect(html).toContain('84%')
    expect(html).toContain('EXPERT SYNTHESIS')
    expect(html).toContain('72%')
    expect(html).toContain('Causal Mechanism')
  })
})
