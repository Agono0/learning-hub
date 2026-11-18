/**
 * @file apps/web/src/server/handlers/peer-instruction/route.ts
 * @description Runtime-neutral API handler for Peer Instruction & ConcepTest Studio.
 *
 * Implements:
 * - GET /api/peer-instruction — Retrieves canonical ConcepTest suites.
 * - POST /api/peer-instruction — Evaluates individual and revote trajectories,
 *                               calculates Hake normalized gain (<g>), Mazur polarization,
 *                               and exports calibrated FSRS-6 flashcards.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral, zero node:* imports)
 * and Rule 5 (Zod validation at boundaries).
 */

import { z } from 'zod'
import {
  calculatePIMetrics,
  generatePIFSRSCards,
  getCanonicalConcepTestSuites,
  getConcepTestSuiteById,
} from '@learning-hub/core/peer-instruction'
import { readJson, withRoute } from '@/lib/api'

const PIActionSchema = z.object({
  action: z
    .enum(['calculate_metrics', 'get_dialogue', 'generate_deck'])
    .default('calculate_metrics'),
  suiteId: z.string().default('ct-thermal-expansion-plate'),
  q1InitialOptionId: z.string().optional(),
  q1InitialConfidence: z.number().min(1).max(5).default(3),
  q1RevoteOptionId: z.string().optional(),
  q1RevoteConfidence: z.number().min(1).max(5).default(4),
  q2TransferOptionId: z.string().optional(),
  peerDiscussionOccurred: z.boolean().default(true),
  simulatedClassroomAccuracyVote1: z.number().min(0).max(100).optional(),
  simulatedClassroomAccuracyVote2: z.number().min(0).max(100).optional(),
})

export const GET = withRoute(async () => {
  const suites = getCanonicalConcepTestSuites()
  return Response.json({
    success: true,
    suites,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, PIActionSchema)
  const suite = getConcepTestSuiteById(body.suiteId) || getCanonicalConcepTestSuites()[0]

  if (body.action === 'get_dialogue') {
    return Response.json({
      success: true,
      action: body.action,
      suiteId: suite.id,
      simulatedPeers: suite.simulatedPeers,
      voteDistribution: suite.q1ClassroomVoteDistribution,
    })
  }

  const q1Initial = body.q1InitialOptionId || suite.q1Options[0].id
  const q1Revote =
    body.q1RevoteOptionId || suite.q1Options.find((o) => o.isCorrect)?.id || q1Initial
  const q2Transfer =
    body.q2TransferOptionId || suite.q2Options.find((o) => o.isCorrect)?.id || suite.q2Options[0].id

  const metrics = calculatePIMetrics({
    suite,
    q1InitialOptionId: q1Initial,
    q1InitialConfidence: body.q1InitialConfidence,
    q1RevoteOptionId: q1Revote,
    q1RevoteConfidence: body.q1RevoteConfidence,
    q2TransferOptionId: q2Transfer,
    peerDiscussionOccurred: body.peerDiscussionOccurred,
    simulatedClassroomAccuracyVote1: body.simulatedClassroomAccuracyVote1,
    simulatedClassroomAccuracyVote2: body.simulatedClassroomAccuracyVote2,
  })

  if (body.action === 'generate_deck') {
    const deck = generatePIFSRSCards(suite, metrics)
    return Response.json({
      success: true,
      action: body.action,
      suiteId: suite.id,
      metrics,
      deck,
    })
  }

  return Response.json({
    success: true,
    action: body.action,
    suiteId: suite.id,
    metrics,
  })
})
