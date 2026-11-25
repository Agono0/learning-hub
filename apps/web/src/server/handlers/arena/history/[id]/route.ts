/**
 * /api/arena/history/[id] — one run from the record book, with its
 * round-by-round grade log.
 *
 * The run row (arena_runs) links to its server-issued session via
 * referenceId (`arena:<runId>`); the session's persisted gradeLog is the
 * normalized log the settlement actually accepted (never client-supplied
 * fields), so the detail view shows exactly what was recorded. Card fronts
 * are resolved best-effort: cards deleted since the run render as a
 * placeholder.
 */
import { inArray } from 'drizzle-orm'
import { cards, db, getArenaRun, getArenaSession } from '@learning-hub/db'
import { ApiError, withRoute } from '@/lib/api'

export const GET = withRoute(async (req: Request) => {
  const id = Number(new URL(req.url).pathname.split('/').pop())
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'invalid run id')

  const run = getArenaRun(id)
  if (!run) throw new ApiError(404, 'arena run not found')

  // The session row holds the accepted grade log; runs recorded before
  // server-issued sessions existed (or failed validations) may not have
  // one — then the log is simply empty.
  const sessionId = run.referenceId.startsWith('arena:') ? run.referenceId.slice(6) : null
  const session = sessionId ? getArenaSession(sessionId) : undefined
  const rounds = (
    (session?.gradeLog ?? []) as Array<{
      cardId: number
      grade: number
      confidence: number
      timeMs: number
    }>
  ).map((e, i) => ({
    round: i + 1,
    cardId: e.cardId,
    grade: e.grade,
    confidence: e.confidence,
    timeMs: e.timeMs,
  }))

  const cardIds = [...new Set(rounds.map((r) => r.cardId))]
  const cardRows = cardIds.length
    ? await db
        .select({ id: cards.id, content: cards.content })
        .from(cards)
        .where(inArray(cards.id, cardIds))
    : []
  const contentById = new Map(cardRows.map((c) => [c.id, c.content]))

  return Response.json({
    ok: true,
    run,
    settledAt: session?.settledAt ?? null,
    rounds,
    cards: cardIds.map((cid) => ({
      id: cid,
      content: contentById.get(cid) ?? null,
    })),
  })
})
