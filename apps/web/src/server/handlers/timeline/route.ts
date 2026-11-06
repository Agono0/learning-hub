/**
 * GET /api/timeline — the unified activity stream (reviews, XP, focus, planted
 * trees, study coins, friction events) merged from the append-only ledgers.
 * Powers the dashboard Activity widget. Boots the in-app event engines on
 * first hit (same lazy pattern as plugins).
 */
import { getActivityTimeline } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { ensureEnginesLoaded } from '@/server/engine'

export const GET = withRoute(async (req: Request) => {
  ensureEnginesLoaded()
  const url = new URL(req.url)
  const days = Math.min(31, Math.max(1, Number(url.searchParams.get('days') ?? '14') || 14))
  return Response.json({ ok: true, entries: getActivityTimeline(days) })
})
