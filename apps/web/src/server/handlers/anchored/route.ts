/**
 * @file apps/web/src/server/handlers/anchored/route.ts
 * @description Runtime-neutral API handler for Anchored Instruction & Situated Problem Solving.
 *
 * Implements:
 * - GET /api/anchored — Retrieves canonical macrocontext cases.
 * - POST /api/anchored — Evaluates situated problem solving solutions (EIER, SGAI, CPR, IKRS),
 *                        runs sensitivity simulations, and exports calibrated FSRS decks.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  CANONICAL_MACROCONTEXT_CASES,
  LearnerSolutionSubmissionSchema,
  evaluateAnchoredSolution,
  simulateAnchoredSensitivity,
  generateAnchoredFSRSDeck,
} from '@learning-hub/core/anchored'
import { readJson, withRoute } from '@/lib/api'

const AnchoredActionSchema = z.object({
  action: z
    .enum(['evaluate_solution', 'simulate_sensitivity', 'generate_deck'])
    .default('evaluate_solution'),
  caseId: z.string().default('case-jasper-flight'),
  parameterId: z.string().optional().default('data-headwind'),
  variedValue: z.number().optional().default(30),
  submission: LearnerSolutionSubmissionSchema.optional(),
  extractedDataValues: z.record(z.string(), z.number()).optional(),
  subGoalSequence: z.array(z.string()).optional(),
  calculatedSubGoalOutputs: z.record(z.string(), z.number()).optional(),
  finalDecisionChoice: z.string().optional(),
  decisionJustification: z.string().optional(),
})

export const GET = withRoute(async () => {
  return Response.json({
    success: true,
    cases: CANONICAL_MACROCONTEXT_CASES,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, AnchoredActionSchema)
  const macroCase =
    CANONICAL_MACROCONTEXT_CASES.find((c) => c.id === body.caseId) ??
    CANONICAL_MACROCONTEXT_CASES[0]!

  if (body.action === 'simulate_sensitivity') {
    const simulation = simulateAnchoredSensitivity(macroCase, body.parameterId, body.variedValue)
    return Response.json({
      success: true,
      action: body.action,
      caseId: macroCase.id,
      simulation,
    })
  }

  // Construct submission from nested object or top-level payload fields
  const submission = body.submission ?? {
    caseId: body.caseId ?? macroCase.id,
    extractedDataValues: body.extractedDataValues ?? {
      'data-dist-oneway': 120,
      'data-cruising-speed': 100,
      'data-headwind': 20,
      'data-fuel-burn': 8.0,
      'data-total-fuel': 36,
      'data-reserve-required': 5,
    },
    subGoalSequence: body.subGoalSequence ?? macroCase.subGoalHierarchy.map((sg) => sg.id),
    calculatedSubGoalOutputs:
      body.calculatedSubGoalOutputs ??
      Object.fromEntries(macroCase.subGoalHierarchy.map((sg) => [sg.id, sg.expectedValue])),
    finalDecisionChoice: body.finalDecisionChoice ?? 'delay_departure',
    decisionJustification:
      body.decisionJustification ??
      'Analyzing multi-constraint boundary conditions against safety limits.',
  }

  const evaluation = evaluateAnchoredSolution(macroCase, submission)

  if (body.action === 'generate_deck') {
    const deck = generateAnchoredFSRSDeck(macroCase, evaluation)
    return Response.json(deck)
  }

  // Default: evaluate_solution
  return Response.json({
    success: true,
    action: body.action,
    caseId: macroCase.id,
    evaluation,
  })
})
