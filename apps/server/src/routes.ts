/**
 * Learning HUB server — REST routes.
 *
 * Every route reuses the existing services (packages/db review engine +
 * packages/core session/stats helpers) rather than reimplementing SQL; the few
 * listing queries mirror the web app's route queries against the same shared
 * drizzle client. All bodies and query strings are zod-validated.
 */
import { and, asc, desc, eq, lte, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  db,
  decks,
  cards,
  revlog,
  streaks,
  executeReview,
  executeBatchReview,
  resolveDbPath,
  type ReviewPayload,
} from '@learning-hub/db'
import {
  dayKey,
  forecastNext30Days,
  listPlugins,
  type Grade,
  createGenerationLadder,
  evaluateGenerationTrial,
  evaluateFeynmanExplanation,
  evaluateMetacognitiveProfile,
  generationTierEnum,
  generationTrialInputSchema,
  feynmanEvaluationInputSchema,
  judgmentOfLearningSchema,
  type JudgmentOfLearning,
} from '@learning-hub/core'
import { jsonError, readJson, readQuery, sendError, sendJson } from './http'

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

const generationChallengeSchema = z.object({
  concept: z.string().min(1),
  explanation: z.string().optional(),
  text: z.string().optional(),
  tier: generationTierEnum.default('stem_completion'),
})

const metacognitionBodySchema = z.object({
  trials: z.array(judgmentOfLearningSchema).min(1),
})

const metacognitionQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
  deckId: z.coerce.number().int().positive().optional(),
})

// ── Handlers ────────────────────────────────────────────────────────────────

/** GET /health — liveness + resolved DB path. */
async function health(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, {
    ok: true,
    name: 'learning-hub-server',
    version: '0.1.0',
    uptimeSeconds: Math.round(process.uptime()),
    db: resolveDbPath(),
  })
}

/** GET /decks — decks with card/due/new counts (same query as the web app). */
async function listDecks(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const rows = await db
    .select({
      id: decks.id,
      name: decks.name,
      description: decks.description,
      emoji: decks.emoji,
      createdAt: decks.createdAt,
      total: sql<number>`count(${cards.id})`,
      due: sql<number>`sum(CASE WHEN ${cards.due} <= ${new Date().toISOString()} AND ${cards.suspended} = 0 THEN 1 ELSE 0 END)`,
      newCards: sql<number>`sum(CASE WHEN ${cards.state} = 0 THEN 1 ELSE 0 END)`,
    })
    .from(decks)
    .leftJoin(cards, eq(cards.deckId, decks.id))
    .groupBy(decks.id)
    .orderBy(asc(decks.name))
  sendJson(res, 200, {
    decks: rows.map((r) => ({
      ...r,
      total: Number(r.total ?? 0),
      due: Number(r.due ?? 0),
      newCards: Number(r.newCards ?? 0),
    })),
  })
}

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
async function today(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const now = new Date()
  const nowIso = now.toISOString()
  const todayKey = dayKey(now)

  const [dueRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(cards)
    .where(and(lte(cards.due, nowIso), eq(cards.suspended, false)))
  const [newRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(cards)
    .where(and(eq(cards.state, 0), eq(cards.suspended, false)))
  const [todayStats] = await db.all<{
    reviews: number
    correct: number
    avg_time_ms: number | null
  }>(sql`
    SELECT count(*) AS reviews,
           sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS correct,
           round(avg(time_ms)) AS avg_time_ms
    FROM revlog
    WHERE substr(reviewed_at, 1, 10) = ${todayKey}
      AND NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)
  `)
  const [streakRow] = await db.select().from(streaks).limit(1)

  sendJson(res, 200, {
    ok: true,
    day: todayKey,
    due: Number(dueRow?.count ?? 0),
    newCards: Number(newRow?.count ?? 0),
    reviews: {
      count: Number(todayStats?.reviews ?? 0),
      correct: Number(todayStats?.correct ?? 0),
      avgTimeMs: todayStats?.avg_time_ms ?? null,
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
async function stats(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const todayKey = new Date().toISOString().slice(0, 10)
  const retention = await db.all<{ total: number; retained: number; retention_pct: number }>(
    sql`SELECT total, retained, retention_pct FROM v_true_retention`,
  )
  const [todayStats] = await db.all<{
    reviews: number
    correct: number
    avg_time_ms: number | null
  }>(sql`
    SELECT count(*) AS reviews,
           sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS correct,
           round(avg(time_ms)) AS avg_time_ms
    FROM revlog
    WHERE substr(reviewed_at, 1, 10) = ${todayKey}
      AND NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)
  `)
  const dueRows = await db
    .select({ due: cards.due, suspended: cards.suspended })
    .from(cards)
    .limit(5000)
  const forecast = forecastNext30Days(
    dueRows.filter((r) => !r.suspended).map((r) => ({ due: r.due })),
  )

  sendJson(res, 200, {
    ok: true,
    trueRetention: retention[0] ?? { total: 0, retained: 0, retention_pct: null },
    today: {
      day: todayKey,
      reviews: Number(todayStats?.reviews ?? 0),
      correct: Number(todayStats?.correct ?? 0),
      avgTimeMs: todayStats?.avg_time_ms ?? null,
    },
    forecast,
  })
}

/** GET /plugins — names + versions of the plugins loaded at boot (core registry). */
async function plugins(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, {
    ok: true,
    plugins: listPlugins().map((entry) => ({
      name: entry.plugin.name,
      version: entry.plugin.version,
      description: entry.plugin.description ?? null,
      source: entry.source,
    })),
  })
}

/** POST /cognitive/generation/challenge — creates a 4-tier generation challenge. */
async function postGenerationChallenge(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, generationChallengeSchema)
  const ladder = createGenerationLadder(
    body.concept,
    body.explanation ?? body.text ?? body.concept,
    body.tier,
  )
  sendJson(res, 200, { ok: true, ladder })
}

/** POST /cognitive/generation/eval — evaluates a learner's generation trial. */
async function postGenerationEval(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, generationTrialInputSchema)
  const result = evaluateGenerationTrial(body)
  sendJson(res, 200, { ok: true, result })
}

/** POST /cognitive/feynman-eval — evaluates an explanation for reading ease, jargon, and causal depth. */
async function postFeynmanEval(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, feynmanEvaluationInputSchema)
  const report = evaluateFeynmanExplanation(body)
  sendJson(res, 200, { ok: true, report })
}

/** GET /cognitive/metacognition — evaluates metacognitive calibration from revlog history. */
async function getMetacognition(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const q = readQuery(url, metacognitionQuerySchema)
  const conditions = []
  if (q.deckId) conditions.push(eq(cards.deckId, q.deckId))

  const rows = await db
    .select({
      cardId: revlog.cardId,
      rating: revlog.rating,
      confidence: revlog.confidence,
      timeMs: revlog.timeMs,
    })
    .from(revlog)
    .innerJoin(cards, eq(revlog.cardId, cards.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(revlog.id))
    .limit(q.limit ?? 100)

  const trials: JudgmentOfLearning[] = rows.map((r) => ({
    cardId: r.cardId,
    confidence: r.confidence === 1 ? 0.9 : 0.35,
    outcome: r.rating >= 3 ? 1 : 0,
    latencyMs: r.timeMs ?? undefined,
  }))

  const report = evaluateMetacognitiveProfile(trials)
  sendJson(res, 200, { ok: true, trialsCount: trials.length, report })
}

/** POST /cognitive/metacognition — evaluates metacognitive calibration from provided trial payload. */
async function postMetacognition(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, metacognitionBodySchema)
  const report = evaluateMetacognitiveProfile(body.trials)
  sendJson(res, 200, { ok: true, trialsCount: body.trials.length, report })
}

// ── Route table + dispatcher ────────────────────────────────────────────────

/** One registered route: exact method + path match, query parsing left to the handler. */
export interface Route {
  method: 'GET' | 'POST'
  path: string
  summary: string
  handler: (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<void> | void
}

/** All REST routes served by the headless server. */
export const routes: Route[] = [
  { method: 'GET', path: '/health', summary: 'liveness + resolved DB path', handler: health },
  { method: 'GET', path: '/decks', summary: 'decks with card/due/new counts', handler: listDecks },
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
  { method: 'GET', path: '/plugins', summary: 'loaded plugin names + versions', handler: plugins },
  {
    method: 'POST',
    path: '/cognitive/generation/challenge',
    summary: 'create generation ladder challenge',
    handler: postGenerationChallenge,
  },
  {
    method: 'POST',
    path: '/cognitive/generation/eval',
    summary: 'evaluate generation attempt',
    handler: postGenerationEval,
  },
  {
    method: 'POST',
    path: '/cognitive/feynman-eval',
    summary: 'evaluate feynman teach-back explanation',
    handler: postFeynmanEval,
  },
  {
    method: 'GET',
    path: '/cognitive/metacognition',
    summary: 'metacognitive calibration from revlog (?deckId=&limit=)',
    handler: getMetacognition,
  },
  {
    method: 'POST',
    path: '/cognitive/metacognition',
    summary: 'metacognitive calibration from provided trials',
    handler: postMetacognition,
  },
]

/**
 * Match the incoming request against the route table and run the handler with
 * error mapping (400/404/500 envelope). Unknown method+path → 404.
 */
export async function dispatch(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const method = (req.method ?? 'GET').toUpperCase()
    const route = routes.find((r) => r.method === method && r.path === url.pathname)
    if (!route) {
      jsonError(res, 404, `Not found: ${method} ${url.pathname}`)
      return
    }
    await route.handler(req, res, url)
  } catch (err) {
    sendError(res, err)
  }
}
