/**
 * /api/cards/occlusion — Batch generates individual review cards for each occlusion region.
 */
import { z } from 'zod'
import { batchCreateOcclusionCards } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const occlusionBatchSchema = z.object({
  deckId: z.number().int().positive(),
  imageId: z.number().int().positive(),
  rects: z
    .array(
      z.object({
        id: z.string().min(1),
        x: z.number().min(0).max(1),
        y: z.number().min(0).max(1),
        w: z.number().min(0).max(1),
        h: z.number().min(0).max(1),
        label: z.string().optional(),
        shape: z.enum(['rect', 'ellipse']).optional(),
      }),
    )
    .min(1),
  mode: z.enum(['hide-all-guess-one', 'hide-one-guess-one']).optional(),
  groupId: z.string().optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, occlusionBatchSchema)
  const created = batchCreateOcclusionCards(body.deckId, {
    imageId: body.imageId,
    rects: body.rects,
    mode: body.mode,
    groupId: body.groupId,
  })

  return Response.json({ ok: true, count: created.length, cards: created })
})
