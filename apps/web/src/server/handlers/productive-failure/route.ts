/**
 * @file apps/web/src/server/handlers/productive-failure/route.ts
 * @description Runtime-neutral API handler for Productive Failure & Canonical Consolidation Studio.
 *
 * Implements:
 * - GET /api/productive-failure — Retrieves canonical multidisciplinary scenarios.
 * - POST /api/productive-failure — Evaluates student representations, computes quantitative
 *                                 Productive Failure metrics (PFI, GDI, ISS, CIG, ATS),
 *                                 or generates calibrated FSRS-6 card decks.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  calculatePFMetrics,
  evaluateStudentRepresentation,
  generatePFFSRSCards,
  getCanonicalPFScenarios,
  getPFScenarioById,
  ImpasseAnalysisSchema,
  StudentGeneratedRepresentationSchema,
} from '@learning-hub/core/productive-failure'
import { readJson, withRoute } from '@/lib/api'

const PFActionSchema = z.object({
  action: z
    .enum(['calculate_metrics', 'evaluate_representation', 'generate_deck'])
    .default('calculate_metrics'),
  scenarioId: z.string().default('pf-variance-dispersion'),
  representationInput: z
    .object({
      title: z.string().min(1),
      description: z.string().default(''),
      mechanism: z.string().default(''),
      structuralFeatures: z.array(z.string()).default([]),
    })
    .optional(),
  representations: z.array(StudentGeneratedRepresentationSchema).optional(),
  impasse: ImpasseAnalysisSchema.optional(),
  consolidationRatings: z
    .object({
      featureAlignment: z.number().min(0).max(100).default(80),
      parameterMapping: z.number().min(0).max(100).default(80),
      invariantGrasp: z.number().min(0).max(100).default(80),
    })
    .optional(),
  transferResults: z
    .array(
      z.object({
        probeId: z.string(),
        isCorrect: z.boolean(),
        confidence: z.number().min(1).max(5).default(3),
      }),
    )
    .optional(),
})

export const GET = withRoute(async () => {
  const scenarios = getCanonicalPFScenarios()
  return Response.json({
    success: true,
    scenarios,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, PFActionSchema)
  const scenario = getPFScenarioById(body.scenarioId) || getCanonicalPFScenarios()[0]

  if (body.action === 'evaluate_representation') {
    const input = body.representationInput || {
      title: 'Intuitive Hypothesis',
      description: '',
      mechanism: '',
      structuralFeatures: [],
    }

    const evaluation = evaluateStudentRepresentation(scenario.id, input)

    return Response.json({
      success: true,
      action: body.action,
      representation: evaluation,
    })
  }

  const representations =
    body.representations && body.representations.length > 0
      ? body.representations
      : scenario.exemplarStudentRepresentations.slice(0, 2)

  const impasse = body.impasse || {
    impasseEncountered: true,
    failureModeIdentified: 'Boundary distribution breakdown',
    boundaryConditionsTested: ['Outliers', 'Zeros'],
    knowledgeGapArticulated: 'Need canonical invariant mapping',
    affectiveImpasseRating: 4,
    impasseDepthScore: 75,
  }

  const consolidationRatings = body.consolidationRatings || {
    featureAlignment: 80,
    parameterMapping: 80,
    invariantGrasp: 80,
  }

  const transferResults = body.transferResults || [
    { probeId: scenario.transferProbes[0].probeId, isCorrect: true, confidence: 4 },
  ]

  const metrics = calculatePFMetrics({
    representations,
    impasse,
    consolidationRatings,
    transferResults,
  })

  if (body.action === 'generate_deck') {
    const deck = generatePFFSRSCards(scenario, metrics)
    return Response.json({
      success: true,
      action: body.action,
      scenarioId: scenario.id,
      metrics,
      deck,
    })
  }

  return Response.json({
    success: true,
    action: body.action,
    scenarioId: scenario.id,
    metrics,
  })
})
