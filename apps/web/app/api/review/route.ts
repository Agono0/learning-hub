/**
 * /api/review — the review pipeline.
 *
 * GET { deckId?, limit, mode } → build a session via `buildSession` (core/review)
 *   from candidate cards joined with each card's most recent revlog entry
 *   (hypercorrection input).
 * POST { cardId, grade, confidence, timeMs? } → ONE canonical executeReview()
 *   call (packages/db/review-service): an atomic BEGIN IMMEDIATE transaction
 *   covering cards UPDATE + append-only revlog + xp_events + streak + Elo/BKT
 *   mastery. The response includes the PRE-review card state so the client can
 *   keep an undo buffer (see /api/review/undo).
 */
import { and, eq, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  db,
  cards,
  executeReview,
  userSettings,
  type ReviewPayload,
} from '@learning-hub/db'
import { buildSession, dayKey, type Confidence, type SessionMode } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const DAY_MS = 86_400_000

const reviewBodySchema = z.object({
  cardId: z.number().int().positive(),
  grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  confidence: z.union([z.literal(0), z.literal(1)]),
  timeMs: z.number().min(0).optional(),
  today: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'today must be an ISO date string')
    .optional(),
  // tz threading ONLY: client's new Date().getTimezoneOffset() so the response
  // `day` buckets into the user's local day (nothing else in this route changed)
  tzOffset: z
    .number()
    .int()
    .min(-720)
    .max(840)
    .optional()
    .default(0),
})

async function desiredRetention(): Promise<number> {
  const [settings] = await db.select().from(userSettings).limit(1)
  return settings?.desiredRetention ?? 0.9
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const deckId = url.searchParams.get('deckId')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100)
  const mode = (url.searchParams.get('mode') ?? 'normal') as SessionMode
  const now = new Date()

  const filters = [eq(cards.suspended, false)]
  if (deckId) filters.push(eq(cards.deckId, Number(deckId)))
  // candidates: everything due or newer (buildSession filters precisely per mode)
  const candidateRows = await db
    .select()
    .from(cards)
    .where(and(...filters, lte(cards.due, new Date(now.getTime() + 7 * DAY_MS).toISOString())))
    .limit(1000)

  // most recent revlog entry per card — hypercorrection signal
  const recent = await db.all<{ card_id: number; rating: number; confidence: Confidence; reviewed_at: string }>(sql`
    SELECT r.card_id, r.rating, r.confidence, r.reviewed_at
    FROM revlog r
    JOIN (SELECT max(id) AS id FROM revlog GROUP BY card_id) latest ON latest.id = r.id
  `)
  const recentByCard = new Map(recent.map((r) => [r.card_id, r]))

  const session = buildSession({
    rows: candidateRows.map((row) => ({
      id: row.id,
      deckId: row.deckId,
      due: row.due,
      state: row.state,
      reps: row.reps,
      stability: row.stability,
      suspended: row.suspended,
      buryUntil: row.buryUntil,
      recentRevlog: recentByCard.has(row.id)
        ? {
            rating: recentByCard.get(row.id)!.rating,
            confidence: recentByCard.get(row.id)!.confidence,
            reviewedAt: recentByCard.get(row.id)!.reviewed_at,
          }
        : null,
    })),
    limit,
    mode,
    asOf: now,
  })

  const sessionIds = new Set(session.map((r) => r.id))
  const sessionCards = candidateRows.filter((c) => sessionIds.has(c.id))
  // preserve buildSession ordering
  const ordered = session
    .map((r) => sessionCards.find((c) => c.id === r.id))
    .filter((c) => c !== undefined)

  return Response.json({ ok: true, cards: ordered, mode, retention: await desiredRetention() })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, reviewBodySchema)
  const payload: ReviewPayload = {
    cardId: body.cardId,
    grade: body.grade,
    confidence: body.confidence,
    timeMs: body.timeMs,
    today: body.today,
  }
  const now = body.today ? new Date(body.today) : new Date()

  // One atomic, collision-safe engine call: cards + revlog + XP + streak + Elo/BKT.
  // CardNotFoundError (→ 404 via withRoute) propagates if the card is missing.
  const result = await executeReview(payload)

  return Response.json({
    ok: true,
    card: result.card,
    preReview: result.preReview, // full pre-review snapshot for the client undo buffer
    revlogId: result.revlog.id,
    due: result.card.due,
    intervalDays: result.card.scheduledDays,
    xp: result.xpEarned,
    streak: { current: result.streak.current, best: result.streak.best },
    elo: result.elo,
    retrievability: result.retrievability,
    day: dayKey(now, body.tzOffset),
  })
})
