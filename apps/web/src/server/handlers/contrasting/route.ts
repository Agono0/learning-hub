/**
 * @file apps/web/src/server/handlers/contrasting/route.ts
 * @description Runtime-neutral API handler for Contrasting Cases & Inventing with Examples.
 *
 * Implements:
 * - GET /api/contrasting — Retrieves all canonical contrasting case sets.
 * - POST /api/contrasting — Evaluates learner invented metric (FDRS, IMI, PFRI, CDTS)
 *                          and generates calibrated FSRS-6 decks.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  CANONICAL_CONTRASTING_SETS,
  InventedMetricSubmissionSchema,
  evaluateContrastingAttempt,
  generateContrastingFSRSDeck,
} from '@learning-hub/core/contrasting'
import { readJson, withRoute } from '@/lib/api'

const ContrastingActionSchema = z.object({
  action: z.enum(['evaluate_invention', 'generate_deck']).default('evaluate_invention'),
  setId: z.string().default('set-density-buoyancy'),
  submission: InventedMetricSubmissionSchema.optional(),
  inventedMetricName: z.string().optional(),
  formulaDescription: z.string().optional(),
  selectedDimensionIds: z.array(z.string()).optional(),
  variantRankings: z.array(z.string()).optional(),
  impasseEncountered: z.boolean().optional(),
  reflectionNotes: z.string().optional(),
})

export const GET = withRoute(async () => {
  return Response.json({
    success: true,
    sets: CANONICAL_CONTRASTING_SETS,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, ContrastingActionSchema)
  const caseSet =
    CANONICAL_CONTRASTING_SETS.find((s) => s.id === body.setId) ?? CANONICAL_CONTRASTING_SETS[0]!

  const submission = body.submission ?? {
    setId: caseSet.id,
    inventedMetricName: body.inventedMetricName ?? 'My Invariant Metric',
    formulaDescription:
      body.formulaDescription ??
      'Dividing mass by volume coordinates space and matter across contrasting cylinders.',
    selectedDimensionIds:
      body.selectedDimensionIds ??
      caseSet.dimensions.filter((d) => d.isDeepDimension).map((d) => d.id),
    variantRankings: body.variantRankings ?? caseSet.variants.map((v) => v.id),
    impasseEncountered: body.impasseEncountered ?? true,
    reflectionNotes:
      body.reflectionNotes ??
      'Notice that heavy objects float if their volume is large, while light objects sink if small.',
  }

  const evaluation = evaluateContrastingAttempt(caseSet, submission)

  if (body.action === 'generate_deck') {
    const deck = generateContrastingFSRSDeck(caseSet, evaluation)
    return Response.json(deck)
  }

  // Default: evaluate_invention
  return Response.json({
    success: true,
    action: body.action,
    setId: caseSet.id,
    evaluation,
  })
})
