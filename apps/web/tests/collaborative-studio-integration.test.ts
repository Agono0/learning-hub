/**
 * Web Studio Integration Tests for Collaborative Scripts & Transactive Discourse
 *
 * Verifies:
 * 1. GET /api/collaborative returns all 5 canonical scenarios
 * 2. POST /api/collaborative with action: 'evaluate' computes TDI, EED, SCR, CEI, and maturity
 * 3. POST /api/collaborative with action: 'partner' generates automated Socratic peer turn
 * 4. POST /api/collaborative with action: 'deck' creates calibrated FSRS-6 deck
 * 5. Handles invalid payload gracefully with 400 Bad Request
 */

import { describe, expect, it } from 'vitest'
import { GET, POST } from '../src/server/handlers/collaborative/route'
import { CANONICAL_COLLABORATIVE_SCENARIOS, type DiscourseSubmission } from '@learning-hub/core'

describe('Collaborative Scripts Studio Integration API', () => {
  it('GET /api/collaborative returns all canonical scenarios', async () => {
    const res = await GET(new Request('http://localhost/api/collaborative'))
    expect(res.status).toBe(200)

    const data = (await res.json()) as { ok: boolean; scenarios: unknown[] }
    expect(data.ok).toBe(true)
    expect(data.scenarios).toHaveLength(5)
  })

  it('POST /api/collaborative evaluate computes full transactive telemetry', async () => {
    const scenario = CANONICAL_COLLABORATIVE_SCENARIOS[0]!
    const submission: DiscourseSubmission = {
      scenarioId: scenario.id,
      learnerInitialPosition:
        'Late-LTP provides the primary protein synthesis substrate for synaptic efficacy, but requires spatial regulation to prevent saturation.',
      dialogueTurns: [
        {
          id: 'turn-1',
          speaker: 'learner',
          role: 'proposer',
          text: 'Because you stated that local protein synthesis at dendritic spines is the sole determinant of retention, how does your proposal account for the BCM paradox where untagged neighboring synapses drift into runaway excitability?',
          speechAct: 'transactive_critique',
          epistemicKeywords: ['bcm_paradox'],
        },
        {
          id: 'turn-2',
          speaker: 'learner',
          role: 'synthesizer',
          text: 'Building upon your argument, if we integrate Frey-Morris synaptic tagging with homeostatic synaptic scaling, weak stimulation sets a local tag whereas strong stimulation triggers cell-wide PRPs, therefore reconciling local specificity with global dynamic range.',
          speechAct: 'transactive_synthesis',
          epistemicKeywords: ['tag_and_capture'],
        },
      ],
      jointSynthesis:
        'We conclude that memory persistence depends on Frey-Morris Synaptic Tagging & Capture Coordination combined with a BCM sliding threshold: local tags capture global PRPs while homeostatic LTD depotentiates untagged inputs to maintain contrast.',
      individualTransferAnswer:
        'When applying this to artificial neural networks, local gradient updates serve as synaptic tags while global weight decay acts as homeostatic LTD, preventing catastrophic gradient explosion.',
    }

    const res = await POST(
      new Request('http://localhost/api/collaborative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'evaluate',
          submission,
        }),
      }),
    )

    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      ok: boolean
      scenarioTitle: string
      evaluation: {
        tdi: number
        eed: number
        scr: number
        cei: number
        maturityBand: string
        synthesizedInvariantsIdentified: string[]
      }
    }
    expect(data.ok).toBe(true)
    expect(data.scenarioTitle).toBe(scenario.title)
    expect(data.evaluation.tdi).toBeGreaterThanOrEqual(80)
    expect(data.evaluation.eed).toBeGreaterThanOrEqual(70)
    expect(data.evaluation.scr).toBe(100)
    expect(data.evaluation.cei).toBeGreaterThanOrEqual(80)
    expect(data.evaluation.maturityBand).toBe('dialectical_synthesizer')
    expect(data.evaluation.synthesizedInvariantsIdentified.length).toBeGreaterThanOrEqual(1)
  })

  it('POST /api/collaborative partner generates automated Socratic peer response', async () => {
    const scenario = CANONICAL_COLLABORATIVE_SCENARIOS[1]!
    const res = await POST(
      new Request('http://localhost/api/collaborative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'partner',
          scenarioId: scenario.id,
          learnerTurnText: 'We should allow local CRDTs for edge mutation operations.',
          turnIndex: 0,
        }),
      }),
    )

    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      ok: boolean
      peerTurn: {
        speaker: string
        role: string
        text: string
        speechAct: string
      }
    }
    expect(data.ok).toBe(true)
    expect(data.peerTurn.speaker).toBe('peer_partner')
    expect(data.peerTurn.text).toContain(scenario.simulatedPeer.initialArgument)
  })

  it('POST /api/collaborative deck generates calibrated FSRS-6 spaced repetition cards', async () => {
    const scenario = CANONICAL_COLLABORATIVE_SCENARIOS[2]!
    const res = await POST(
      new Request('http://localhost/api/collaborative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deck',
          scenarioId: scenario.id,
          ceiBaseline: 88,
        }),
      }),
    )

    expect(res.status).toBe(200)
    const data = (await res.json()) as {
      ok: boolean
      deck: {
        scenarioId: string
        scenarioTitle: string
        cards: Array<{
          cardType: string
          fsrsParameters: { stability: number; difficulty: number }
        }>
      }
    }
    expect(data.ok).toBe(true)
    expect(data.deck.scenarioId).toBe(scenario.id)
    expect(data.deck.cards).toHaveLength(4)
    expect(data.deck.cards[0]!.fsrsParameters.stability).toBeGreaterThanOrEqual(7.0)
  })

  it('rejects malformed requests with 400 Bad Request', async () => {
    const res = await POST(
      new Request('http://localhost/api/collaborative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'invalid_action',
        }),
      }),
    )

    expect(res.status).toBe(400)
  })
})
