/**
 * /api/audio/digest — Generates hands-free audio commute narration scripts from due cards.
 */
import { generateAudioDigestScript } from '@learning-hub/core/audio'
import { getDueCardsForAudio } from '@learning-hub/db'
import { withRoute } from '@/lib/api'

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const deckId = url.searchParams.get('deckId') ? Number(url.searchParams.get('deckId')) : undefined
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 20
  const minutes = url.searchParams.get('minutes') ? Number(url.searchParams.get('minutes')) : 10

  const cards = getDueCardsForAudio(limit, deckId)
  const script = generateAudioDigestScript(cards, minutes)

  return Response.json({
    ok: true,
    script,
  })
})
