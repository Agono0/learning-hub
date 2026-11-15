/**
 * API route tests for /api/cognitive/dual-coding and /api/cognitive/flow-state.
 */
import { describe, expect, it } from 'vitest'
import * as dualCodingHandler from '../src/server/handlers/cognitive/dual-coding/route'
import * as flowStateHandler from '../src/server/handlers/cognitive/flow-state/route'

const BASE = 'http://localhost'
const get = (path: string) => new Request(`${BASE}${path}`)
const post = (path: string, body: unknown) =>
  new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('Cognitive Dual-Coding API', () => {
  it('GET /api/cognitive/dual-coding returns analysis and prompt recommendation', async () => {
    const res = await dualCodingHandler.GET(
      get('/api/cognitive/dual-coding?text=Explain+the+photosynthesis+process+steps'),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.analysis.recommendedModality).toBe('sketch_diagram')
    expect(data.analysis.isDualCoded).toBe(false)
  })

  it('POST /api/cognitive/dual-coding computes composite retention with dual channels', async () => {
    const res = await dualCodingHandler.POST(
      post('/api/cognitive/dual-coding', {
        cardId: 10,
        text: 'Contrast Object-Oriented versus Functional Programming paradigms',
        hasDiagram: true,
        verbalRetention: 0.7,
        visualRetention: 0.8,
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.analysis.isDualCoded).toBe(true)
    expect(data.analysis.compositeRetention).toBe(0.94)
    expect(data.analysis.forgettingReductionFactor).toBeGreaterThan(1)
    expect(data.analysis.recommendedModality).toBe('spatial_map')
  })
})

describe('Cognitive Flow State API', () => {
  it('GET /api/cognitive/flow-state returns quick ultradian status', async () => {
    const res = await flowStateHandler.GET(
      get('/api/cognitive/flow-state?elapsedMinutes=30&accuracy=0.85'),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.flow.zone).toBe('flow')
    expect(data.flow.ultradianPhase).toBe('peak_focus')
    expect(data.flow.remainingFocusMinutes).toBe(60)
  })

  it('POST /api/cognitive/flow-state evaluates session telemetry', async () => {
    const res = await flowStateHandler.POST(
      post('/api/cognitive/flow-state', {
        accuracy: 0.5,
        averageLatencyMs: 6000,
        expectedLatencyMs: 2500,
        cardsAnswered: 20,
        elapsedFocusMinutes: 25,
        subjectiveStrain: 4,
      }),
    )
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.flow.zone).toBe('anxiety')
    expect(data.flow.suggestedAction).toBe('ease_difficulty')
  })
})
