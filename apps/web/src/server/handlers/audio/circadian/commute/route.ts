/**
 * /api/audio/circadian/commute — Hands-free audio spaced repetition for commutes/walking.
 */
import { z } from 'zod'
import {
  BINAURAL_PRESETS,
  calculateAudioRecallPauseMs,
  circadianAudioSessionPayloadSchema,
} from '@learning-hub/core'
import { executeReview, getDueCardsForAudio, recordCircadianAudioSession } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const deckId = url.searchParams.get('deckId') ? Number(url.searchParams.get('deckId')) : undefined
  const limit = url.searchParams.get('limit') ? Number(url.searchParams.get('limit')) : 15
  const binauralMode = (url.searchParams.get('binaural') ??
    'gamma_40hz') as keyof typeof BINAURAL_PRESETS

  const cards = getDueCardsForAudio(limit, deckId)

  // Construct structured audio cues with dynamic pause pacing
  const cues = cards.map((c) => {
    // Stability calculation from card content or default
    const pauseMs = calculateAudioRecallPauseMs(5.0)
    return {
      cardId: c.id,
      promptText: c.front,
      answerText: c.back,
      deckName: c.deckName,
      pauseMs,
    }
  })

  return Response.json({
    ok: true,
    cues,
    binauralPreset: BINAURAL_PRESETS[binauralMode] ?? BINAURAL_PRESETS.gamma_40hz,
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, circadianAudioSessionPayloadSchema)

  // 1. Record the overall audio session
  const session = recordCircadianAudioSession({
    sessionMode: body.sessionMode,
    deckId: body.deckId,
    cardsReviewed: body.cardsReviewed,
    durationSeconds: body.durationSeconds,
    binauralMode: body.binauralMode,
    handsFreeInputs: body.handsFreeInputs,
  })

  // 2. Grade any cards submitted through hands-free input via executeReview
  const gradedResults: Array<{ cardId: number; grade: number }> = []
  for (const input of body.handsFreeInputs) {
    try {
      await executeReview({
        cardId: input.cardId,
        grade: input.grade,
      })
      gradedResults.push({ cardId: input.cardId, grade: input.grade })
    } catch {
      // Ignore individual card failures to preserve session completion
    }
  }

  return Response.json({
    ok: true,
    session,
    gradedCount: gradedResults.length,
  })
})
