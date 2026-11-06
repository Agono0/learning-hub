/**
 * /api/audio/sessions — Tracks hands-free commute study sessions.
 */
import { z } from 'zod'
import { listAudioSessions, recordAudioSession } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const recordSessionSchema = z.object({
  deckId: z.number().int().positive().optional(),
  mode: z.enum(['handsfree_review', 'audio_digest']).default('handsfree_review'),
  cardCount: z.number().int().nonnegative(),
  durationSeconds: z.number().int().nonnegative(),
  speechEngine: z.string().optional(),
})

export const GET = withRoute(async () => {
  const sessions = listAudioSessions(20)
  return Response.json({ ok: true, sessions })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, recordSessionSchema)
  const session = recordAudioSession(body)

  return Response.json({ ok: true, session })
})
