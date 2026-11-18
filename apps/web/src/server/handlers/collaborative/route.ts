/**
 * Runtime-neutral API handler for Collaborative Scripts & Transactive Discourse Studio
 *
 * Grounded in:
 * - Alison King (1997, 1999) "ASK to THINK - TEL WHY" Guided Reciprocal Questioning
 * - Weinberger & Fischer (2006) CSCL Macro-Scripts
 * - Berkowitz & Gibbs (1983) Transactive Discourse Analysis
 */

import { z } from 'zod'
import {
  CANONICAL_COLLABORATIVE_SCENARIOS,
  evaluateCollaborativeDiscourse,
  generateCollaborativePeerTurn,
  generateCollaborativeFSRSDeck,
  DiscourseSubmissionSchema,
  type DiscourseSubmission,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const postCollaborativeBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('evaluate'),
    submission: DiscourseSubmissionSchema,
  }),
  z.object({
    action: z.literal('partner'),
    scenarioId: z.string(),
    learnerTurnText: z.string(),
    turnIndex: z.number().int().min(0).default(0),
  }),
  z.object({
    action: z.literal('deck'),
    scenarioId: z.string(),
    ceiBaseline: z.number().min(0).max(100).default(85),
  }),
])

export const GET = withRoute(async () => {
  return Response.json({
    ok: true,
    scenarios: CANONICAL_COLLABORATIVE_SCENARIOS,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, postCollaborativeBodySchema)

  if (body.action === 'evaluate') {
    const scenario =
      CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === body.submission.scenarioId) ??
      CANONICAL_COLLABORATIVE_SCENARIOS[0]!
    const evaluation = evaluateCollaborativeDiscourse(scenario, body.submission)
    return Response.json({
      ok: true,
      scenarioTitle: scenario.title,
      evaluation,
    })
  }

  if (body.action === 'partner') {
    const scenario =
      CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === body.scenarioId) ??
      CANONICAL_COLLABORATIVE_SCENARIOS[0]!
    const peerTurn = generateCollaborativePeerTurn(scenario, body.learnerTurnText, body.turnIndex)
    return Response.json({
      ok: true,
      peerTurn,
    })
  }

  // action === 'deck'
  const scenario =
    CANONICAL_COLLABORATIVE_SCENARIOS.find((s) => s.id === body.scenarioId) ??
    CANONICAL_COLLABORATIVE_SCENARIOS[0]!
  const dummySubmission: DiscourseSubmission = {
    scenarioId: scenario.id,
    learnerInitialPosition: 'Initial calibrated anchor.',
    dialogueTurns: [
      {
        id: 'turn-dummy',
        speaker: 'learner',
        role: 'synthesizer',
        text: 'Because we integrate both mechanisms, homeostatic regulation prevents instability.',
        speechAct: 'transactive_synthesis',
        epistemicKeywords: [],
      },
    ],
    jointSynthesis: 'Integrated model coordinating both perspectives.',
    individualTransferAnswer: 'Applied to parallel domain.',
  }
  const evaluation = evaluateCollaborativeDiscourse(scenario, dummySubmission)
  evaluation.cei = body.ceiBaseline
  const deck = generateCollaborativeFSRSDeck(scenario, evaluation)
  return Response.json({
    ok: true,
    deck,
  })
})
