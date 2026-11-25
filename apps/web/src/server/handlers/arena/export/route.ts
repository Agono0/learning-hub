/**
 * /api/arena/export — download the arena record book.
 *
 * GET ?format=csv|json (default csv) → attachment of every settled run,
 * oldest first (capped at 2000). The JSON form is versioned and flagged
 * selfReported: arena grades are client-controlled, so the file is a personal
 * practice log. Read-only; nothing here touches coins, SRS or settlement.
 */
import { z } from 'zod'
import { listArenaRunsForExport } from '@learning-hub/db'
import { arenaRunsToCsv, buildArenaExport, type ArenaExportRun } from '@learning-hub/core'
import { readQuery, withRoute } from '@/lib/api'

const querySchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
})

export const GET = withRoute(async (req: Request) => {
  const { format } = readQuery(req, querySchema)
  const runs: ArenaExportRun[] = listArenaRunsForExport().map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    result: r.result,
    archetype: r.archetype,
    boss: r.boss,
    rounds: r.rounds,
    correct: r.correct,
    accuracy: r.accuracy,
    bestCombo: r.bestCombo,
    crits: r.crits,
    score: r.score,
    coins: r.coins,
    xp: r.xp,
    durationMs: r.durationMs,
    deckIds: r.deckIds,
  }))
  const stamp = new Date().toISOString().slice(0, 10)
  if (format === 'json') {
    return new Response(JSON.stringify(buildArenaExport(runs), null, 2), {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="arena-record-${stamp}.json"`,
      },
    })
  }
  return new Response(arenaRunsToCsv(runs), {
    status: 200,
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="arena-record-${stamp}.csv"`,
    },
  })
})
