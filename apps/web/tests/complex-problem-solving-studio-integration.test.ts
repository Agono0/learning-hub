import { describe, expect, it } from 'vitest'
import { GET, POST } from '../src/server/handlers/complex-problem-solving/route'

describe('Complex Problem Solving (CPS) & Micro-World Studio Integration', () => {
  it('GET returns all 5 canonical Micro-World scenarios or single scenario by id', async () => {
    // List all
    const resAll = await GET(new Request('http://localhost/api/complex-problem-solving'))
    expect(resAll.status).toBe(200)

    const jsonAll = await resAll.json()
    expect(jsonAll.ok).toBe(true)
    expect(jsonAll.scenarios).toHaveLength(5)
    expect(jsonAll.scenarios[0].id).toBe('tanaland_desert_ecosystem')
    expect(jsonAll.scenarios[1].id).toBe('smart_grid_energy_transition')

    // Single scenario by id
    const resSingle = await GET(
      new Request('http://localhost/api/complex-problem-solving?id=smart_grid_energy_transition'),
    )
    expect(resSingle.status).toBe(200)
    const jsonSingle = await resSingle.json()
    expect(jsonSingle.ok).toBe(true)
    expect(jsonSingle.scenario.id).toBe('smart_grid_energy_transition')
    expect(jsonSingle.scenario.canonicalFailureMode.pathology).toBe('ballistic_action')

    // 404 on not found
    const resNotFound = await GET(
      new Request('http://localhost/api/complex-problem-solving?id=non_existent_id'),
    )
    expect(resNotFound.status).toBe(404)
  })

  it('POST action step executes decision cycle and resolves delayed cascades', async () => {
    const payload = {
      action: 'step',
      scenarioId: 'tanaland_desert_ecosystem',
      currentState: {
        currentCycle: 1,
        variableValues: {
          cattle_population: 100,
          groundwater_table: 50,
          pasture_vegetation_biomass: 120,
          tsetse_fly_density: 45,
          soil_erosion_rate: 15,
        },
        activeDelays: [],
        inspectedVariables: ['cattle_population', 'groundwater_table'],
        executedPolicyIds: [],
        systemCollapsed: false,
      },
      selectedPolicyIds: ['drill_deep_boreholes'],
      inspectedVariableIds: ['pasture_vegetation_biomass'],
    }

    const res = await POST(
      new Request('http://localhost/api/complex-problem-solving', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.result.nextState.currentCycle).toBe(2)
    // Groundwater table drew down from 50 to 40
    expect(json.result.nextState.variableValues['groundwater_table']).toBe(40)
    // 2 delayed cascades queued
    expect(json.result.nextState.activeDelays.length).toBe(2)
    expect(json.result.stepFeedback.some((f: string) => f.includes('Executed'))).toBe(true)
  })

  it('POST action evaluate computes CPS telemetry and diagnoses failure pathologies', async () => {
    const payload = {
      action: 'evaluate',
      scenarioId: 'tanaland_desert_ecosystem',
      finalState: {
        currentCycle: 4,
        variableValues: {
          cattle_population: 160,
          groundwater_table: 20,
          pasture_vegetation_biomass: 40,
          tsetse_fly_density: 10,
          soil_erosion_rate: 38,
        },
        activeDelays: [],
        inspectedVariables: [], // zero inspections -> ballistic action
        executedPolicyIds: [
          'drill_deep_boreholes',
          'veterinary_vaccination_drive',
          'drill_deep_boreholes',
        ],
        systemCollapsed: true,
        collapseReason:
          'Critical variable Topsoil Erosion Velocity breached safe operating envelope.',
      },
    }

    const res = await POST(
      new Request('http://localhost/api/complex-problem-solving', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.evaluation.tier).toBe('ballistic_reactive')
    expect(json.evaluation.feedbackMonitoring).toBeLessThan(50)
    expect(
      json.evaluation.detectedPathologies.some(
        (p: { pathology: string }) => p.pathology === 'ballistic_action',
      ),
    ).toBe(true)
    expect(json.deck.length).toBeGreaterThanOrEqual(1)
  })

  it('POST action deck generates scenario FSRS items', async () => {
    const payload = {
      action: 'deck',
      scenarioId: 'wildfire_evacuation_corridor',
    }

    const res = await POST(
      new Request('http://localhost/api/complex-problem-solving', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.deck.length).toBeGreaterThanOrEqual(1)
    expect(json.deck[0].id).toContain('fsrs_cps_wildfire_evacuation_corridor')
  })
})
