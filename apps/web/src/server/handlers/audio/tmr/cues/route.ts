/**
 * /api/audio/tmr/cues — Targeted Memory Reactivation (TMR) sleep consolidation cues.
 *
 * GET  → cues queued for tonight's replay.
 * POST → `mint_cue` (one card), `mint_recent` (every card reviewed in the last
 *        `sinceHours`, default 24 — TMR only helps same-day learning, Rasch & Born
 *        2007), or `record_sleep_playback` (cards replayed during sleep).
 */
import { z } from 'zod'
import { generateTmrEarcon } from '@learning-hub/core'
import {
  cardExists,
  getTmrCuesForSleepReplay,
  mintTmrCuesForRecentReviews,
  recordSleepTmrPlayback,
  upsertTmrCue,
} from '@learning-hub/db'
import { ApiError, readJson, readQuery, withRoute } from '@/lib/api'

const tmrPostSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('mint_cue'), cardId: z.number().int().positive() }),
  z.object({
    action: z.literal('mint_recent'),
    sinceHours: z.number().min(1).max(72).default(24),
    limit: z.number().int().min(1).max(200).default(40),
  }),
  z.object({
    action: z.literal('record_sleep_playback'),
    playedCardIds: z.array(z.number().int().positive()).max(1000).default([]),
  }),
])

const tmrQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(35),
})

export const GET = withRoute(async (req: Request) => {
  const { limit } = readQuery(req, tmrQuerySchema)
  return Response.json({ ok: true, cues: getTmrCuesForSleepReplay(limit) })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, tmrPostSchema)

  switch (body.action) {
    case 'mint_cue': {
      if (!cardExists(body.cardId)) throw new ApiError(404, 'card not found')
      const cue = upsertTmrCue(body.cardId, generateTmrEarcon(body.cardId))
      return Response.json({ ok: true, cue })
    }
    case 'mint_recent': {
      const since = new Date(Date.now() - body.sinceHours * 3_600_000).toISOString()
      const minted = mintTmrCuesForRecentReviews(since, body.limit)
      return Response.json({ ok: true, minted })
    }
    case 'record_sleep_playback': {
      recordSleepTmrPlayback(body.playedCardIds)
      return Response.json({ ok: true, playedCount: body.playedCardIds.length })
    }
  }
})
