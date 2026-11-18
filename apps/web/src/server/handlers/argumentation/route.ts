/**
 * @file apps/web/src/server/handlers/argumentation/route.ts
 * @description Runtime-neutral API handler for Claim-Evidence-Reasoning & Argumentation Studio.
 *
 * Implements:
 * - GET /api/argumentation — Retrieves canonical scientific debate cases.
 * - POST /api/argumentation — Evaluates argument submissions (CER, TAP levels, ERS),
 *                             generates Socratic counter-arguments, and exports calibrated
 *                             FSRS-6 review decks.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  CANONICAL_SCIENTIFIC_DEBATES,
  CERArgumentSubmissionSchema,
  evaluateCERArgument,
  generateAdversarialCounterArgument,
  generateCERFSRSDeck,
} from '@learning-hub/core/argumentation'
import { readJson, withRoute } from '@/lib/api'

const ArgumentationActionSchema = z.object({
  action: z
    .enum(['evaluate_argument', 'counter_argue', 'generate_deck'])
    .default('evaluate_argument'),
  debateId: z.string().default('debate-amoc-tipping'),
  selectedClaimId: z.string().optional(),
  claimStatement: z.string().optional(),
  selectedEvidenceIds: z.array(z.string()).optional(),
  userEvidenceSynthesis: z.string().optional(),
  selectedPrincipleIds: z.array(z.string()).optional(),
  userReasoningStatement: z.string().optional(),
  targetedCounterArgumentId: z.string().optional(),
  userRebuttalStatement: z.string().optional(),
  submission: CERArgumentSubmissionSchema.optional(),
})

export const GET = withRoute(async () => {
  return Response.json({
    success: true,
    debates: CANONICAL_SCIENTIFIC_DEBATES,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, ArgumentationActionSchema)
  const debate =
    CANONICAL_SCIENTIFIC_DEBATES.find((d) => d.id === body.debateId) ??
    CANONICAL_SCIENTIFIC_DEBATES[0]!

  if (body.action === 'counter_argue') {
    const claimId = body.selectedClaimId ?? debate.competingClaims[0]!.id
    const counter = generateAdversarialCounterArgument(debate, claimId)
    return Response.json({
      success: true,
      action: body.action,
      debateId: debate.id,
      counterArgument: counter,
    })
  }

  // Construct submission from nested submission or top-level fields
  const submission = body.submission ?? {
    debateId: body.debateId ?? debate.id,
    selectedClaimId: body.selectedClaimId ?? debate.competingClaims[0]!.id,
    claimStatement: body.claimStatement ?? debate.competingClaims[0]!.claim,
    selectedEvidenceIds: body.selectedEvidenceIds ?? [debate.evidencePool[0]!.id],
    userEvidenceSynthesis:
      body.userEvidenceSynthesis ?? 'Primary evidence synthesized from observational records.',
    selectedPrincipleIds: body.selectedPrincipleIds ?? [debate.scientificPrinciples[0]!.id],
    userReasoningStatement:
      body.userReasoningStatement ?? 'Grounded in fundamental domain axioms and causal links.',
    targetedCounterArgumentId: body.targetedCounterArgumentId,
    userRebuttalStatement: body.userRebuttalStatement,
  }

  const evaluation = evaluateCERArgument(debate, submission)

  if (body.action === 'generate_deck') {
    const deck = generateCERFSRSDeck(debate, submission, evaluation)
    return Response.json(deck)
  }

  // Default: evaluate_argument
  return Response.json({
    success: true,
    action: body.action,
    debateId: debate.id,
    evaluation,
  })
})
