/**
 * /api/social/leaderboard — Decentralized Gist friend connections & leaderboard stats.
 */
import { queryId } from '@/lib/query-params'
import { z } from 'zod'
import { addFriend, deleteFriend, generateUserStatsEnvelope, listFriends } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const addFriendSchema = z.object({
  alias: z.string().min(1).max(50),
  gistUrl: z.string().url(),
})

export const GET = withRoute(async () => {
  const userStats = generateUserStatsEnvelope()
  const friends = listFriends()

  const friendEntries = friends.map((f) => {
    let parsedStats = null
    if (f.lastDataJson) {
      try {
        parsedStats = JSON.parse(f.lastDataJson)
      } catch {
        // ignore malformed cached json
      }
    }
    return {
      id: f.id,
      alias: f.alias,
      gistUrl: f.gistUrl,
      lastSyncedAt: f.lastSyncedAt,
      stats: parsedStats,
    }
  })

  return Response.json({
    ok: true,
    user: userStats,
    friends: friendEntries,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, addFriendSchema)
  const created = addFriend(body.alias, body.gistUrl)
  return Response.json({ ok: true, friend: created })
})

export const DELETE = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const id = queryId(url.searchParams, 'id')
  if (id === null) throw new ApiError(400, 'id parameter required')

  const ok = deleteFriend(id)
  if (!ok) throw new ApiError(404, 'Friend not found')

  return Response.json({ ok: true })
})
