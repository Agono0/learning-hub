/**
 * @file apps/web/src/server/handlers/reciprocal-teaching/route.ts
 * @description Runtime-neutral API handler for Reciprocal Teaching & Dialogic Questioning Studio.
 *
 * Implements:
 * - GET /api/reciprocal-teaching — Retrieves canonical multidisciplinary text passages and stems.
 * - POST /api/reciprocal-teaching — Evaluates dialogue sessions (ICAP, RSBS, EDI, MRR, RDMS),
 *                                  generates Socratic peer responses, classifies engagement,
 *                                  and exports calibrated FSRS-6 review decks.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  CANONICAL_TEXT_PASSAGES,
  DialogueTurnSchema,
  ReciprocalRoleEnum,
  classifyICAPEngagement,
  evaluateReciprocalSession,
  generatePeerDialogicTurn,
  generateReciprocalFSRSDeck,
} from '@learning-hub/core/reciprocal-teaching'
import { readJson, withRoute } from '@/lib/api'

const ReciprocalActionSchema = z.object({
  action: z
    .enum(['evaluate_session', 'generate_peer_turn', 'classify_turn', 'generate_deck'])
    .default('evaluate_session'),
  passageId: z.string().default('passage-endosymbiosis'),
  turns: z.array(DialogueTurnSchema).default([]),
  preferredRole: ReciprocalRoleEnum.optional(),
  turnText: z.string().optional(),
  isResponsive: z.boolean().default(false),
  previousTurn: DialogueTurnSchema.optional(),
})

export const GET = withRoute(async () => {
  return Response.json({
    success: true,
    passages: CANONICAL_TEXT_PASSAGES,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, ReciprocalActionSchema)
  const passage =
    CANONICAL_TEXT_PASSAGES.find((p) => p.id === body.passageId) ?? CANONICAL_TEXT_PASSAGES[0]!

  if (body.action === 'generate_peer_turn') {
    const peerTurn = generatePeerDialogicTurn(passage, body.turns, body.preferredRole)
    return Response.json({
      success: true,
      action: body.action,
      passageId: passage.id,
      peerTurn,
    })
  }

  if (body.action === 'classify_turn') {
    const text = body.turnText ?? ''
    const classification = classifyICAPEngagement(text, body.isResponsive, body.previousTurn)
    return Response.json({
      success: true,
      action: body.action,
      classification,
    })
  }

  if (body.action === 'generate_deck') {
    const evaluation = evaluateReciprocalSession(body.turns, passage)
    const deck = generateReciprocalFSRSDeck(passage, body.turns, evaluation)
    return Response.json(deck)
  }

  // Default: evaluate_session
  const evaluation = evaluateReciprocalSession(body.turns, passage)
  return Response.json({
    success: true,
    action: body.action,
    passageId: passage.id,
    evaluation,
  })
})
