/**
 * /api/hud/quick-review — Returns top due cards for fast desktop HUD micro-review.
 */
import { getDueCardsForAudio } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { intParam } from '@/server/query-params'

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = intParam(url.searchParams.get('limit'), { fallback: 3, min: 1, max: 10 })

  const cards = getDueCardsForAudio(limit)
  return Response.json({
    ok: true,
    cards,
  })
})
