/**
 * Learning HUB headless server — REVIEW routes. Split from the former routes.ts
 * monolith (TD-11): same handlers, same zod validation, same Route[] table
 * pattern; composition lives in ./index.ts.
 */
import { and, asc, desc, eq, lte, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  db,
  cards,
  executeReview,
  executeBatchReview,
  getDeckSummaries,
  getDueCardCount,
  getDueForecast,
  getNewCardCount,
  getStreakRow,
  getTodayReviewTallies,
  getTrueRetention,
  ReviewPayload,
} from '@learning-hub/db'
import { dayKey, Grade } from '@learning-hub/core'
import { sendJson, readJson, readQuery } from '../http'
import type { Route } from './shared'

const DAY_MS = 86_400_000

// ── Schemas ─────────────────────────────────────────────────────────────────

/** One review grade (same shape the web app and MCP accept). */
const reviewItemSchema = z.object({
  cardId: z.number().int().positive(),
  grade: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  confidence: z.union([z.literal(0), z.literal(1)]).optional(),
  timeMs: z.number().min(0).optional(),
  today: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'today must be an ISO date string')
    .optional(),
})

const reviewBodySchema = reviewItemSchema

const reviewBatchBodySchema = z.object({
  reviews: z.array(reviewItemSchema).min(1, 'reviews required'),
})

const cardsQuerySchema = z.object({
  deckId: z.coerce.number().int().positive().optional(),
  due: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
})

/** GET /decks — decks with card/due/new counts (same query as the web app). */
async function listDecks(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Shared stats repo — the web handler projects the same rows plus
  // hasCustomWeights; the aggregate query exists once (repos/stats).
  sendJson(res, 200, { decks: getDeckSummaries() })
}

/** GET /cards?deckId=&due=1&limit= — browse cards; due=1 keeps only unsuspended cards due now. */
/** GET /cards?deckId=&due=1&limit= — browse cards; due=1 keeps only unsuspended cards due now. */
async function listCards(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const q = readQuery(url, cardsQuerySchema)
  const filters: SQL[] = []
  if (q.deckId !== undefined) filters.push(eq(cards.deckId, q.deckId))
  if (q.due === 1) {
    filters.push(lte(cards.due, new Date().toISOString()))
    filters.push(eq(cards.suspended, false))
  }
  const rows = await db
    .select()
    .from(cards)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(q.due === 1 ? asc(cards.due) : desc(cards.createdAt))
    .limit(q.limit ?? 200)
  sendJson(res, 200, { cards: rows })
}

/** Per-review response fields (same shape as the web app's POST /api/review). */
/** Per-review response fields (same shape as the web app's POST /api/review). */
function reviewSummary(result: Awaited<ReturnType<typeof executeReview>>) {
  const when = new Date(result.revlog.reviewedAt)
  return {
    card: result.card,
    preReview: result.preReview,
    revlogId: result.revlog.id,
    due: result.card.due,
    intervalDays: Math.max(0, Math.round((Date.parse(result.card.due) - when.getTime()) / DAY_MS)),
    xp: result.xpEarned,
    streak: { current: result.streak.current, best: result.streak.best },
    elo: result.elo,
    retrievability: result.retrievability,
  }
}

/** POST /review {cardId, grade, confidence?, timeMs?, today?} — one canonical executeReview() call. */
/** POST /review {cardId, grade, confidence?, timeMs?, today?} — one canonical executeReview() call. */
async function postReview(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, reviewBodySchema)
  const payload: ReviewPayload = {
    cardId: body.cardId,
    grade: body.grade as Grade,
    confidence: body.confidence,
    timeMs: body.timeMs,
    today: body.today,
  }
  // One atomic, collision-safe engine call: cards + revlog + XP + streak + Elo/BKT.
  // CardNotFoundError → 404, ValidationError → 400 via sendError.
  const result = await executeReview(payload)
  sendJson(res, 200, {
    ok: true,
    ...reviewSummary(result),
    day: dayKey(body.today ? new Date(body.today) : new Date()),
  })
}

/** POST /review/batch {reviews:[...]} — atomic executeBatchReview() of many grades. */
/** POST /review/batch {reviews:[...]} — atomic executeBatchReview() of many grades. */
async function postReviewBatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, reviewBatchBodySchema)
  const payloads: ReviewPayload[] = body.reviews.map((r) => ({
    cardId: r.cardId,
    grade: r.grade as Grade,
    confidence: r.confidence,
    timeMs: r.timeMs,
    today: r.today,
  }))
  const results = await executeBatchReview(payloads)
  sendJson(res, 200, { ok: true, results: results.map(reviewSummary) })
}

/** GET /today — due/new counts, today's review tallies and the streak row. */
/** GET /today — due/new counts, today's review tallies and the streak row. */
async function today(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Shared stats repo — one definition for web, MCP and CLI (repos/stats).
  const tallies = getTodayReviewTallies()
  const streakRow = getStreakRow()

  sendJson(res, 200, {
    ok: true,
    day: tallies.day,
    due: getDueCardCount(),
    newCards: getNewCardCount(),
    reviews: {
      count: tallies.reviews,
      correct: tallies.correct,
      avgTimeMs: tallies.avgTimeMs,
    },
    streak: streakRow
      ? {
          current: streakRow.current,
          best: streakRow.best,
          lastActiveDate: streakRow.lastActiveDate,
          freezes: streakRow.freezes,
        }
      : { current: 0, best: 0, lastActiveDate: null, freezes: 2 },
  })
}

/** GET /stats — true retention (v_true_retention), today's tallies, 30-day due forecast. */
/** GET /stats — true retention (v_true_retention), today's tallies, 30-day due forecast. */
async function stats(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  // Shared stats repo — identical aggregation to the web /api/review/stats handler.
  sendJson(res, 200, {
    ok: true,
    trueRetention: getTrueRetention(),
    today: getTodayReviewTallies(),
    forecast: getDueForecast(),
  })
}

/** Parses ?attemptsJson into validated attempts; malformed input scores as no telemetry. */

/** Route table for this area — concatenated in ./index.ts in the original routes.ts order. */
export const reviewRoutes: Route[] = [
  {
    method: 'GET',
    path: '/decks',
    summary: 'decks with card/due/new counts',
    handler: listDecks,
  },
  {
    method: 'GET',
    path: '/cards',
    summary: 'browse cards (?deckId=&due=1&limit=)',
    handler: listCards,
  },
  {
    method: 'POST',
    path: '/review',
    summary: 'grade one card (executeReview)',
    handler: postReview,
  },
  {
    method: 'POST',
    path: '/review/batch',
    summary: 'grade many cards atomically (executeBatchReview)',
    handler: postReviewBatch,
  },
  {
    method: 'GET',
    path: '/today',
    summary: 'due/new counts, today tallies, streak',
    handler: today,
  },
  {
    method: 'GET',
    path: '/stats',
    summary: 'retention, today tallies, 30-day forecast',
    handler: stats,
  },
]
