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
import { db, decks, getArenaStats, getArenaStatsByDeck, listArenaRuns } from '@learning-hub/db'
import { withRoute } from '@/lib/api'

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 10), 1), 50)
  const perDeck = getArenaStatsByDeck()
  const deckIds = perDeck.map((d) => d.deckId)
  const deckRows = deckIds.length
    ? await db
        .select({ id: decks.id, name: decks.name, emoji: decks.emoji })
        .from(decks)
        .where(inArray(decks.id, deckIds))
    : []
  const deckById = new Map(deckRows.map((d) => [d.id, d]))
  return Response.json({
    ok: true,
    stats: getArenaStats(),
    runs: listArenaRuns({ limit }),
    perDeck: perDeck.map((d) => ({
      ...d,
      name: deckById.get(d.deckId)?.name ?? 'Deleted deck',
      emoji: deckById.get(d.deckId)?.emoji ?? null,
    })),
  })
})
