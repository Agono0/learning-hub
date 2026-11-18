/**
 * Web Studio Integration Tests for the Prototype & Exemplar Categorization API
 *
 * Verifies:
 * 1. GET /api/prototype-exemplar returns all 5 canonical category sets
 * 2. POST /api/prototype-exemplar with action: 'evaluate' computes TSC/CTS/MCD/
 *    CRI, maturity band, model comparison and divergent items
 * 3. POST /api/prototype-exemplar with action: 'plan' returns the
 *    model-discriminating trial sequence
 * 4. POST /api/prototype-exemplar with action: 'deck' synthesizes the FSRS deck
 * 5. Invalid payloads (bad action, out-of-scale rating, unknown category)
 *    fail with 400 Bad Request
 */

import { describe, expect, it } from 'vitest'
import { GET, POST } from '../src/server/handlers/prototype-exemplar/route'
import {
  BIRD_TYPICALITY_SET,
  RULE_BOUNDARY_SET,
  CANONICAL_CATEGORIZATION_SETS,
  type CategorizationSubmission,
} from '@learning-hub/core'

const post = (body: unknown): Request =>
  new Request('http://localhost/api/prototype-exemplar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('Prototype & Exemplar Studio Integration API', () => {
  it('GET /api/prototype-exemplar returns all canonical category sets', async () => {
    const res = await GET(new Request('http://localhost/api/prototype-exemplar'))
    expect(res.status).toBe(200)

    const data = (await res.json()) as { ok: boolean; scenarios: Array<{ id: string }> }
    expect(data.ok).toBe(true)
    expect(data.scenarios).toHaveLength(CANONICAL_CATEGORIZATION_SETS.length)
    expect(data.scenarios.some((s) => s.id === BIRD_TYPICALITY_SET.id)).toBe(true)
  })

  it('POST evaluate computes full telemetry on a normative-consistent bird session', async () => {
    const submission: CategorizationSubmission = {
      setId: BIRD_TYPICALITY_SET.id,
      typicalityRatings: {
        'bird-robin-old': 1,
        'bird-eagle': 2,
        'bird-chicken-old': 4,
        'bird-penguin-old': 5,
      },
      classifications: {
        'bird-robin-old': 'A',
        'bird-chicken-old': 'A',
        'bird-penguin-old': 'A',
        'bird-bat-old': 'B',
        'bird-eagle': 'A',
        'bird-dove': 'A',
        'bird-kiwi': 'A',
        'bird-butterfly': 'B',
        'bird-moth': 'B',
      },
    }

    const res = await POST(post({ action: 'evaluate', submission }))
    expect(res.status).toBe(200)

    const data = (await res.json()) as {
      ok: boolean
      evaluation: {
        setId: string
        tsc: number
        typicalityReference: string
        cts: number
        cri: number
        maturityBand: string
        modelComparison: {
          betterRepresentation: string
          prototype: { logLikelihood: number }
          exemplar: { logLikelihood: number }
        }
        itemDiagnostics: unknown[]
        divergentItems: Array<{ stimulusId: string; divergence: number }>
      }
    }
    expect(data.ok).toBe(true)
    expect(data.evaluation.setId).toBe(BIRD_TYPICALITY_SET.id)
    expect(data.evaluation.typicalityReference).toBe('normative')
    expect(data.evaluation.tsc).toBeGreaterThanOrEqual(80)
    expect(data.evaluation.cts).toBe(100)
    expect(data.evaluation.cri).toBeGreaterThanOrEqual(70)
    expect(['boundary_tracer', 'dual_model_theorist']).toContain(data.evaluation.maturityBand)
    expect(data.evaluation.modelComparison.betterRepresentation).toMatch(/prototype|exemplar|tie/)
    expect(data.evaluation.itemDiagnostics).toHaveLength(BIRD_TYPICALITY_SET.testItems.length)
    expect(data.evaluation.divergentItems.length).toBeLessThanOrEqual(4)
  })

  it('POST evaluate floors an empty submission honestly', async () => {
    const res = await POST(
      post({ action: 'evaluate', submission: { setId: BIRD_TYPICALITY_SET.id } }),
    )
    expect(res.status).toBe(200)

    const data = (await res.json()) as {
      ok: boolean
      evaluation: {
        tsc: number
        cri: number
        maturityBand: string
        typicalityReference: string
      }
    }
    expect(data.ok).toBe(true)
    expect(data.evaluation.cri).toBe(0)
    expect(data.evaluation.maturityBand).toBe('featural_guesser')
    expect(data.evaluation.typicalityReference).toBe('insufficient_ratings')
  })

  it('POST plan returns the deterministic model-discriminating sequence', async () => {
    const res = await POST(post({ action: 'plan', setId: RULE_BOUNDARY_SET.id, maxTrials: 6 }))
    expect(res.status).toBe(200)

    const data = (await res.json()) as {
      ok: boolean
      plan: {
        setId: string
        trials: Array<{ stimulusId: string; divergence: number; rationale: string }>
      }
    }
    expect(data.ok).toBe(true)
    expect(data.plan.setId).toBe(RULE_BOUNDARY_SET.id)
    expect(data.plan.trials).toHaveLength(6)
    for (let i = 1; i < data.plan.trials.length; i++) {
      expect(data.plan.trials[i]!.divergence).toBeLessThanOrEqual(
        data.plan.trials[i - 1]!.divergence,
      )
    }
    const ids = data.plan.trials.map((t) => t.stimulusId)
    expect(ids).toContain('rule-t-near-a')
    expect(ids).toContain('rule-t-extreme-b')
  })

  it('POST deck synthesizes 4 FSRS-calibrated phenomenon cards', async () => {
    const res = await POST(post({ action: 'deck', setId: BIRD_TYPICALITY_SET.id, criBaseline: 90 }))
    expect(res.status).toBe(200)

    const data = (await res.json()) as {
      ok: boolean
      deck: {
        setId: string
        criBaseline: number
        cards: Array<{
          cardType: string
          fsrsParameters: { stability: number; difficulty: number }
        }>
      }
    }
    expect(data.ok).toBe(true)
    expect(data.deck.setId).toBe(BIRD_TYPICALITY_SET.id)
    expect(data.deck.criBaseline).toBe(90)
    expect(data.deck.cards).toHaveLength(4)
    expect(data.deck.cards[0]!.fsrsParameters.stability).toBeGreaterThanOrEqual(7)
    expect(data.deck.cards[0]!.fsrsParameters.difficulty).toBeLessThanOrEqual(4.5)
  })

  it('rejects malformed requests with 400 Bad Request', async () => {
    // Unknown action discriminator
    const badAction = await POST(post({ action: 'invalid_action' }))
    expect(badAction.status).toBe(400)

    // Out-of-scale typicality rating
    const badRating = await POST(
      post({
        action: 'evaluate',
        submission: {
          setId: BIRD_TYPICALITY_SET.id,
          typicalityRatings: { 'bird-robin-old': 9 },
        },
      }),
    )
    expect(badRating.status).toBe(400)

    // Unknown category label
    const badCategory = await POST(
      post({
        action: 'evaluate',
        submission: {
          setId: BIRD_TYPICALITY_SET.id,
          classifications: { 'bird-robin-old': 'C' },
        },
      }),
    )
    expect(badCategory.status).toBe(400)

    // Missing setId for plan
    const missingSet = await POST(post({ action: 'plan' }))
    expect(missingSet.status).toBe(400)
  })
})
