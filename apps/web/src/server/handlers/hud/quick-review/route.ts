/**
 * /api/hud/quick-review — Returns top due cards for fast desktop HUD micro-review.
 */
import { getDueCardsForAudio } from '@learning-hub/db'
import { withRoute } from '@/lib/api'

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = Math.min(10, Math.max(1, Number(url.searchParams.get('limit') || 3)))

  const cards = getDueCardsForAudio(limit)
  return Response.json({
    ok: true,
    cards,
  })
})
