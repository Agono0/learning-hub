/**
 * @file apps/web/tests/anchored-studio-integration.test.ts
 * @description Integration tests for Anchored Instruction & Situated Problem-Solving Studio.
 */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  CANONICAL_MACROCONTEXT_CASES,
  evaluateAnchoredSolution,
  type LearnerSolutionSubmission,
} from '@learning-hub/core/anchored'
import { AnchoredInstructionHUD } from '../src/ui/AnchoredInstructionHUD'
import { AnchoredInstructionStudio } from '../src/components/AnchoredInstructionStudio'
import AnchoredInstructionPage from '../app/anchored/page'
import { ALL_NAV_ITEMS } from '../src/components/nav'
import { GET, POST } from '../src/server/handlers/anchored/route'

describe('Anchored Instruction & Situated Macrocontext Web Integration', () => {
  it('renders AnchoredInstructionHUD correctly in server context', () => {
    const macroCase = CANONICAL_MACROCONTEXT_CASES[0]!
    const submission: LearnerSolutionSubmission = {
      caseId: macroCase.id,
      extractedDataValues: {
        'data-dist-oneway': 120,
        'data-cruising-speed': 100,
        'data-headwind': 20,
        'data-fuel-burn': 8.0,
        'data-total-fuel': 36,
        'data-reserve-required': 5,
        'data-ground-time': 0.5,
        'data-departure-time': 16.0,
        'data-sunset-time': 18.75,
      },
      subGoalSequence: macroCase.subGoalHierarchy.map((sg) => sg.id),
      calculatedSubGoalOutputs: Object.fromEntries(
        macroCase.subGoalHierarchy.map((sg) => [sg.id, sg.expectedValue]),
      ),
      finalDecisionChoice: 'optimal_decision',
      decisionJustification:
        'We verify both operational boundary constraints: first, fuel remaining at final touchdown exceeds the mandatory 5.0 gallons minimum reserve; second, our return flight completes prior to the 18.75 sunset landing deadline.',
    }

    const evaluation = evaluateAnchoredSolution(macroCase, submission)

    const html = renderToString(
      React.createElement(AnchoredInstructionHUD, {
        evaluation,
        activeCaseTitle: macroCase.title,
      }),
    )

    expect(html).toContain('Anchored Problem-Solving Telemetry')
    expect(html).toContain('Inert Knowledge Resistance (IKRS)')
    expect(html).toContain('Sub-Goal Alignment (SGAI)')
    expect(html).toContain('Information Extraction (EIER)')
    expect(html).toContain('Constraint Rigor (CPR)')
    expect(html).toContain('Mission Decision Approved')
    expect(html).toContain('Sub-Goal Execution Status')
  })

  it('renders AnchoredInstructionStudio cleanly via SSR without crashing', () => {
    const html = renderToString(React.createElement(AnchoredInstructionStudio))
    expect(html).toContain('Anchored Problem-Solving Telemetry')
    expect(html).toContain('1. Narrative Anchor &amp; Clues')
    expect(html).toContain('2. Sub-Goal Decomposition')
    expect(html).toContain('3. What-If Sensitivity')
    expect(html).toContain('4. Mission Decision &amp; FSRS Deck')
    expect(html).toContain('The Jasper Woodbury Search and Rescue Flight')
    expect(html).toContain('Select Situated Macrocontext')
  })

  it('renders AnchoredInstructionPage wrapper cleanly', () => {
    const html = renderToString(React.createElement(AnchoredInstructionPage))
    expect(html).toContain('container mx-auto')
    expect(html).toContain('Anchored Problem-Solving Telemetry')
  })

  it('registers /anchored in ALL_NAV_ITEMS with correct label', () => {
    const navItem = ALL_NAV_ITEMS.find((i) => i.href === '/anchored')
    expect(navItem).toBeDefined()
    expect(navItem?.label).toBe('Anchored Instruction')
  })

  it('serves GET /api/anchored with all 5 canonical macrocontext cases', async () => {
    const res = await GET(new Request('http://localhost/api/anchored'))
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.cases).toHaveLength(5)
    expect(data.cases[0].title).toContain('Jasper Woodbury')
  })

  it('serves POST /api/anchored with evaluate_solution', async () => {
    const macroCase = CANONICAL_MACROCONTEXT_CASES[0]!
    const payload = {
      action: 'evaluate_solution',
      caseId: macroCase.id,
      extractedDataValues: {
        'data-dist-oneway': 120,
        'data-cruising-speed': 100,
        'data-headwind': 20,
        'data-fuel-burn': 8.0,
        'data-total-fuel': 36,
        'data-reserve-required': 5,
        'data-ground-time': 0.5,
        'data-departure-time': 16.0,
        'data-sunset-time': 18.75,
      },
      subGoalSequence: macroCase.subGoalHierarchy.map((sg) => sg.id),
      calculatedSubGoalOutputs: Object.fromEntries(
        macroCase.subGoalHierarchy.map((sg) => [sg.id, sg.expectedValue]),
      ),
      finalDecisionChoice: 'optimal_decision',
      decisionJustification:
        'We verify both operational boundary constraints: first, fuel remaining at final touchdown exceeds the mandatory 5.0 gallons minimum reserve; second, our return flight completes prior to the 18.75 sunset landing deadline.',
    }

    const res = await POST(
      new Request('http://localhost/api/anchored', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.success).toBe(true)
    expect(data.evaluation.ikrs).toBeGreaterThanOrEqual(80)
    expect(data.evaluation.sgai).toBe(100)
    expect(data.evaluation.eier).toBeGreaterThanOrEqual(80)
    expect(data.evaluation.cpr).toBe(100)
    expect(data.evaluation.decisionApproved).toBe(true)
  })

  it('serves POST /api/anchored with simulate_sensitivity and generate_deck', async () => {
    // 1. What-if sensitivity simulation
    const simRes = await POST(
      new Request('http://localhost/api/anchored', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_sensitivity',
          caseId: 'case-jasper-flight',
          parameterId: 'data-headwind',
          variedValue: 35,
        }),
      }),
    )
    expect(simRes.status).toBe(200)
    const simData = await simRes.json()
    expect(simData.success).toBe(true)
    expect(simData.simulation).toBeDefined()
    expect(simData.simulation.caseId).toBe('case-jasper-flight')
    expect(simData.simulation.constraintImpacts).toBeDefined()

    // 2. FSRS deck generation
    const deckRes = await POST(
      new Request('http://localhost/api/anchored', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_deck',
          caseId: 'case-jasper-flight',
          extractedDataValues: {
            'data-dist-oneway': 120,
            'data-cruising-speed': 100,
            'data-headwind': 20,
            'data-fuel-burn': 8.0,
            'data-total-fuel': 36,
            'data-reserve-required': 5,
          },
        }),
      }),
    )
    expect(deckRes.status).toBe(200)
    const deckData = await deckRes.json()
    expect(deckData.caseTitle).toContain('Jasper Woodbury')
    expect(deckData.cards).toHaveLength(4)
    expect(deckData.cards[0].fsrsParameters).toBeDefined()
  })
})
