/**
 * /api/arena/progress — local practice rank + activity heatmap.
 *
 * GET ?days=N (7-180, default 84) → the practice rank derived from the
 * append-only arena_runs rows, plus per-day run counts for the heatmap.
 * Practice progression only: personal, never compared against anyone, and
 * read-only (no coins, no SRS, no settlement involvement).
 */
import { z } from 'zod'
import { listArenaRunsForExport } from '@learning-hub/db'
import { buildActivityHeatmap, paceStats, practiceRank } from '@learning-hub/core'
import { readQuery, withRoute } from '@/lib/api'

const querySchema = z.object({
  days: z.coerce.number().int().min(7).max(180).default(84),
})

export const GET = withRoute(async (req: Request) => {
  const { days } = readQuery(req, querySchema)
  const runs = listArenaRunsForExport({ limit: 5000 })
  return Response.json({
    rank: practiceRank(runs),
    heatmap: buildActivityHeatmap(runs, new Date(), days),
    pace: paceStats(runs),
    scope: 'local-practice',
  })
})
