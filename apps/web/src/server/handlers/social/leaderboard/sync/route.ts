/**
 * POST /api/social/friends/sync — fetch every friend's shared stats gist and
 * refresh the local leaderboard rows. First callers of the previously-dead
 * `updateFriendSync`: friends are read-only public gists, no auth, no server.
 */
import type { FriendStats } from '@learning-hub/core/share'
import { listFriends, updateFriendSync } from '@learning-hub/db'
import { withRoute } from '@/lib/api'

interface GistFile {
  content?: string
  raw_url?: string
}

/** Pulls the `lh-stats/v1` envelope out of a gist URL (API or raw form). */
async function fetchFriendStats(gistUrl: string): Promise<FriendStats> {
  let json: unknown

  if (gistUrl.includes('gist.githubusercontent.com')) {
    const res = await fetch(gistUrl, { signal: AbortSignal.timeout(6000) })
    if (!res.ok) throw new Error(`gist fetch failed (${res.status})`)
    json = await res.json()
  } else {
    // GitHub API URL (https://gist.github.com/user/id or …/id) → API resource
    const id = gistUrl.split('/').pop() ?? ''
    if (!/^[0-9a-f]+$/.test(id)) throw new Error('unrecognized gist url')
    const res = await fetch(`https://api.github.com/gists/${id}`, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'learning-hub' },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) throw new Error(`gist api failed (${res.status})`)
    const data = (await res.json()) as { files?: Record<string, GistFile> }
    const file = Object.values(data.files ?? {}).find((f) => f?.content)
    if (!file?.content) throw new Error('gist has no files')
    json = JSON.parse(file.content)
  }

  const stats = json as FriendStats
  if (!stats || stats.schema !== 'lh-stats/v1') {
    throw new Error('not an lh-stats/v1 envelope')
  }
  return stats
}

export const POST = withRoute(async () => {
  const friends = listFriends()
  let synced = 0
  const failed: Array<{ alias: string; reason: string }> = []

  for (const friend of friends) {
    try {
      const stats = await fetchFriendStats(friend.gistUrl)
      updateFriendSync(friend.id, JSON.stringify({ ...stats, username: friend.alias }))
      synced++
    } catch (err) {
      failed.push({ alias: friend.alias, reason: (err as Error).message })
    }
  }

  return Response.json({ ok: true, synced, failed })
})
