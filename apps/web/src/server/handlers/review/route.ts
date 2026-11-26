/**
 * /api/review — the review pipeline.
 *
 * GET { deckId?, courseId?, limit, mode } → build a session via `buildSession`
 *   (core/review) from candidate cards joined with each card's most recent
 *   revlog entry (hypercorrection input). With `courseId`, the session covers
 *   the whole course deck regardless of due dates (cram semantics) and is
 *   interleaved across LESSONS (round-robin that preserves the weak-first
 *   priority within each lesson) — Rohrer's mixed practice. Each card carries
 *   `blind` (its deck runs delayed feedback — grade without seeing the answer);
 *   a deck-scoped session of a delayed-feedback deck also returns `corrections`
 *   (last-24h blind-graded misses to restudy first, Butler & Roediger 2008).
 * POST { cardId, grade, confidence, timeMs? } → ONE canonical executeReview()
 *   call (packages/db/review-service): an atomic BEGIN IMMEDIATE transaction
 *   covering cards UPDATE + append-only revlog + xp_events + streak + Elo/BKT
 *   mastery. The response includes the PRE-review card state so the client can
 *   keep an undo buffer (see /api/review/undo).
 */
import { queryLimit } from '@/lib/query-params'
import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  db,
  cardEmbeddings,
  cards,
  courses,
  decks,
  executeReview,
  listDelayedFeedbackCorrections,
  userSettings,
  type DelayedFeedbackCorrection,
  type ReviewPayload,
} from '@learning-hub/db'
import {
  buildSession,
  checkHypercorrection,
  dayKey,
  interleaveBy,
  interleaveBySemanticDistance,
  previewGrades,
  type Confidence,
  type Grade,
  type SessionMode,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'
import { ensureEnginesLoaded } from '@/server/engine'
import { parseCardIds } from './card-ids'

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
  tzOffset: z.number().int().min(-720).max(840).optional().default(0),
})

async function globalFsrsConfig(): Promise<{
  desiredRetention: number
  fsrsWeights: number[] | null
}> {
  const [settings] = await db.select().from(userSettings).limit(1)
  return {
    desiredRetention: settings?.desiredRetention ?? 0.9,
    fsrsWeights: settings?.fsrsWeights ?? null,
  }
}

function toPreviewRecord(items: { grade: Grade; label: string }[]): Record<Grade, string> {
  const out = { 1: '', 2: '', 3: '', 4: '' } as Record<Grade, string>
  for (const item of items) {
    out[item.grade] = item.label
  }
  return out
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const deckId = url.searchParams.get('deckId')
  const deckIdsParam = url.searchParams.get('deckIds')
  const courseId = url.searchParams.get('courseId')
  const limit = queryLimit(url.searchParams, 20, 100)
  const mode = (url.searchParams.get('mode') ?? 'normal') as SessionMode
  const now = new Date()

  const filters = [eq(cards.suspended, false)]

  // Multi-deck request support (interleaved queue across selected decks)
  const requestedDeckIds = deckIdsParam
    ? deckIdsParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
    : deckId
      ? [Number(deckId)]
      : []

  // Mixed practice: a whole-course session ignores due dates (cram semantics)
  // and interleaves lessons — course cards live in the course's own deck.
  let course: { id: number; title: string; slug: string | null; deckId: number | null } | null =
    null
  if (courseId) {
    const [row] = await db
      .select({ id: courses.id, title: courses.title, slug: courses.slug, deckId: courses.deckId })
      .from(courses)
      .where(eq(courses.id, Number(courseId)))
      .limit(1)
    if (!row || row.deckId == null) {
      return Response.json({ ok: true, cards: [], mode, course: null })
    }
    course = row
    filters.push(eq(cards.deckId, row.deckId))
  } else if (requestedDeckIds.length === 1) {
    filters.push(eq(cards.deckId, requestedDeckIds[0]!))
  } else if (requestedDeckIds.length > 1) {
    filters.push(inArray(cards.deckId, requestedDeckIds))
  }
  // Explicit card list (exam-prep days): the learner picked these cards, so the due window and
  // buildSession are skipped. Eligibility is NOT: the deck/course scope above, suspended and
  // buried cards all still apply, and every id must pass or the whole request is rejected.
  // Cards come back in the order given. Non-due cards are allowed: reviewing early is what
  // exam prep is for, and the answer still goes through the canonical POST below.
  const explicitParsed = parseCardIds(url.searchParams.get('cardIds'))
  if (!explicitParsed.ok)
    return Response.json({ ok: false, error: explicitParsed.error }, { status: 400 })
  const explicitIds = explicitParsed.ids
  let explicitRows: (typeof cards.$inferSelect)[] | null = null
  if (explicitIds) {
    const rows = await db
      .select()
      .from(cards)
      .where(and(...filters, inArray(cards.id, explicitIds)))
    const byId = new Map(rows.map((r) => [r.id, r]))
    const bad = explicitIds.filter((id) => {
      const r = byId.get(id)
      return !r || (r.buryUntil != null && r.buryUntil > now.toISOString())
    })
    if (bad.length > 0)
      return Response.json(
        {
          ok: false,
          error: 'some cards are unknown, suspended, buried or outside the chosen deck/course',
          cardIds: bad,
        },
        { status: 400 },
      )
    explicitRows = explicitIds.map((id) => byId.get(id)!)
  }
  // candidates: everything due or newer (buildSession filters precisely per mode)
  const candidateRows = explicitRows
    ? []
    : await db
        .select()
        .from(cards)
        .where(and(...filters, lte(cards.due, new Date(now.getTime() + 7 * DAY_MS).toISOString())))
        .limit(1000)
  // most recent active revlog entry per card — hypercorrection signal (excludes undone reviews)
  const recent = await db.all<{
    card_id: number
    rating: number
    confidence: Confidence
    reviewed_at: string
  }>(sql`
    SELECT r.card_id, r.rating, r.confidence, r.reviewed_at
    FROM revlog r
    JOIN (
      SELECT max(id) AS id
      FROM revlog
      WHERE NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)
      GROUP BY card_id
    ) latest ON latest.id = r.id
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
    mode: course ? 'cram' : mode, // mixed practice ignores due dates
    asOf: now,
  })

  const sessionIds = new Set(session.map((r) => r.id))
  const sessionCards = candidateRows.filter((c) => sessionIds.has(c.id))
  // preserve buildSession ordering
  const ordered = session
    .map((r) => sessionCards.find((c) => c.id === r.id))
    .filter((c) => c !== undefined)

  // Contrastive semantic interleaving (Kornell & Bjork 2008): if card embeddings are indexed,
  // interleave to avoid concept clumping; otherwise keep weak-first buildSession order.
  const cardIds = ordered.map((c) => c.id)
  let interleaved = ordered
  if (!course && cardIds.length > 2) {
    const embRows = await db
      .select({ cardId: cardEmbeddings.cardId, embedding: cardEmbeddings.embedding })
      .from(cardEmbeddings)
      .where(inArray(cardEmbeddings.cardId, cardIds))
    if (embRows.length > 0) {
      const embMap = new Map(embRows.map((r) => [r.cardId, r.embedding]))
      const cardsWithEmb = ordered.map((c) => ({
        ...c,
        embedding: embMap.get(c.id),
      }))
      interleaved = interleaveBySemanticDistance(cardsWithEmb)
    }
  }

  // Mixed practice: alternate lessons while keeping the per-lesson priority
  // (weak-first) intact. sourceKey is `lhcf:<course>/<lesson>/<n>` for course
  // cards; anything else stays a single group.
  const mixed = course
    ? interleaveBy(ordered, (c) => {
        const parts = (c.sourceKey ?? '').split('/')
        return parts.length >= 2 && parts[0]!.startsWith('lhcf:') ? parts[1]! : ''
      })
    : interleaved

  const finalCards = explicitRows ?? mixed
  const globalCfg = await globalFsrsConfig()
  const deckIds = [...new Set(finalCards.map((c) => c.deckId))]
  const deckRows = deckIds.length
    ? await db
        .select({
          id: decks.id,
          desiredRetention: decks.desiredRetention,
          delayedFeedback: decks.delayedFeedback,
          fsrsWeights: decks.fsrsWeights,
        })
        .from(decks)
        .where(inArray(decks.id, deckIds))
    : []
  const deckById = new Map(deckRows.map((d) => [d.id, d]))

  const cardsWithPreviews = await Promise.all(
    finalCards.map(async (c) => {
      const deckCfg = deckById.get(c.deckId)
      const retention = deckCfg?.desiredRetention ?? globalCfg.desiredRetention
      const weights = deckCfg?.fsrsWeights ?? globalCfg.fsrsWeights
      const previews = toPreviewRecord(await previewGrades(c, retention, { now, weights }))
      // Delayed feedback (Butler & Roediger 2008): the answer stays hidden and
      // the grade is committed blind, so per-card `blind` travels with the card.
      return { ...c, previews, blind: deckCfg?.delayedFeedback ?? false }
    }),
  )

  // Deck-scoped delayed-feedback session: surface the last 24h of blind-graded
  // misses (rating 1–2) for restudy before the queue — the repo owns the query.
  // All-decks and course sessions interleave decks, so they carry no corrections.
  let corrections: DelayedFeedbackCorrection[] = []
  if (requestedDeckIds.length === 1 && !course) {
    const singleDeckId = requestedDeckIds[0]!
    const [deck] = await db
      .select({ id: decks.id, delayedFeedback: decks.delayedFeedback })
      .from(decks)
      .where(eq(decks.id, singleDeckId))
      .limit(1)
    if (deck?.delayedFeedback) {
      corrections = listDelayedFeedbackCorrections({ deckId: deck.id, now })
    }
  }

  return Response.json({
    ok: true,
    cards: cardsWithPreviews,
    explicit: explicitRows !== null,
    // explicit lists only: how many of the listed cards are not due yet (an early review)
    earlyCount: explicitRows ? explicitRows.filter((r) => r.due > now.toISOString()).length : 0,
    mode: course ? 'cram' : mode,
    course: course ? { id: course.id, title: course.title } : null,
    retention: globalCfg.desiredRetention,
    corrections,
  })
}

export const POST = withRoute(async (req: Request) => {
  ensureEnginesLoaded()
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

  const globalCfg = await globalFsrsConfig()
  const [deckCfg] = await db
    .select({ desiredRetention: decks.desiredRetention, fsrsWeights: decks.fsrsWeights })
    .from(decks)
    .where(eq(decks.id, result.card.deckId))
    .limit(1)
  const nextPreviews = toPreviewRecord(
    await previewGrades(result.card, deckCfg?.desiredRetention ?? globalCfg.desiredRetention, {
      now,
      weights: deckCfg?.fsrsWeights ?? globalCfg.fsrsWeights,
    }),
  )

  const cardContent =
    typeof result.card.content === 'object' && result.card.content
      ? (result.card.content as Record<string, unknown>)
      : null
  const rawBack =
    cardContent?.back ??
    (cardContent?.basic as Record<string, unknown> | undefined)?.back ??
    (cardContent?.typein as { acceptedAnswers?: string[] } | undefined)?.acceptedAnswers?.[0] ??
    ''
  const correctAnswer = String(rawBack)
  const hypercorrection = checkHypercorrection({
    cardId: result.card.id,
    confidence: body.confidence === 1 ? 5 : 1,
    grade: body.grade,
    correctAnswer,
  })

  return Response.json({
    ok: true,
    card: result.card,
    preReview: result.preReview, // full pre-review snapshot for the client undo buffer
    revlogId: result.revlog.id,
    nextPreviews,
    due: result.card.due,
    intervalDays: result.card.scheduledDays,
    xp: result.xpEarned,
    streak: { current: result.streak.current, best: result.streak.best },
    elo: result.elo,
    retrievability: result.retrievability,
    hypercorrection,
    day: dayKey(now, body.tzOffset),
  })
})
