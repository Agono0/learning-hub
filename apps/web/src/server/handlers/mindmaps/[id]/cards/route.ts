/**
 * /api/mindmaps/:id/cards — Converts a mindmap into flashcards in the target deck.
 */
import { z } from 'zod'
import { importMindmapCards } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const importMindmapCardsSchema = z.object({
  deckId: z.number().int().positive(),
})

export const POST = withRoute(async (req: Request, ctx: unknown) => {
  const { params } = ctx as { params: { id: string } }
  const id = Number(params.id)
  if (!id) throw new ApiError(400, 'Invalid mindmap id')

  const body = await readJson(req, importMindmapCardsSchema)
  const cards = importMindmapCards(id, body.deckId)

  return Response.json({ ok: true, importedCount: cards.length, cards })
})
