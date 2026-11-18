/**
 * @file apps/web/src/server/handlers/threshold/route.ts
 * @description Runtime-neutral API handler for Threshold Concepts & Liminal Navigation Studio.
 *
 * Implements:
 * - GET /api/threshold — Retrieves standard benchmark threshold concepts and mimicry boundary probes.
 * - POST /api/threshold — Evaluates liminal trajectory, detects mimicry vs genuine integration,
 *                         or bridges to curriculum gateway transfer.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  getStandardThresholdConcepts,
  getStandardMimicryProbes,
  computeThresholdSignificanceIndex,
  computeOscillationIndex,
  evaluateLiminalTrajectory,
  bridgeThresholdToCurriculum,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const ThresholdActionSchema = z.object({
  action: z
    .enum(['evaluate_trajectory', 'compute_tsi', 'compute_oscillation', 'bridge_curriculum'])
    .default('evaluate_trajectory'),
  conceptId: z.string().default('tc_pointers_memory'),
  selectedOptionIds: z.record(z.string(), z.string()).optional(),
  evaluations: z
    .array(
      z.object({
        timestamp: z.string(),
        confidenceScore: z.number(),
        performanceScore: z.number(),
        isMimicryDetected: z.boolean(),
        notes: z.string(),
      }),
    )
    .optional(),
  baseMastery: z.number().min(0).max(1).optional(),
  fluencyScore: z.number().min(0).max(100).optional(),
  phase: z.enum(['PRE_LIMINAL', 'LIMINAL_OSCILLATING', 'POST_LIMINAL_TRANSFORMED']).optional(),
})

export const GET = withRoute(async () => {
  const concepts = getStandardThresholdConcepts()
  const probes = getStandardMimicryProbes()

  return Response.json({
    concepts,
    probes,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, ThresholdActionSchema)

  if (body.action === 'evaluate_trajectory') {
    const diagnostic = evaluateLiminalTrajectory(body.conceptId, body.selectedOptionIds ?? {})
    const bridge = bridgeThresholdToCurriculum(
      body.baseMastery ?? 0.8,
      diagnostic.overallFluencyScore,
      diagnostic.phase,
      body.conceptId,
    )
    return Response.json({
      success: true,
      action: body.action,
      diagnostic,
      bridge,
    })
  }

  if (body.action === 'compute_oscillation') {
    const oscillationIndex = computeOscillationIndex(body.evaluations ?? [])
    return Response.json({
      success: true,
      action: body.action,
      oscillationIndex,
    })
  }

  if (body.action === 'compute_tsi') {
    const concepts = getStandardThresholdConcepts()
    const target = concepts.find((c) => c.id === body.conceptId) ?? concepts[0]
    const tsi = computeThresholdSignificanceIndex(target.criteriaScores)
    return Response.json({
      success: true,
      action: body.action,
      conceptId: target.id,
      tsi,
    })
  }

  // Action: bridge_curriculum
  const bridge = bridgeThresholdToCurriculum(
    body.baseMastery ?? 0.8,
    body.fluencyScore ?? 85,
    body.phase ?? 'POST_LIMINAL_TRANSFORMED',
    body.conceptId,
  )
  return Response.json({
    success: true,
    action: body.action,
    bridge,
  })
})
