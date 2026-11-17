/**
 * /api/cognitive/pretesting — Kornell, Hays & Bjork (2009) pretesting-effect
 * protocol over REAL card content.
 *
 * GET  → Select the learner's youngest/hardest cards (where a pre-study
 *        encoding event adds the most), build deterministic pretest questions
 *        from their actual prompts/targets, and score each question against
 *        the Little & Bjork (2016) solid-pretest gate. Empty deck → honest
 *        empty candidate list.
 * POST → Evaluate explicit pretest attempts + study episodes through the pure
 *        engine (protocol compliance, hypercorrection targets, successive-
 *        relearning queue).
 */
import { z } from 'zod'
import { asc, eq } from 'drizzle-orm'
import {
  buildPretestQuestion,
  evaluatePretestingSession,
  pretestAttemptSchema,
  pretestRelatedness,
  studyEpisodeSchema,
  selectPretestCandidates,
  type PretestCardState,
  type PretestingSessionReport,
} from '@learning-hub/core'
import { db } from '@/lib/db'
import { cards } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const pretestInputSchema = z.object({
  /** Card protocol states built by the studio (attempts + study episodes) */
  cards: z.array(
    z.object({
      cardId: z.number().int().positive(),
      prompt: z.string().min(1),
      target: z.string().min(1),
      kind: z.string().optional(),
      relatedness: z.number().min(0).max(1).optional(),
      attempts: z.array(pretestAttemptSchema).default([]),
      studyEpisodes: z.array(studyEpisodeSchema).default([]),
      criterionRecalls: z.number().int().min(1).default(3),
      successfulRecalls: z.number().int().min(0).default(0),
      criterionMet: z.boolean().default(false),
    }),
  ),
})

interface CandidateRow {
  id: number
  type: string
  content: unknown
  stability: number
  difficulty: number
}

/** Best-effort front/back extraction from card content JSON. */
function frontBackOf(content: unknown): { front: string; back: string } | null {
  if (!content || typeof content !== 'object') return null
  const c = content as Record<string, unknown>
  if (c.basic && typeof c.basic === 'object') {
    const b = c.basic as Record<string, unknown>
    if (typeof b.front === 'string' && typeof b.back === 'string') {
      return { front: b.front, back: b.back }
    }
  }
  if (typeof c.front === 'string' && typeof c.back === 'string') {
    return { front: c.front, back: c.back }
  }
  return null
}

/** GET /api/cognitive/pretesting — real candidates + built questions. */
export const GET = withRoute(async () => {
  const rows: CandidateRow[] = db
    .select({
      id: cards.id,
      type: cards.type,
      content: cards.content,
      stability: cards.stability,
      difficulty: cards.difficulty,
    })
    .from(cards)
    .where(eq(cards.suspended, false))
    .orderBy(asc(cards.stability))
    .limit(120)
    .all()

  const usable = rows
    .filter((r) => r.stability < 3 && frontBackOf(r.content) !== null)
    .map((r) => ({
      cardId: r.id,
      stability: r.stability,
      difficulty: r.difficulty,
    }))

  const picked = selectPretestCandidates(usable, 10)
  const byId = new Map(picked.map((c) => [c.cardId, c]))

  const questions = [...byId.keys()].flatMap((cardId) => {
    const row = rows.find((r) => r.id === cardId)
    const fb = row ? frontBackOf(row.content) : null
    if (!fb) return []
    const built = buildPretestQuestion(fb.front, fb.back)
    const relatedness = pretestRelatedness(built.question, fb.back)
    return [
      {
        cardId,
        front: fb.front,
        target: fb.back,
        kind: built.kind,
        question: built.question,
        relatedness,
        solidPretest: relatedness >= 0.5,
        stability: byId.get(cardId)?.stability ?? 0,
        difficulty: byId.get(cardId)?.difficulty ?? 5,
      },
    ]
  })

  return Response.json({
    ok: true,
    candidates: questions,
    sampleSize: questions.length,
    protocol: {
      name: 'pretest → feedback → study → retest',
      citation: 'Kornell, Hays & Bjork (2009); Little & Bjork (2016); Butler & Roediger (2008)',
      note: 'A wrong guess followed by immediate study is the protocol working, not failing.',
    },
  })
})

/** POST /api/cognitive/pretesting — evaluate explicit protocol trials. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, pretestInputSchema)
  const states: PretestCardState[] = body.cards.map((c) => ({
    cardId: c.cardId,
    prompt: c.prompt,
    target: c.target,
    kind: (c.kind as PretestCardState['kind']) ?? 'direct_retrieval',
    relatedness: c.relatedness ?? pretestRelatedness(c.prompt, c.target),
    attempts: c.attempts,
    studyEpisodes: c.studyEpisodes,
    criterionRecalls: c.criterionRecalls,
    successfulRecalls: c.successfulRecalls,
    criterionMet: c.criterionMet,
  }))

  const report: PretestingSessionReport = evaluatePretestingSession(states)
  return Response.json({ ok: true, report, cardCount: states.length })
})
