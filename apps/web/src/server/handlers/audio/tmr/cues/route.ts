/**
 * /api/audio/tmr/cues — Targeted Memory Reactivation (TMR) sleep consolidation cues.
 */
import { z } from 'zod'
import { generateTmrEarcon } from '@learning-hub/core'
import { getTmrCuesForSleepReplay, recordSleepTmrPlayback, upsertTmrCue } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const tmrPostSchema = z.object({
  action: z.enum(['mint_cue', 'record_sleep_playback']),
  cardId: z.number().int().positive().optional(),
  playedCardIds: z.array(z.number().int().positive()).optional(),
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 35

  const cues = getTmrCuesForSleepReplay(limit)
  return Response.json({
    ok: true,
    cues,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, tmrPostSchema)

  if (body.action === 'mint_cue') {
    if (!body.cardId) {
      return Response.json({ ok: false, error: 'cardId required for mint_cue' }, { status: 400 })
    }
    const signature = generateTmrEarcon(body.cardId)
    const cue = upsertTmrCue(body.cardId, signature)
    return Response.json({ ok: true, cue })
  }

  if (body.action === 'record_sleep_playback') {
    const ids = body.playedCardIds ?? []
    recordSleepTmrPlayback(ids)
    return Response.json({ ok: true, playedCount: ids.length })
  }

  return Response.json({ ok: false, error: 'Invalid action' }, { status: 400 })
})
