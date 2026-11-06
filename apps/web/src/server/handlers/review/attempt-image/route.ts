/**
 * /api/review/attempt-image — Append-only audit of handwritten / sketch card attempts.
 */
import { z } from 'zod'
import { getLatestCardAttemptImage, logCardAttemptImage } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const attemptImageSchema = z.object({
  cardId: z.number().int().positive(),
  reviewId: z.number().int().positive().optional(),
  imageData: z.string().min(10), // Base64 data URL
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const cardId = Number(url.searchParams.get('cardId'))
  if (!cardId) throw new ApiError(400, 'cardId query parameter required')

  const attempt = getLatestCardAttemptImage(cardId)
  return Response.json({ ok: true, attempt })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, attemptImageSchema)
  const logged = logCardAttemptImage({
    cardId: body.cardId,
    reviewId: body.reviewId,
    imageData: body.imageData,
  })

  return Response.json({ ok: true, logged })
})
