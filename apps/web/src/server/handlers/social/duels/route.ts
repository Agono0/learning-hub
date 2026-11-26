/**
 * /api/social/duels — 1v1 rapid-recall duel matchmaking & results.
 */
import { queryLimit } from '@/lib/query-params'
import { z } from 'zod'
import { calculateElo } from '@learning-hub/core/guilds'
import { listRecentDuels, recordDuelResult } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const recordDuelSchema = z.object({
  player1Alias: z.string().min(1),
  player2Alias: z.string().min(1),
  winnerAlias: z.string().optional(),
  player1Score: z.number().int().nonnegative(),
  player2Score: z.number().int().nonnegative(),
  player1CurrentElo: z.number().int().default(1200),
  player2CurrentElo: z.number().int().default(1200),
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = queryLimit(url.searchParams, 10, 50)
  const duels = listRecentDuels(limit)

  return Response.json({
    ok: true,
    duels,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, recordDuelSchema)

  const duel = recordDuelResult({
    player1Alias: body.player1Alias,
    player2Alias: body.player2Alias,
    winnerAlias: body.winnerAlias || null,
    player1Score: body.player1Score,
    player2Score: body.player2Score,
  })

  // Calculate new Elo ratings
  let p1Outcome: 1.0 | 0.5 | 0.0 = 0.5
  if (body.winnerAlias === body.player1Alias) p1Outcome = 1.0
  else if (body.winnerAlias === body.player2Alias) p1Outcome = 0.0

  const p2Outcome: 1.0 | 0.5 | 0.0 = p1Outcome === 1.0 ? 0.0 : p1Outcome === 0.0 ? 1.0 : 0.5

  const player1NewElo = calculateElo(body.player1CurrentElo, body.player2CurrentElo, p1Outcome)
  const player2NewElo = calculateElo(body.player2CurrentElo, body.player1CurrentElo, p2Outcome)

  return Response.json({
    ok: true,
    duel,
    eloUpdates: {
      player1: { previous: body.player1CurrentElo, next: player1NewElo },
      player2: { previous: body.player2CurrentElo, next: player2NewElo },
    },
  })
})
