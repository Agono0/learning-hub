/**
 * /api/arena/history — the arena record book.
 *
 * GET → aggregate stats (runs, win rate, accuracy, best combo/score, totals,
 * current win streak) plus the most recent runs, newest first. Everything is
 * derived from the append-only arena_runs table — no mutable counters that
 * could drift from history.
 */
import { getArenaStats, listArenaRuns } from '@learning-hub/db'
import { withRoute } from '@/lib/api'

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 10), 1), 50)
  return Response.json({
    ok: true,
    stats: getArenaStats(),
    runs: listArenaRuns({ limit }),
  })
})
