/**
 * /api/review/attempt-image — Append-only audit of handwritten / sketch card attempts.
 */
import { queryId } from '@/lib/query-params'
import { z } from 'zod'
import { getLatestCardAttemptImage, logCardAttemptImage } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

/**
 * NEW limit, added with the request-size hardening: before it, imageData had no maximum at all
 * (only the then-default body cap). 8M characters of base64 PNG data URL is far above a real
 * handwriting canvas and was approved as a product limit.
 */
const MAX_IMAGE_DATA_CHARS = 8 * 1024 * 1024
/** JSON body cap for this route: the data URL plus a little for the other fields. */
const MAX_ATTEMPT_IMAGE_BODY_BYTES = MAX_IMAGE_DATA_CHARS + 4 * 1024

const attemptImageSchema = z.object({
  cardId: z.number().int().positive(),
  reviewId: z.number().int().positive().optional(),
  imageData: z.string().min(10).max(MAX_IMAGE_DATA_CHARS), // Base64 data URL
})

export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const cardId = queryId(url.searchParams, 'cardId')
  if (cardId === null) throw new ApiError(400, 'cardId query parameter required')

  const attempt = getLatestCardAttemptImage(cardId)
  return Response.json({ ok: true, attempt })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, attemptImageSchema, { maxBytes: MAX_ATTEMPT_IMAGE_BODY_BYTES })
  const logged = logCardAttemptImage({
    cardId: body.cardId,
    reviewId: body.reviewId,
    imageData: body.imageData,
  })

  return Response.json({ ok: true, logged })
})
