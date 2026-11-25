/**
 * /api/arena — the 3D Review Arena's server side.
 *
 * GET { deckIds?, limit, rematch? } → build an arena queue from REAL due
 *   cards via the
 *   same `buildSession` engine the review pipeline uses (weak-first priority,
 *   FSRS untouched), then ISSUE a server-owned run (`arena_sessions` row)
 *   binding that exact queue, guardian and boss flag to a fresh runId. The
 *   arena is a presentation layer over the review session: nothing here
 *   changes what is due or when.
 *
 * POST (arenaSettlementSchema) → settle a finished run. Settlement integrity:
 *   - The runId must reference a server-issued run owned by the caller's
 *     owner context (single-tenant local app: 'default'; the column binding
 *     is structural, ready for real auth — UUID possession alone is not
 *     authorization).
 *   - Every graded card must belong to the run's server-side queue snapshot,
 *     at most once: invented or repeated cards are rejected (400).
 *   - Settlement is claimed atomically (open → settling with a fencing
 *     token). Concurrent duplicates serialize: exactly one commits; the rest
 *     observe in-progress (409) or settled. A crashed settler's stale claim
 *     can be reclaimed, and the fencing token guarantees the stale claimant
 *     can never commit over the new owner.
 *   - Reviews, bonus coins, arena XP, the run record, achievements and the
 *     settled-status flip commit in ONE SQLite transaction (via
 *     executeBatchReview's afterReviews hook): a partial settlement is
 *     impossible — any failure rolls everything back.
 *   - The outcome is RECOMPUTED server-side from the validated grade log
 *     with the run's server-owned guardian tuning — client score/combo/
 *     result/archetype fields are telemetry, never integrity inputs.
 *   - Replays: an identical grade log on a settled run returns the stored
     settlement response without re-minting; an altered log is rejected 409.
 *
 * Honest scope: these invariants make settlement exactly-once and consistent
 * in this local-first app. They are not anti-cheat guarantees against a
 * modified client — graded reviews still run on the honor system, as in the
 * normal review queue.
 */
import { and, desc, eq, inArray, lte, sql } from 'drizzle-orm'
import {
  awardXp,
  cardEmbeddings,
  cards,
  claimArenaSettlement,
  completeArenaSettlementInTx,
  createArenaSession,
  db,
  decks,
  evaluateAndUnlockAchievements,
  executeBatchReview,
  getArenaStats,
  getWeakCardIdsForRun,
  recordArenaRun,
  recordCoinTransactionInTx,
  releaseArenaClaim,
  studyCoinLedger,
  userSettings,
  type ReviewPayload,
} from '@learning-hub/db'
import {
  ARENA_DEFAULTS,
  ARENA_MODIFIER_INFO,
  BOSS_CHALLENGE_THRESHOLD,
  GUARDIANS,
  applyArenaModifier,
  arenaModifierForDate,
  arenaSettlementSchema,
  buildSession,
  guardianConfig,
  guardianForRun,
  interleaveBySemanticDistance,
  previewGrades,
  summarizeGradeLog,
  type ArenaGradeEvent,
  type ArenaModifier,
  type Confidence,
  type Grade,
  type GuardianArchetype,
} from '@learning-hub/core'
import { ApiError, readJson, withRoute } from '@/lib/api'

const DAY_MS = 86_400_000

const ARENA_MIN_LIMIT = 5
const ARENA_MAX_LIMIT = 20
const ARENA_DEFAULT_LIMIT = 10

/**
 * The app's owner context. This is a single-tenant local-first app: every
 * surface (coins, XP, arena history) resolves to the 'default' owner today.
 * The arena session row is still bound to this owner at issue time and the
 * claim re-checks it, so when real multi-user auth lands the binding is
 * already structural rather than implicit.
 */
const ARENA_OWNER_ID = 'default'

/**
 * Fixed-key-order projection of a grade log: two logs that differ only in
 * JSON key order normalize to the same string, so replay comparison never
 * depends on how the client serialized its body.
 */
function normalizeGradeLog(exchanges: ArenaGradeEvent[]): ArenaGradeEvent[] {
  return exchanges.map((e) => ({
    cardId: e.cardId,
    grade: e.grade,
    confidence: e.confidence,
    timeMs: e.timeMs,
  }))
}

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

export const GET = withRoute(async function GET(req: Request) {
  const url = new URL(req.url)
  const deckIdsParam = url.searchParams.get('deckIds')
  const rematchParam = url.searchParams.get('rematch')
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit') ?? ARENA_DEFAULT_LIMIT), ARENA_MIN_LIMIT),
    ARENA_MAX_LIMIT,
  )
  const now = new Date()

  // Daily modifier: one rotating rule twist per UTC day, layered over the
  // guardian tuning. It is stored on the issued run so settlement replays
  // the SAME twist even when a run spans midnight (selection is a stable
  // hash of the date — convenience, not an integrity proof).
  const modifier = arenaModifierForDate(now.toISOString().slice(0, 10))
  const modifierInfo = { key: modifier, ...ARENA_MODIFIER_INFO[modifier] }

  const requestedDeckIds = deckIdsParam
    ? deckIdsParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isInteger(n) && n > 0)
    : []

  // Weak-card drill: rematch=<runId> rebuilds the queue from the cards the
  // player graded Again or Hard in that settled run. Deliberately ignores
  // the due-window — a drill is user-initiated extra practice, and grading
  // still runs the canonical review engine (FSRS reschedules normally).
  // Ownership is enforced: another owner's run is a 404, same as unknown.
  let drillCardIds: number[] | null = null
  if (rematchParam) {
    const weak = getWeakCardIdsForRun(rematchParam, { userId: ARENA_OWNER_ID })
    if (!weak) throw new ApiError(404, 'arena run not found')
    drillCardIds = weak
  }

  const filters = [eq(cards.suspended, false)]
  if (drillCardIds !== null) {
    if (drillCardIds.length === 0) {
      // No weak cards in that run — nothing to drill.
      return Response.json({
        ok: true,
        runId: null,
        cards: [],
        limit,
        config: applyArenaModifier(
          modifier,
          guardianConfig(guardianForRun(getArenaStats().runs), ARENA_DEFAULTS),
        ),
        guardian: null,
        drillEmpty: true,
        modifier: modifierInfo,
      })
    }
    filters.push(inArray(cards.id, drillCardIds))
  } else if (requestedDeckIds.length === 1) {
    filters.push(eq(cards.deckId, requestedDeckIds[0]!))
  } else if (requestedDeckIds.length > 1) {
    filters.push(inArray(cards.deckId, requestedDeckIds))
  }

  const candidateRows = await db
    .select()
    .from(cards)
    .where(
      drillCardIds !== null
        ? and(...filters)
        : and(...filters, lte(cards.due, new Date(now.getTime() + 7 * DAY_MS).toISOString())),
    )
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

  // Drills bypass the due window at BOTH levels: the SQL filter above and
  // buildSession's own asOf cutoff (graded weak cards are usually due
  // minutes-to-days ahead; the player explicitly asked to re-drill them).
  const sessionAsOf = drillCardIds !== null ? new Date(now.getTime() + 365 * DAY_MS) : now

  const sessionRows = candidateRows.map((row) => ({
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
  }))
  const session = buildSession({
    rows: sessionRows,
    limit,
    mode: 'normal',
    asOf: sessionAsOf,
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

  // The guardian rotates deterministically over the player's run count, so
  // the client and the settlement recompute always agree on the tuning.
  const runNumber = getArenaStats().runs
  const archetype = guardianForRun(runNumber)
  const boss = cardsWithPreviews.length >= BOSS_CHALLENGE_THRESHOLD
  const tunedConfig = applyArenaModifier(modifier, guardianConfig(archetype, ARENA_DEFAULTS))

  // Issue the server-owned run: the queue, guardian and boss flag the
  // settlement will be validated against. The client gets the runId; it can
  // never choose or alter these itself.
  const run = createArenaSession({
    userId: ARENA_OWNER_ID,
    deckIds,
    cardIds: cardsWithPreviews.map((c) => c.id),
    archetype,
    boss,
    modifier,
  })

  return Response.json({
    ok: true,
    runId: run.id,
    cards: cardsWithPreviews,
    limit,
    config: tunedConfig,
    drill: drillCardIds !== null,
    guardian: {
      archetype,
      name: GUARDIANS[archetype].name,
      tagline: GUARDIANS[archetype].tagline,
      boss,
    },
    modifier: modifierInfo,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, arenaSettlementSchema)
  const runId = body.runId

  // 1) Claim the run. The flip to 'settling' is atomic (IMMEDIATE tx), so
  //    concurrent duplicates serialize: exactly one claimant wins; the rest
  //    see in_progress (409) or settled (replay path below).
  const claim = claimArenaSettlement(runId, { userId: ARENA_OWNER_ID })

  if (claim.kind === 'missing') {
    // Unknown run — or a run owned by a different owner context. Either way
    // the caller learns nothing about whether the id exists.
    throw new ApiError(404, 'arena run not found')
  }
  if (claim.kind === 'in_progress') {
    throw new ApiError(409, 'settlement already in progress for this run')
  }

  // Fixed-key-order normalization: replay comparison must not depend on how
  // the client serialized its JSON.
  const normalized = normalizeGradeLog(body.exchanges)

  if (claim.kind === 'settled') {
    const storedLog = JSON.stringify(claim.run.gradeLog ?? [])
    if (JSON.stringify(normalized) === storedLog) {
      // Identical replay: return the exact stored response. Nothing
      // re-mints, nothing re-applies — the settlement was exactly-once.
      return Response.json(claim.run.settlementJson)
    }
    throw new ApiError(409, 'grade log does not match the settled run')
  }

  // claim.kind === 'claimed' — we own settlement attempt `claim.attempt`.

  // 2) Validate against the SERVER'S queue snapshot: every graded card must
  //    have been dealt into this run, at most once. Invented cards and
  //    repeated cards are rejected; the claim is released so the run stays
  //    settleable after the client fixes its state.
  const queue = new Set(claim.run.cardIds)
  const seen = new Set<number>()
  for (const e of normalized) {
    if (!queue.has(e.cardId)) {
      releaseArenaClaim(runId, claim.attempt)
      throw new ApiError(400, `card ${e.cardId} is not part of this arena run`)
    }
    if (seen.has(e.cardId)) {
      releaseArenaClaim(runId, claim.attempt)
      throw new ApiError(400, `card ${e.cardId} appears more than once in the grade log`)
    }
    seen.add(e.cardId)
  }

  // 3) Server-side outcome: recomputed from the validated log with the RUN'S
  //    guardian tuning — client score/bestCombo/result are telemetry only.
  const archetype = claim.run.archetype as GuardianArchetype
  // The modifier the run was ISSUED under — reapplied for the recompute so
  // a run spanning midnight keeps its own rules, and a client can never
  // pick a friendlier twist at settlement time.
  const runModifier = (claim.run.modifier as ArenaModifier | null) ?? null
  const summary = summarizeGradeLog(normalized, ARENA_DEFAULTS, archetype, runModifier)
  const boss = claim.run.boss
  const referenceId = `arena:${runId}`

  // 4) ONE atomic transaction: canonical reviews (FSRS + revlog + streak +
  //    mastery + per-grade XP) AND the arena rewards, run record,
  //    achievements and the fenced settled-flip. Any failure — including a
  //    fencing loss to a newer claim — rolls back everything, so a partial
  //    settlement is impossible.
  const payloads: ReviewPayload[] = normalized.map((e) => ({
    cardId: e.cardId,
    grade: e.grade,
    confidence: e.confidence,
    timeMs: e.timeMs,
  }))

  let settlement: Record<string, unknown> | null = null
  await executeBatchReview(payloads, {
    afterReviews: (tx, results: ReviewResult[]) => {
      // Bonus coins, minted inside the settlement transaction. The
      // referenceId is the server-issued run id, so history can never
      // double-count this run even outside the session state machine.
      let coinsAwarded = 0
      let coinBalance = 0
      if (summary.coins > 0) {
        const coinRow = recordCoinTransactionInTx(tx, {
          userId: ARENA_OWNER_ID,
          amount: summary.coins,
          reason: 'arena_session',
          referenceId,
        })
        coinsAwarded = summary.coins
        coinBalance = coinRow.balanceAfter
      } else {
        const latest = tx
          .select({ balanceAfter: studyCoinLedger.balanceAfter })
          .from(studyCoinLedger)
          .where(eq(studyCoinLedger.userId, ARENA_OWNER_ID))
          .orderBy(desc(studyCoinLedger.id))
          .limit(1)
          .all()
        coinBalance = latest[0]?.balanceAfter ?? 0
      }

      // Arena bonus XP: dynamic source (5 per correct + 15 victory bonus,
      // capped by the engine). Per-grade XP already flowed through the
      // reviews above.
      if (summary.xp > 0) {
        awardXp(tx, {
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

      recordArenaRun(
        {
          deckIds: claim.run.deckIds,
          result: summary.result,
          archetype,
          boss,
          rounds: summary.rounds,
          correct: summary.correct,
          accuracy: summary.accuracy,
          bestCombo: summary.bestCombo,
          crits: summary.crits,
          score: summary.score,
          coins: coinsAwarded,
          xp: summary.xp,
          durationMs: normalized.reduce((sum, e) => sum + e.timeMs, 0),
          referenceId,
        },
        tx,
      )

      // Achievements derive from the run row, so they evaluate inside the
      // same transaction — and can only ever unlock once per run.
      const achievements = evaluateAndUnlockAchievements({ db: tx }).newlyUnlocked

      // Per-card schedule recap: what FSRS actually did with each graded
      // card — the results screen renders this so the player sees the real
      // next-due outcomes, matching the normal review queue's summary.
      const schedule = results.map((r) => ({
        cardId: r.card.id,
        due: r.card.due,
        state: r.card.state,
        reps: r.card.reps,
        xpEarned: r.xpEarned,
      }))

      settlement = {
        ok: true,
        summary,
        schedule,
        reviewXp: results.reduce((sum, r) => sum + r.xpEarned, 0),
        achievements,
        coinsAwarded,
        coinBalance,
        streak: results.length
          ? {
              current: results[results.length - 1]!.streak.current,
              best: results[results.length - 1]!.streak.best,
            }
          : null,
      }

      // Fenced completion: throws (rolling back ALL of the above) if a newer
      // claim reclaimed this run while we were settling.
      completeArenaSettlementInTx(tx, runId, claim.attempt, normalized, settlement)
    },
  })

  return Response.json(settlement)
})
