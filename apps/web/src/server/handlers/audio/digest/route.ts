/**
 * /api/audio/digest — Generates hands-free audio commute narration scripts from due cards.
 */
import { queryId, queryInt, queryLimit } from '@/lib/query-params'
import { generateAudioDigestScript } from '@learning-hub/core/audio'
import { getDueCardsForAudio } from '@learning-hub/db'
import { withRoute } from '@/lib/api'

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const deckId = queryId(url.searchParams, 'deckId') ?? undefined
  const limit = queryLimit(url.searchParams, 20, 100)
  const minutes = queryInt(url.searchParams, 'minutes', { fallback: 10, min: 1, max: 60 })

  const cards = getDueCardsForAudio(limit, deckId)
  const script = generateAudioDigestScript(cards, minutes)

  return Response.json({
    ok: true,
    script,
  })
})
