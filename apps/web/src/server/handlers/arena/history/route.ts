/**
 * /api/arena/history — the arena record book.
 *
 * GET → aggregate stats (runs, win rate, accuracy, best combo/score, totals,
 * current win streak) plus the most recent runs, newest first, plus a
 * per-deck record (a run counts toward every deck it touched) enriched with
 * deck names. Everything is derived from the append-only arena_runs table —
 * no mutable counters that could drift from history.
 */
import { inArray } from 'drizzle-orm'
import {
  db,
  decks,
  getArenaStats,
  getArenaStatsByDeck,
  listArenaRuns,
  type ArenaRunRow,
} from '@learning-hub/db'
import { withRoute } from '@/lib/api'

/** How the accuracy trend is moving, for the record book's insight line. */
function accuracyInsight(recent: ArenaRunRow[]): {
  direction: 'up' | 'down' | 'flat' | null
  deltaPercent: number
} {
  if (recent.length < 10) return { direction: null, deltaPercent: 0 }
  const acc = (r: ArenaRunRow) => (r.rounds === 0 ? 0 : r.correct / r.rounds)
  // listArenaRuns is newest-first: first 5 = recent, next 5 = previous.
  const recentAvg = recent.slice(0, 5).reduce((sum, r) => sum + acc(r), 0) / 5
  const priorAvg = recent.slice(5, 10).reduce((sum, r) => sum + acc(r), 0) / 5
  const delta = recentAvg - priorAvg
  return {
    direction: Math.abs(delta) < 0.01 ? 'flat' : delta > 0 ? 'up' : 'down',
    deltaPercent: Math.round(Math.abs(delta) * 100),
  }
}

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 10), 1), 50)
  const perDeck = getArenaStatsByDeck()
  // The trend reads left-to-right oldest → newest over the latest runs.
  const trendRows = listArenaRuns({ limit: 10 }).reverse()
  const deckIds = perDeck.map((d) => d.deckId)
  const deckRows = deckIds.length
    ? await db
        .select({ id: decks.id, name: decks.name, emoji: decks.emoji })
        .from(decks)
        .where(inArray(decks.id, deckIds))
    : []
  const deckById = new Map(deckRows.map((d) => [d.id, d]))
  const insight = accuracyInsight(listArenaRuns({ limit: 10 }))
  return Response.json({
    ok: true,
    stats: getArenaStats(),
    runs: listArenaRuns({ limit }),
    perDeck: perDeck.map((d) => ({
      ...d,
      name: deckById.get(d.deckId)?.name ?? 'Deleted deck',
      emoji: deckById.get(d.deckId)?.emoji ?? null,
    })),
    trend: trendRows.map((r) => ({
      runId: r.referenceId,
      accuracy: r.rounds === 0 ? 0 : r.correct / r.rounds,
      result: r.result,
      createdAt: r.createdAt,
    })),
    insight,
  })
})
