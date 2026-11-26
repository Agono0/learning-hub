/**
 * /api/hud/quick-review — Returns top due cards for fast desktop HUD micro-review.
 */
import { queryLimit } from '@/lib/query-params'
import { getDueCardsForAudio } from '@learning-hub/db'
import { withRoute } from '@/lib/api'

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = queryLimit(url.searchParams, 3, 10)

  const cards = getDueCardsForAudio(limit)
  return Response.json({
    ok: true,
    cards,
  })
})
