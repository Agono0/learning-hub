/**
 * /api/audio/circadian/commute — Hands-free audio spaced repetition for commutes/walking.
 *
 * GET  → due cards as spoken cues; each cue's silent recall pause scales with the
 *        card's own FSRS stability (calculateAudioRecallPauseMs).
 * POST → grades every hands-free input through the ONE grading path
 *        (executeReview — FSRS/XP/mastery are never touched by hand), records the
 *        session with the number of cards actually graded, and mints a TMR cue for
 *        each graded card so tonight's sleep replay covers today's commute.
 */
import { z } from 'zod'
import {
  BINAURAL_PRESETS,
  calculateAudioRecallPauseMs,
  circadianAudioSessionPayloadSchema,
} from '@learning-hub/core'
import {
  executeReview,
  getDueCardsForAudio,
  mintTmrCues,
  recordCircadianAudioSession,
} from '@learning-hub/db'
import { readJson, readQuery, withRoute } from '@/lib/api'

const commuteQuerySchema = z.object({
  deckId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(15),
  binaural: z.enum(['gamma_40hz', 'alpha_10hz', 'delta_2hz', 'none']).default('gamma_40hz'),
})

export const GET = withRoute(async (req: Request) => {
  const query = readQuery(req, commuteQuerySchema)
  const cards = getDueCardsForAudio(query.limit, query.deckId)

  const cues = cards.map((c) => ({
    cardId: c.id,
    promptText: c.front,
    /** What TTS should say — cloze blanks read as "blank", not "underscore". */
    spokenPrompt: c.spokenFront,
    answerText: c.back,
    deckName: c.deckName,
    pauseMs: calculateAudioRecallPauseMs(c.stability),
  }))

  return Response.json({
    ok: true,
    cues,
    binauralPreset: BINAURAL_PRESETS[query.binaural],
  })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, circadianAudioSessionPayloadSchema)

  // 1. Grade each hands-free input through the single grading path. One bad card
  //    (deleted mid-session, say) must not lose the rest of the commute.
  const graded: Array<{ cardId: number; grade: number }> = []
  const failed: Array<{ cardId: number; error: string }> = []
  for (const input of body.handsFreeInputs) {
    try {
      await executeReview({
        cardId: input.cardId,
        grade: input.grade,
        // latency is the learner's real response time; clamp to sane review bounds
        timeMs: Math.min(600_000, Math.max(0, Math.round(input.latencyMs))),
        // `today` deliberately omitted: the client timestamp is an unvalidated
        // string and the server clock is the scheduling source of truth.
      })
      graded.push({ cardId: input.cardId, grade: input.grade })
    } catch (err) {
      failed.push({
        cardId: input.cardId,
        error: err instanceof Error ? err.message : 'review failed',
      })
    }
  }

  // 2. Record the session after grading, with the honest graded count.
  const session = recordCircadianAudioSession({
    sessionMode: body.sessionMode,
    deckId: body.deckId,
    cardsReviewed: Math.max(body.cardsReviewed, graded.length),
    durationSeconds: body.durationSeconds,
    binauralMode: body.binauralMode,
    handsFreeInputs: body.handsFreeInputs,
  })

  // 3. Pair today's commute cards with sleep cues (Targeted Memory Reactivation).
  const tmrCuesMinted = mintTmrCues(graded.map((g) => g.cardId))

  return Response.json({
    ok: true,
    session,
    gradedCount: graded.length,
    failed,
    tmrCuesMinted,
  })
})
