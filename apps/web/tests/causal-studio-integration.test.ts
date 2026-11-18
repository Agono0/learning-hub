import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { GET, POST } from '../src/server/handlers/causal/route'
import { CounterfactualHUD } from '../src/ui/CounterfactualHUD'

describe('Structural Causal & Counterfactual Studio Integration', () => {
  it('GET /api/causal returns initialized SCM, diagnostics, and default baseline', async () => {
    const req = new Request('http://localhost/api/causal', { method: 'GET' })
    const res = await GET(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.model).toBeDefined()
    expect(data.model.id).toBe('edu_exam_causality')
    expect(data.problems).toBeInstanceOf(Array)
    expect(data.problems.length).toBeGreaterThanOrEqual(3)
    expect(data.defaultBaseline).toBeDefined()
    expect(data.defaultBaseline.ExamScore).toBeGreaterThan(0)
  })

  it('POST /api/causal simulates Level 2 intervention under graph surgery', async () => {
    const req = new Request('http://localhost/api/causal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'simulate_intervention',
        interventions: {
          StudyTechnique: 90,
          SleepRest: 95,
        },
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.interventionalValues.StudyTechnique).toBe(90)
    expect(data.interventionalValues.SleepRest).toBe(95)
    expect(data.interventionalValues.ExamScore).toBeGreaterThan(50)
  })

  it('POST /api/causal evaluates Level 3 counterfactual Abduction-Action-Prediction', async () => {
    const req = new Request('http://localhost/api/causal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'evaluate_counterfactual',
        evidence: {
          Aptitude: 45,
          StudyHours: 5,
          SleepRest: 40,
          ExamScore: 46,
        },
        interventions: {
          StudyHours: 20,
          SleepRest: 85,
        },
        targetVariableId: 'ExamScore',
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.result.targetVariableId).toBe('ExamScore')
    expect(data.result.factualValue).toBe(46)
    expect(data.result.counterfactualValue).toBeGreaterThan(50)
    expect(data.result.causalLift).toBeGreaterThan(0)
    expect(data.result.narrativeExplanation).toContain('Factual baseline')
  })

  it('POST /api/causal checks d-separation and backdoor criterion admissibility', async () => {
    const req = new Request('http://localhost/api/causal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'check_dsep',
        treatmentVar: 'StudyTechnique',
        outcomeVar: 'ExamScore',
        conditioningSet: ['Aptitude'],
      }),
    })

    const res = await POST(req)
    expect(res.status).toBe(200)

    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.backdoor.isAdmissible).toBe(true)
  })

  it('renders CounterfactualHUD correctly via SSR without runtime error', () => {
    const html = renderToString(
      React.createElement(CounterfactualHUD, {
        ladderLevel: 'L3_COUNTERFACTUAL',
        masteryScore: 92,
        activeInterventionsCount: 2,
        lastCausalLift: 18.4,
        isBackdoorAdmissible: true,
        confounderRisk: 'LOW',
        interventionSummary: 'Graph surgery do(X=x) active with unconfounded backdoor closure.',
      }),
    )

    expect(html).toContain('Pearl’s Ladder of Causation')
    expect(html).toContain('LEVEL 3: COUNTERFACTUAL IMAGINING')
    expect(html).toContain('92%')
    expect(html).toContain('+18.4 pts')
    expect(html).toContain('2 Active')
    expect(html).toContain('Admissible')
  })
})
