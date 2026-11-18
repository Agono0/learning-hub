import { describe, expect, it } from 'vitest'
import { GET, POST } from '../src/server/handlers/model-inquiry/route'

describe('Model-Based Inquiry & Gedankenexperiment Studio Integration', () => {
  it('GET returns all 5 canonical Gedankenexperiment scenarios or single scenario by id', async () => {
    // List all
    const resAll = await GET(new Request('http://localhost/api/model-inquiry'))
    expect(resAll.status).toBe(200)

    const jsonAll = await resAll.json()
    expect(jsonAll.ok).toBe(true)
    expect(jsonAll.scenarios).toHaveLength(5)
    expect(jsonAll.scenarios[0].id).toBe('galileo_falling_bodies')

    // Single scenario by id
    const resSingle = await GET(
      new Request('http://localhost/api/model-inquiry?id=maxwells_demon_entropy'),
    )
    expect(resSingle.status).toBe(200)
    const jsonSingle = await resSingle.json()
    expect(jsonSingle.ok).toBe(true)
    expect(jsonSingle.scenario.id).toBe('maxwells_demon_entropy')

    // 404 on not found
    const resNotFound = await GET(
      new Request('http://localhost/api/model-inquiry?id=non_existent_id'),
    )
    expect(resNotFound.status).toBe(404)
  })

  it('POST action perturb executes extreme case perturbation', async () => {
    const payload = {
      action: 'perturb',
      scenarioId: 'galileo_falling_bodies',
      extremeCaseId: 'ec_feather_cannonball',
    }

    const res = await POST(
      new Request('http://localhost/api/model-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.result.valid).toBe(true)
    expect(json.result.contradictionRevealed).toBe(true)
    expect(json.result.consequence).toContain('vacuum')
  })

  it('POST action simulate runs mental animation step sequence', async () => {
    const payload = {
      action: 'simulate',
      scenarioId: 'galileo_falling_bodies',
      stepIds: [
        'step_drop_isolated',
        'step_connect_cord',
        'step_deduction_drag',
        'step_deduction_combined_mass',
        'step_contradiction_crucible',
      ],
    }

    const res = await POST(
      new Request('http://localhost/api/model-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.result.valid).toBe(true)
    expect(json.result.fidelityScore).toBe(100)
    expect(json.result.contradictionsExposed.length).toBeGreaterThan(0)
  })

  it('POST action evaluate computes MBRI telemetry and returns calibrated FSRS deck', async () => {
    const payload = {
      action: 'evaluate',
      session: {
        scenarioId: 'turings_halting_oracle',
        selectedExtremeCaseIds: ['ec_trivial_loop_check', 'ec_perfect_oracle_assumption'],
        extremeCasePredictions: {
          ec_trivial_loop_check: 'Trivial cases do not generalize to diagonal self-reference',
          ec_perfect_oracle_assumption: 'Leads directly to an impossible logical loop paradox',
        },
        simulativeStepOrder: [
          'step_oracle_definition',
          'step_construct_adversary',
          'step_feed_paradox_to_itself',
          'step_evaluate_branch_1',
          'step_evaluate_branch_2',
          'step_halting_crucible',
        ],
        identifiedContradictions: ['Branch 1 paradox', 'Branch 2 paradox'],
        selectedBridgingId: 'bridge_liar_paradox',
        bridgingExplanation:
          'Diagonal inversion mirrors the self-referential structure of the Barber of Seville paradox',
        revisedModelHypothesis:
          'Reductio ad absurdum proof via self-referential diagonalization proves undecidability and limits of formal algorithmic computation.',
      },
    }

    const res = await POST(
      new Request('http://localhost/api/model-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.evaluation.compositeIndex).toBeGreaterThanOrEqual(75)
    expect(json.deck.length).toBeGreaterThanOrEqual(2)
  })

  it('POST action deck returns calibrated FSRS-6 review deck', async () => {
    const payload = {
      action: 'deck',
      scenarioId: 'einsteins_light_chaser',
    }

    const res = await POST(
      new Request('http://localhost/api/model-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.deck.length).toBeGreaterThanOrEqual(2)
  })

  it('rejects invalid action with 400 bad request', async () => {
    const res = await POST(
      new Request('http://localhost/api/model-inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'unknown_action' }),
      }),
    )
    expect(res.status).toBe(400)
  })
})
