import { describe, expect, it } from 'vitest'
import { GET, POST } from '../src/server/handlers/system-dynamics/route'

describe('System Dynamics Studio Integration', () => {
  it('GET returns all 5 canonical multidisciplinary scenarios', async () => {
    const res = await GET(new Request('http://localhost/api/system-dynamics'))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.scenarios).toHaveLength(5)
    expect(json.scenarios[0].id).toBe('climate-permafrost-methane')
  })

  it('POST action simulate runs deterministic Euler numerical integration', async () => {
    const payload = {
      action: 'simulate',
      scenarioId: 'climate-permafrost-methane',
      stepsCount: 40,
      dt: 1.0,
      policyMultipliers: {
        fossil_emissions: 0.5,
      },
    }

    const res = await POST(
      new Request('http://localhost/api/system-dynamics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.simulationRun.steps).toHaveLength(40)
    expect(json.simulationRun.scenarioId).toBe('climate-permafrost-methane')
  })

  it('POST action evaluate computes quantitative SDI telemetry and returns FSRS deck', async () => {
    const payload = {
      action: 'evaluate',
      hypothesis: {
        scenarioId: 'climate-permafrost-methane',
        classifiedVariables: [
          { id: 'atmospheric_carbon', nature: 'stock' },
          { id: 'ocean_carbon_sink', nature: 'stock' },
          { id: 'permafrost_methane_stock', nature: 'stock' },
          { id: 'global_temperature_anomaly', nature: 'stock' },
          { id: 'fossil_emissions', nature: 'flow' },
          { id: 'ocean_sink_absorption', nature: 'flow' },
          { id: 'permafrost_thaw_release', nature: 'flow' },
          { id: 'radiative_heat_accumulation', nature: 'flow' },
        ],
        identifiedLoops: [
          {
            id: 'R1_albedo_cryosphere',
            polarity: 'reinforcing',
            elementIds: ['global_temperature_anomaly', 'radiative_heat_accumulation'],
            delayIdentified: true,
          },
          {
            id: 'R2_permafrost_runaway',
            polarity: 'reinforcing',
            elementIds: [
              'global_temperature_anomaly',
              'permafrost_thaw_release',
              'atmospheric_carbon',
              'radiative_heat_accumulation',
            ],
            delayIdentified: true,
          },
          {
            id: 'B1_ocean_buffering',
            polarity: 'balancing',
            elementIds: ['atmospheric_carbon', 'ocean_sink_absorption', 'ocean_carbon_sink'],
            delayIdentified: true,
          },
        ],
        identifiedArchetype: 'limits_to_growth',
        proposedHighLeverageIntervention:
          'Statutory carbon budget caps and methane flaring mandates (Meadows Rank 4 Rules of the System).',
        predictedBehavior: 'overshoot_and_collapse',
      },
    }

    const res = await POST(
      new Request('http://localhost/api/system-dynamics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.evaluation.sdi).toBeGreaterThanOrEqual(85)
    expect(json.evaluation.maturityTier).toBe('leverage_strategist')
    expect(json.deck.cards.length).toBe(4)
  })

  it('POST action deck returns calibrated FSRS-6 review deck', async () => {
    const payload = {
      action: 'deck',
      scenarioId: 'diabetes-beta-cell-homeostasis',
      sdiBaseline: 80,
    }

    const res = await POST(
      new Request('http://localhost/api/system-dynamics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.deck.cards).toHaveLength(4)
  })

  it('rejects invalid action or schema mismatch with 400 bad request', async () => {
    const res = await POST(
      new Request('http://localhost/api/system-dynamics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'invalid_action' }),
      }),
    )
    expect(res.status).toBe(400)
  })
})
