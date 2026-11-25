/**
 * /api/arena — the 3D Review Arena's server side.
 *
 * GET { deckIds?, limit } → build an arena queue from REAL due cards via the
 *   same `buildSession` engine the review pipeline uses (weak-first priority,
 *   FSRS untouched). The arena is a presentation layer over the review
 *   session: nothing here changes what is due or when.
 *
 * POST (arenaSettlementSchema) → settle a finished session. For every graded
 *   exchange the canonical `executeReview()` runs (atomic FSRS + revlog + XP +
 *   streak + mastery), then the arena outcome is RECOMPUTED server-side from
 *   the raw grade log (`summarizeGradeLog`) — the client's score/bestCombo/
 *   result fields are telemetry, never trusted. Arena bonus coins and XP are
 *   capped by the engine (buildArenaSummary) and awarded once per settlement
 *   via the idempotent coin ledger (referenceId derived from the grade log).
 */
import { and, eq, inArray, lte, sql } from 'drizzle-orm'
import {
  awardXp,
  cardEmbeddings,
  cards,
  db,
  decks,
  executeReview,
  getCoinBalance,
  recordCoinTransaction,
  studyCoinLedger,
  userSettings,
  type ReviewPayload,
} from '@learning-hub/db'
import {
  ARENA_DEFAULTS,
  arenaSettlementSchema,
  buildSession,
  interleaveBySemanticDistance,
  previewGrades,
  summarizeGradeLog,
  type Confidence,
  type Grade,
} from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const DAY_MS = 86_400_000

const ARENA_MIN_LIMIT = 5
const ARENA_MAX_LIMIT = 20

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

/** FNV-1a 32-bit — tiny deterministic hash for the settlement idempotency key. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const deckIdsParam = url.searchParams.get('deckIds')
  const limit = Math.min(
    Math.max(
      Number(url.searchParams.get('limit') ?? ARENA_DEFAULTS.challengesPerRun),
      ARENA_MIN_LIMIT,
    ),
    ARENA_MAX_LIMIT,
  )
  const now = new Date()

  const requestedDeckIds = deckIdsParam
    ? deckIdsParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
    : []

  const filters = [eq(cards.suspended, false)]
  if (requestedDeckIds.length === 1) {
    filters.push(eq(cards.deckId, requestedDeckIds[0]!))
  } else if (requestedDeckIds.length > 1) {
    filters.push(inArray(cards.deckId, requestedDeckIds))
  }

  const candidateRows = await db
    .select()
    .from(cards)
    .where(and(...filters, lte(cards.due, new Date(now.getTime() + 7 * DAY_MS).toISOString())))
    .limit(1000)

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
    mode: 'normal',
    asOf: now,
  })

  const sessionIds = new Set(session.map((r) => r.id))
  const sessionCards = candidateRows.filter((c) => sessionIds.has(c.id))
  const ordered = session
    .map((r) => sessionCards.find((c) => c.id === r.id))
    .filter((c) => c !== undefined)

  const cardIds = ordered.map((c) => c.id)
  let interleaved = ordered
  if (cardIds.length > 2) {
    const embRows = await db
      .select({ cardId: cardEmbeddings.cardId, embedding: cardEmbeddings.embedding })
      .from(cardEmbeddings)
      .where(inArray(cardEmbeddings.cardId, cardIds))
    if (embRows.length > 0) {
      const embMap = new Map(embRows.map((r) => [r.cardId, r.embedding]))
      interleaved = interleaveBySemanticDistance(
        ordered.map((c) => ({ ...c, embedding: embMap.get(c.id) })),
      )
    }
  }

  const globalCfg = await globalFsrsConfig()
  const deckIds = [...new Set(interleaved.map((c) => c.deckId))]
  const deckRows = deckIds.length
    ? await db
        .select({
          id: decks.id,
          desiredRetention: decks.desiredRetention,
          fsrsWeights: decks.fsrsWeights,
        })
        .from(decks)
        .where(inArray(decks.id, deckIds))
    : []
  const deckById = new Map(deckRows.map((d) => [d.id, d]))

  const cardsWithPreviews = await Promise.all(
    interleaved.map(async (c) => {
      const deckCfg = deckById.get(c.deckId)
      const previews = toPreviewRecord(
        await previewGrades(c, deckCfg?.desiredRetention ?? globalCfg.desiredRetention, {
          now,
          weights: deckCfg?.fsrsWeights ?? globalCfg.fsrsWeights,
        }),
      )
      return { ...c, previews }
    }),
  )

  return Response.json({
    ok: true,
    cards: cardsWithPreviews,
    limit,
    config: ARENA_DEFAULTS,
  })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, arenaSettlementSchema)

  // 1) Real reviews: every exchange runs the canonical atomic review engine.
  //    This is what makes the arena a review session, not a minigame with
  //    detached rewards — FSRS scheduling, revlog, streak and mastery all
  //    update exactly as if the user had reviewed in the normal queue.
  const reviewResults = []
  for (const exchange of body.exchanges) {
    const payload: ReviewPayload = {
      cardId: exchange.cardId,
      grade: exchange.grade,
      confidence: exchange.confidence,
      timeMs: exchange.timeMs,
    }
    reviewResults.push(await executeReview(payload))
  }

  // 2) Server-side outcome: the summary is recomputed from the raw grade log,
  //    never from client-supplied score/combo/result fields.
  const summary = summarizeGradeLog(body.exchanges)

  // 3) Bonus coins: minted at most once per grade log. The referenceId is a
  //    deterministic FNV-1a hash of the full exchange list, so a retried
  //    double-submit resolves to the same key and the dedupe check below
  //    skips it, while a genuinely new session (different cards/grades/
  //    timings) hashes differently. Anti-cheat caps come from
  //    buildArenaSummary (coins ≤ rounds + 8).
  const referenceId = `arena:${fnv1a(JSON.stringify(body.exchanges)).toString(16)}`
  let coinBalance = getCoinBalance('default')
  let coinsAwarded = 0
  const alreadySettled = await db
    .select({ id: studyCoinLedger.id })
    .from(studyCoinLedger)
    .where(
      and(
        eq(studyCoinLedger.reason, 'arena_session'),
        eq(studyCoinLedger.referenceId, referenceId),
      ),
    )
    .limit(1)
  if (summary.coins > 0 && alreadySettled.length === 0) {
    const tx = recordCoinTransaction({
      userId: 'default',
      amount: summary.coins,
      reason: 'arena_session',
      referenceId,
    })
    coinsAwarded = summary.coins
    coinBalance = tx.balanceAfter
  }

  // 4) Arena bonus XP: dynamic source (amount depends on the session), so it
  //    passes an explicit amount — the engine's small-award convention
  //    (5 XP per correct retrieval + 15 victory bonus). Per-grade XP already
  //    flowed through executeReview above.
  if (summary.xp > 0) {
    awardXp(db, {
      source: 'arena',
      amount: summary.xp,
      meta: {
        referenceId,
        result: summary.result,
        rounds: summary.rounds,
        accuracy: summary.accuracy,
        bestCombo: summary.bestCombo,
      },
    })
  }

  return Response.json({
    ok: true,
    summary,
    reviewXp: reviewResults.reduce((sum, r) => sum + r.xpEarned, 0),
    coinsAwarded,
    coinBalance,
    streak: reviewResults.length
      ? {
          current: reviewResults[reviewResults.length - 1]!.streak.current,
          best: reviewResults[reviewResults.length - 1]!.streak.best,
        }
      : null,
  })
})
