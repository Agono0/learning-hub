/**
 * GET /api/timeline — the unified activity stream (reviews, XP, focus, planted
 * trees, study coins, friction events) merged from the append-only ledgers.
 * Powers the dashboard Activity widget. Boots the in-app event engines on
 * first hit (same lazy pattern as plugins).
 */
import { queryInt } from '@/lib/query-params'
import { getActivityTimeline } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { ensureEnginesLoaded } from '@/server/engine'

export const GET = withRoute(async (req: Request) => {
  ensureEnginesLoaded()
  const url = new URL(req.url)
  const days = queryInt(url.searchParams, 'days', { fallback: 14, min: 1, max: 31 })
  return Response.json({ ok: true, entries: getActivityTimeline(days) })
})
