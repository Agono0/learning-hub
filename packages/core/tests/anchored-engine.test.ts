/**
 * @file packages/core/tests/anchored-engine.test.ts
 * @description Unit tests for Anchored Instruction & Situated Macrocontext Engine.
 */

import { describe, expect, it } from 'vitest'
import {
  CANONICAL_MACROCONTEXT_CASES,
  MacrocontextCaseSchema,
  evaluateAnchoredSolution,
  simulateAnchoredSensitivity,
  generateAnchoredFSRSDeck,
  type LearnerSolutionSubmission,
} from '../src/anchored/anchored-engine'

describe('Anchored Instruction & Situated Macrocontext Engine', () => {
  it('validates all 5 canonical macrocontext cases against schema', () => {
    expect(CANONICAL_MACROCONTEXT_CASES).toHaveLength(5)

    for (const macroCase of CANONICAL_MACROCONTEXT_CASES) {
      const parsed = MacrocontextCaseSchema.safeParse(macroCase)
      expect(parsed.success).toBe(true)
      expect(macroCase.embeddedData.length).toBeGreaterThanOrEqual(8)
      expect(macroCase.subGoalHierarchy.length).toBeGreaterThanOrEqual(3)
      expect(macroCase.constraints.length).toBeGreaterThanOrEqual(1)
      expect(macroCase.narrativeScenario.length).toBeGreaterThan(100)
    }
  })

  it('penalizes narrative distractors and extraction omission in EIER', () => {
    const jasperCase = CANONICAL_MACROCONTEXT_CASES[0]!

    // Learner extracts 1 relevant parameter and 1 distractor
    const submission: LearnerSolutionSubmission = {
      caseId: jasperCase.id,
      extractedDataValues: {
        'data-dist-oneway': 120,
        'data-bell-dist': 40, // Distractor!
      },
      subGoalSequence: ['sg-outbound-groundspeed'],
      calculatedSubGoalOutputs: {
        'sg-outbound-groundspeed': 80,
      },
      finalDecisionChoice: 'fly',
      decisionJustification: 'I think it is safe to fly.',
    }

    const evalResult = evaluateAnchoredSolution(jasperCase, submission)
    expect(evalResult.eier).toBeLessThan(50)
    expect(evalResult.vulnerabilities.some((v) => v.includes('distractor'))).toBe(true)
  })

  it('detects dependency sequencing violations in sub-goal decomposition', () => {
    const jasperCase = CANONICAL_MACROCONTEXT_CASES[0]!

    // Learner attempts total-flight-time before outbound-time or inbound-time
    const submission: LearnerSolutionSubmission = {
      caseId: jasperCase.id,
      extractedDataValues: {
        'data-dist-oneway': 120,
        'data-cruising-speed': 100,
        'data-headwind': 20,
        'data-fuel-burn': 8.0,
      },
      subGoalSequence: ['sg-total-flight-time', 'sg-outbound-groundspeed'],
      calculatedSubGoalOutputs: {
        'sg-total-flight-time': 2.5,
      },
      finalDecisionChoice: 'proceed',
      decisionJustification: 'Attempting flight directly without subgoals.',
    }

    const evalResult = evaluateAnchoredSolution(jasperCase, submission)
    const violated = evalResult.subGoalFeedback.find((f) => f.subGoalId === 'sg-total-flight-time')
    expect(violated?.status).toBe('dependency_violated')
    expect(evalResult.sgai).toBeLessThan(70)
  })

  it('evaluates optimal situated problem-solving trajectory with high IKRS and Macrocontext Master band', () => {
    const jasperCase = CANONICAL_MACROCONTEXT_CASES[0]!

    const optimalSubmission: LearnerSolutionSubmission = {
      caseId: jasperCase.id,
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
      subGoalSequence: [
        'sg-outbound-groundspeed',
        'sg-outbound-time',
        'sg-inbound-groundspeed',
        'sg-inbound-time',
        'sg-total-flight-time',
        'sg-total-mission-time',
        'sg-fuel-consumed',
        'sg-fuel-remaining',
      ],
      calculatedSubGoalOutputs: {
        'sg-outbound-groundspeed': 80,
        'sg-outbound-time': 1.5,
        'sg-inbound-groundspeed': 120,
        'sg-inbound-time': 1.0,
        'sg-total-flight-time': 2.5,
        'sg-total-mission-time': 19.0,
        'sg-fuel-consumed': 20.0,
        'sg-fuel-remaining': 16.0,
      },
      finalDecisionChoice: 'delay_or_reroute',
      decisionJustification:
        'The flight has 16 gallons remaining which satisfies the minimum touchdown fuel reserve of 5.0 gallons; however, the mission arrival time is 19:00 (7:00 PM), which breaches the sunset daylight deadline of 18:45 (6:45 PM) by 15 minutes. Departure must occur by 3:45 PM or turnaround must be compressed.',
    }

    const evalResult = evaluateAnchoredSolution(jasperCase, optimalSubmission)
    expect(evalResult.eier).toBe(100)
    expect(evalResult.sgai).toBe(100)
    expect(evalResult.cpr).toBeGreaterThanOrEqual(80)
    expect(evalResult.ikrs).toBeGreaterThanOrEqual(85)
    expect(evalResult.maturityBand).toBe('macrocontext_master')
    expect(evalResult.decisionApproved).toBe(true)
  })

  it('runs what-if sensitivity analysis propagating parameter changes through constraints', () => {
    const jasperCase = CANONICAL_MACROCONTEXT_CASES[0]!

    // Vary headwind from 20 mph to 40 mph
    const simResult = simulateAnchoredSensitivity(jasperCase, 'data-headwind', 40)
    expect(simResult.simulatedOutputs.outboundGroundspeed).toBe(60) // 100 - 40
    expect(simResult.simulatedOutputs.inboundGroundspeed).toBe(140) // 100 + 40
    expect(simResult.constraintImpacts.length).toBeGreaterThanOrEqual(2)
  })

  it('generates calibrated FSRS-6 review deck with situated transfer cards', () => {
    const jasperCase = CANONICAL_MACROCONTEXT_CASES[0]!
    const mockEval = {
      sgai: 90,
      eier: 95,
      cpr: 88,
      ikrs: 92,
      maturityBand: 'macrocontext_master' as const,
      subGoalFeedback: [],
      parameterExtractionBreakdown: [],
      decisionApproved: true,
      pedagogicalFeedback: [],
      strengths: [],
      vulnerabilities: [],
    }

    const deck = generateAnchoredFSRSDeck(jasperCase, mockEval)
    expect(deck.caseId).toBe(jasperCase.id)
    expect(deck.cards).toHaveLength(4)
    expect(deck.cards.some((c) => c.cardType === 'data_extraction')).toBe(true)
    expect(deck.cards.some((c) => c.cardType === 'subgoal_decomposition')).toBe(true)
    expect(deck.cards[0]!.fsrsParameters.stability).toBeGreaterThan(6.0)
  })
})
