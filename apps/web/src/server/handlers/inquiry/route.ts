/**
 * @file apps/web/src/server/handlers/inquiry/route.ts
 * @description Runtime-neutral API handler for Scientific Inquiry & Discovery Studio.
 *
 * Implements:
 * - GET /api/inquiry — Retrieves canonical inquiry laboratory suites.
 * - POST /api/inquiry — Executes simulation trials, evaluates VOTAT variable control,
 *                      and exports calibrated FSRS-6 review flashcards.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  AnomalousDataReactionEnum,
  calculateInquiryMetrics,
  generateInquiryFSRSCards,
  getCanonicalInquiryLabs,
  getInquiryLabById,
  runInquiryTrial,
} from '@learning-hub/core/inquiry'
import { readJson, withRoute } from '@/lib/api'

const InquiryActionSchema = z.object({
  action: z.enum(['run_trial', 'calculate_metrics', 'generate_deck']).default('calculate_metrics'),
  labId: z.string().default('lab-pendulum-period'),
  trialIndex: z.number().int().nonnegative().default(0),
  variableSettings: z.record(z.string(), z.number()).default({}),
  previousSettings: z.record(z.string(), z.number()).optional(),
  anomalousReaction: AnomalousDataReactionEnum.optional(),
  anomalousExplanation: z.string().optional(),
  falsificationTrialCount: z.number().int().min(0).default(1),
  finalHypothesisCapturesInvariant: z.boolean().default(true),
})

export const GET = withRoute(async () => {
  const labs = getCanonicalInquiryLabs()
  return Response.json({
    success: true,
    labs,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, InquiryActionSchema)
  const lab = getInquiryLabById(body.labId) ?? getCanonicalInquiryLabs()[0]!

  if (body.action === 'run_trial') {
    const trial = runInquiryTrial(
      lab,
      body.trialIndex,
      body.variableSettings,
      body.previousSettings,
    )
    return Response.json({
      success: true,
      action: body.action,
      labId: lab.id,
      trial,
    })
  }

  // Construct standard trial sequence for metrics calculation
  const t1 = runInquiryTrial(
    lab,
    0,
    body.previousSettings ??
      lab.independentVariables.reduce((acc, v) => ({ ...acc, [v.id]: v.defaultValue }), {}),
  )
  const t2 = runInquiryTrial(lab, 1, body.variableSettings, t1.variableSettings)

  const anomalousSubmissions = body.anomalousReaction
    ? [
        {
          anomalyId: lab.anomalousScenarios[0]?.id ?? 'anomaly-1',
          reaction: body.anomalousReaction,
          articulatedExplanation: body.anomalousExplanation ?? 'Restructured schema',
        },
      ]
    : []

  const metrics = calculateInquiryMetrics({
    lab,
    trials: [t1, t2],
    anomalousSubmissions,
    falsificationTrialCount: body.falsificationTrialCount,
    finalHypothesisCapturesInvariant: body.finalHypothesisCapturesInvariant,
  })

  if (body.action === 'generate_deck') {
    const deck = generateInquiryFSRSCards(lab, metrics)
    return Response.json({
      success: true,
      action: body.action,
      labId: lab.id,
      metrics,
      deck,
    })
  }

  return Response.json({
    success: true,
    action: body.action,
    labId: lab.id,
    metrics,
  })
})
