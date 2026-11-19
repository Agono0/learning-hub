/**
 * @file apps/web/src/server/handlers/knowledge-space/route.ts
 * @description Runtime-neutral API handler for Knowledge Space Theory (KST) & Adaptive Prerequisite Graph Studio.
 *
 * Implements:
 * - GET /api/knowledge-space — Lists canonical benchmark knowledge spaces (Algebra, DSA).
 * - POST /api/knowledge-space — Adaptive Markovian assessment, fringe calculations, FSRS-6 deck generation,
 *                              and well-graded learning space auditing.
 *
 * Strictly adheres to AGENTS.md Rule 2 (runtime-neutral) and Rule 5 (Zod at boundaries).
 */

import { z } from 'zod'
import {
  getCanonicalKnowledgeSpaces,
  initializeMarkovianSession,
  updateBeliefPosterior,
  diagnoseLearner,
  computeFringes,
  generateKSTCalibratedDeck,
  verifyWellGradedStructure,
  auditCurriculumStructure,
  KSTCardGenerationConfigSchema,
  AdaptiveAssessmentSessionSchema,
} from '@learning-hub/core/knowledge-space'
import { readJson, withRoute } from '@/lib/api'

const KstActionSchema = z.object({
  action: z
    .enum([
      'start_session',
      'submit_response',
      'diagnose',
      'compute_fringes',
      'generate_deck',
      'audit_curriculum',
      'verify_structure',
    ])
    .default('start_session'),
  domainId: z.string().default('elementary-algebra'),
  session: AdaptiveAssessmentSessionSchema.optional(),
  response: z
    .object({
      itemId: z.string(),
      isCorrect: z.boolean(),
      responseTimeMs: z.number().int().nonnegative().optional(),
    })
    .optional(),
  stateItems: z.array(z.string()).optional(),
  deckConfig: KSTCardGenerationConfigSchema.optional(),
  curriculum: z
    .object({
      id: z.string(),
      title: z.string(),
      modules: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          lessons: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              prerequisites: z.array(z.string()).optional(),
              difficulty: z.number().optional(),
            }),
          ),
        }),
      ),
    })
    .optional(),
})

export const GET = withRoute(async () => {
  const spaces = getCanonicalKnowledgeSpaces()

  return Response.json({
    success: true,
    spaces: spaces.map((s) => ({
      domainId: s.domainId,
      title: s.title,
      description: s.description,
      itemCount: s.domainItems.length,
      stateCount: s.states.length,
      isWellGraded: s.isWellGraded,
      domainItems: s.domainItems,
      states: s.states,
    })),
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, KstActionSchema)
  const canonicalSpaces = getCanonicalKnowledgeSpaces()
  const structure = canonicalSpaces.find((s) => s.domainId === body.domainId) || canonicalSpaces[0]!

  if (body.action === 'start_session') {
    const session = initializeMarkovianSession(structure, 'uniform')
    return Response.json({
      success: true,
      action: body.action,
      session,
    })
  }

  if (body.action === 'submit_response') {
    if (!body.session || !body.response) {
      return Response.json(
        { success: false, error: 'Both session and response are required for submit_response.' },
        { status: 400 },
      )
    }

    const updatedSession = updateBeliefPosterior(body.session, structure, body.response)
    const diagnosis = diagnoseLearner(updatedSession, structure)

    return Response.json({
      success: true,
      action: body.action,
      session: updatedSession,
      diagnosis,
    })
  }

  if (body.action === 'diagnose') {
    const session = body.session || initializeMarkovianSession(structure, 'uniform')
    const diagnosis = diagnoseLearner(session, structure)

    return Response.json({
      success: true,
      action: body.action,
      diagnosis,
    })
  }

  if (body.action === 'compute_fringes') {
    const items = body.stateItems || []
    const fringes = computeFringes(items, structure)

    return Response.json({
      success: true,
      action: body.action,
      fringes,
    })
  }

  if (body.action === 'generate_deck') {
    const sessionOrState =
      body.session ||
      structure.states.find((s) => s.stateId === body.session?.mostLikelyStateId) ||
      structure.states[1] ||
      structure.states[0]!

    const deck = generateKSTCalibratedDeck(structure, sessionOrState, body.deckConfig || {})

    return Response.json({
      success: true,
      action: body.action,
      deck,
    })
  }

  if (body.action === 'audit_curriculum' && body.curriculum) {
    const report = auditCurriculumStructure(body.curriculum)

    return Response.json({
      success: true,
      action: body.action,
      report,
    })
  }

  if (body.action === 'verify_structure') {
    const report = verifyWellGradedStructure(structure)

    return Response.json({
      success: true,
      action: body.action,
      isWellGraded: report.isWellGraded,
      violations: report.violations,
    })
  }

  // Fallback
  const defaultSession = initializeMarkovianSession(structure, 'uniform')
  return Response.json({
    success: true,
    action: body.action,
    session: defaultSession,
  })
})
