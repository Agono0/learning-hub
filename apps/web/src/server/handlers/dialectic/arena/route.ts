/**
 * /api/dialectic/arena — Multi-agent dialectical courtroom debate & fallacy grading.
 *
 * Manual mode by design (works with AI provider `none`): debates come from the
 * built-in case library (`DEBATE_CASE_LIBRARY`) whose fallacies are planted per
 * turn, so every grade is exact and offline.
 *
 * GET  `?id=` → one stored debate (+ its case metadata); no id → recent debates
 *               plus the case library summary.
 * POST `start_case`      → store a new debate from a library case.
 *      `create_debate`   → store a custom transcript (validated turn-by-turn).
 *      `evaluate_fallacy`→ grade a flag on ONE turn against that turn's stored
 *                          planted fallacies (the client never sends the answer key).
 *      `submit_verdict`  → rule-based score of the closing ruling; stored with XP
 *                          (first verdict per debate only), atomically.
 *      `protege_explain` → Alex's honest rule-based reaction to an explanation.
 */
import { z } from 'zod'
import {
  DEBATE_CASE_LIBRARY,
  FALLACY_DEFINITIONS,
  XP_REWARDS,
  assessDebateVerdict,
  debateCaseTranscript,
  debateTurnSchema,
  evaluateFallacyFlag,
  generateProtegeInquiry,
  getDebateCase,
  logicalFallacySchema,
  plantedFallaciesForTurn,
  respondAsProtege,
  type DebateCase,
  type DebateTurn,
} from '@learning-hub/core'
import {
  getDialecticDebate,
  listDialecticDebates,
  recordDialecticDebate,
  submitDialecticVerdict,
} from '@learning-hub/db'
import { ApiError, readJson, readQuery, withRoute } from '@/lib/api'

/** Minimum verdict score (0–100) that earns XP — rewards a real synthesis, not "ok". */
const VERDICT_XP_THRESHOLD = 40

const debateActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start_case'), slug: z.string().min(1) }),
  z.object({
    action: z.literal('create_debate'),
    topic: z.string().trim().min(1).max(300),
    thesisAgentRole: z.string().trim().min(1).max(200),
    antithesisAgentRole: z.string().trim().min(1).max(200),
    transcript: z.array(debateTurnSchema).max(100).default([]),
  }),
  z.object({
    action: z.literal('evaluate_fallacy'),
    id: z.number().int().positive(),
    turnId: z.string().min(1),
    fallacy: logicalFallacySchema,
  }),
  z.object({
    action: z.literal('submit_verdict'),
    id: z.number().int().positive(),
    verdict: z.string().trim().min(15).max(5000),
  }),
  z.object({
    action: z.literal('protege_explain'),
    slug: z.string().min(1),
    explanation: z.string().trim().min(1).max(5000),
  }),
])

const debateQuerySchema = z.object({
  id: z.coerce.number().int().positive().optional(),
})

/** Library case a stored debate was started from (matched by topic), if any. */
function caseForTopic(topic: string): DebateCase | undefined {
  return DEBATE_CASE_LIBRARY.find((c) => c.topic.topic === topic)
}

/** What the page needs to know about a case beyond the stored transcript. */
function caseMeta(c: DebateCase | undefined) {
  if (!c) return null
  return {
    slug: c.slug,
    coreConcepts: c.topic.coreConcepts,
    protegeConcept: c.protegeConcept,
    protegeQuestion: generateProtegeInquiry(c.protegeConcept, 0),
  }
}

/** Strip the answer key before a transcript leaves the server. */
function publicTranscript(transcript: readonly DebateTurn[]) {
  return transcript.map(({ fallaciesFlagged: _answerKey, ...turn }) => turn)
}

function publicDebate(debate: NonNullable<ReturnType<typeof getDialecticDebate>>) {
  return { ...debate, transcript: publicTranscript(debate.transcript ?? []) }
}

export const GET = withRoute(async (req: Request) => {
  const { id } = readQuery(req, debateQuerySchema)

  if (id !== undefined) {
    const debate = getDialecticDebate(id)
    if (!debate) throw new ApiError(404, 'Debate not found')
    return Response.json({
      ok: true,
      debate: publicDebate(debate),
      case: caseMeta(caseForTopic(debate.topic)),
      fallacyCatalog: FALLACY_DEFINITIONS,
    })
  }

  return Response.json({
    ok: true,
    debates: listDialecticDebates(20).map(publicDebate),
    cases: DEBATE_CASE_LIBRARY.map((c) => ({
      slug: c.slug,
      topic: c.topic.topic,
      domain: c.topic.domain,
      thesisRole: c.topic.thesisRole,
      antithesisRole: c.topic.antithesisRole,
    })),
    fallacyCatalog: FALLACY_DEFINITIONS,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, debateActionSchema)

  switch (body.action) {
    case 'start_case': {
      const c = getDebateCase(body.slug)
      if (!c) throw new ApiError(404, 'unknown debate case')
      const debate = recordDialecticDebate({
        topic: c.topic.topic,
        thesisAgentRole: c.topic.thesisRole,
        antithesisAgentRole: c.topic.antithesisRole,
        transcript: debateCaseTranscript(c),
      })
      return Response.json(
        { ok: true, debate: publicDebate(debate), case: caseMeta(c) },
        { status: 201 },
      )
    }

    case 'create_debate': {
      const debate = recordDialecticDebate({
        topic: body.topic,
        thesisAgentRole: body.thesisAgentRole,
        antithesisAgentRole: body.antithesisAgentRole,
        transcript: body.transcript,
      })
      return Response.json({ ok: true, debate: publicDebate(debate) }, { status: 201 })
    }

    case 'evaluate_fallacy': {
      const debate = getDialecticDebate(body.id)
      if (!debate) throw new ApiError(404, 'Debate not found')
      const turn = (debate.transcript ?? []).find((t) => t.id === body.turnId)
      if (!turn) throw new ApiError(404, 'Turn not found in this debate')
      const result = evaluateFallacyFlag(
        turn.argumentText,
        body.fallacy,
        plantedFallaciesForTurn(debate.transcript ?? [], body.turnId),
      )
      // Flags are free to retry, so they earn no XP (only the stored verdict does).
      return Response.json({
        ok: true,
        correct: result.correct,
        fallacy: result.fallacy,
        explanation: result.explanation,
      })
    }

    case 'submit_verdict': {
      const debate = getDialecticDebate(body.id)
      if (!debate) throw new ApiError(404, 'Debate not found')
      const assessment = assessDebateVerdict(
        body.verdict,
        caseForTopic(debate.topic)?.topic.coreConcepts ?? [],
      )
      const xp = assessment.score >= VERDICT_XP_THRESHOLD ? XP_REWARDS.debate : 0
      const saved = submitDialecticVerdict(body.id, body.verdict, assessment.score, xp)
      if (!saved) throw new ApiError(404, 'Debate not found')
      return Response.json({
        ok: true,
        debate: publicDebate(saved.debate),
        assessment,
        xpAwarded: saved.xpAwarded,
      })
    }

    case 'protege_explain': {
      const c = getDebateCase(body.slug)
      if (!c) throw new ApiError(404, 'unknown debate case')
      return Response.json({
        ok: true,
        ...respondAsProtege(body.explanation, c.protegeConcept, c.protegeKeyConcepts),
      })
    }
  }
})
