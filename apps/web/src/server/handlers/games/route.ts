/**
 * /api/games — matching-pairs game.
 * GET  { deckId } → playable pairs (generateMatchingPairs over the deck's cards).
 * POST { deckId, correct, total, cardIds? | pairs?, timeMs? } → derive one FSRS
 *   grade from the round accuracy (gradeForAccuracy from core), then run the
 *   canonical engine ONCE: executeBatchReview() over the played cards
 *   (sampled cardIds/pairs, or a sample from the deck when the client only
 *   reports counts). One atomic BEGIN IMMEDIATE transaction covers cards +
 *   revlog (collision-safe ids) + xp_events + streak + Elo/BKT mastery.
 */
import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, cards, executeBatchReview } from '@learning-hub/db'
import { generateMatchingPairs, gradeForAccuracy } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'
import { intParam } from '@/server/query-params'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const deckId = Number(url.searchParams.get('deckId') ?? 0)
  const maxPairs = intParam(url.searchParams.get('maxPairs'), { fallback: 8, min: 1, max: 12 })
  if (!deckId) return Response.json({ error: 'deckId required' }, { status: 400 })
  const rows = await db
    .select()
    .from(cards)
    .where(and(eq(cards.deckId, deckId), eq(cards.suspended, false)))
    .limit(60)
  const game = generateMatchingPairs(
    rows.map((r) => ({ id: r.id, type: r.type, content: r.content, tags: r.tags })),
    { maxPairs },
  )
  return Response.json({
    ok: true,
    deckId,
    pairs: game.pairs,
    lefts: game.lefts,
    rights: game.rights,
  })
}

/** A played pair id: a bare card id, or a pair object carrying one (GET's shape). */
const playedId = z.union([
  z.number().int().positive(),
  z.object({ cardId: z.number().int().positive() }),
])

const gameBodySchema = z.object({
  deckId: z.number().int().positive(),
  correct: z.number().int().min(0),
  total: z.number().int().min(1),
  cardIds: z.array(playedId).optional(),
  pairs: z.array(playedId).optional(),
  timeMs: z.number().min(0).optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, gameBodySchema)

  const accuracy = body.correct / body.total
  const grade = gradeForAccuracy(accuracy)
  const confidence = 1 as const // games have no "unsure" toggle
  const timeMs = body.timeMs ?? 5000

  // which cards to schedule: the played ones when provided, else a sample
  const playedIds = (body.cardIds ?? body.pairs)?.map((id) =>
    typeof id === 'number' ? id : id.cardId,
  )
  let played = await db
    .select({ id: cards.id })
    .from(cards)
    .where(playedIds?.length ? inArray(cards.id, playedIds) : eq(cards.deckId, body.deckId))
    .limit(20)
  if (played.length > 8) {
    played = played.slice(0, 8)
  }

  // ONE atomic, collision-safe engine call (round 2+ used to crash with
  // UNIQUE constraint failed: every card got the same revlog id).
  const results = await executeBatchReview(
    played.map((row) => ({ cardId: row.id, grade, confidence, timeMs })),
  )

  // XP: the engine awards per-card review XP (incl. recall bonus for Good/Easy).
  const xp = results.reduce((acc, r) => acc + r.xpEarned, 0)
  const lastStreak = results.at(-1)?.streak
  const streak = lastStreak
    ? { current: lastStreak.current, best: lastStreak.best }
    : { current: 0, best: 0 }

  // elo per unique skill across the played cards (last rating wins per skill)
  const eloBySkill = new Map<number, { skillId: number; ratingAfter: number }>()
  for (const r of results) {
    if (r.elo)
      eloBySkill.set(r.elo.skillId, { skillId: r.elo.skillId, ratingAfter: r.elo.ratingAfter })
  }

  return Response.json({
    ok: true,
    grade,
    accuracy,
    reviewedCardIds: results.map((r) => r.card.id),
    xp,
    streak,
    elo: Array.from(eloBySkill.values()),
  })
})
