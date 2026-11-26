/**
 * /api/audio/digest — Generates hands-free audio commute narration scripts from due cards.
 */
import { generateAudioDigestScript } from '@learning-hub/core/audio'
import { getDueCardsForAudio } from '@learning-hub/db'
import { withRoute } from '@/lib/api'
import { intParam } from '@/server/query-params'

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const deckId = url.searchParams.get('deckId') ? Number(url.searchParams.get('deckId')) : undefined
  const limit = intParam(url.searchParams.get('limit'), { fallback: 20, min: 1, max: 200 })
  const minutes = intParam(url.searchParams.get('minutes'), { fallback: 10, min: 1, max: 120 })

  const cards = getDueCardsForAudio(limit, deckId)
  const script = generateAudioDigestScript(cards, minutes)

  return Response.json({
    ok: true,
    script,
  })
})
