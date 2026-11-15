/**
 * /api/mindmaps/:id/cards — Converts a mindmap into flashcards in the target deck.
 * Re-importing is safe: cards already generated into that deck are skipped.
 */
import { z } from 'zod'
import { eventBus } from '@learning-hub/core'
import { MindmapImportError, importMindmapCards } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const importMindmapCardsSchema = z.object({
  deckId: z.number().int().positive(),
})

const STATUS: Record<MindmapImportError['code'], number> = {
  mindmap_not_found: 404,
  deck_not_found: 404,
  invalid_mindmap: 422,
}

export const POST = withRoute(async (req: Request, ctx: unknown) => {
  const { params } = ctx as { params: { id: string } } // withRoute awaits params
  const id = Number(params.id)
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, 'Invalid mindmap id')

  const body = await readJson(req, importMindmapCardsSchema)
  let result
  try {
    result = importMindmapCards(id, body.deckId)
  } catch (err) {
    if (err instanceof MindmapImportError) throw new ApiError(STATUS[err.code], err.message)
    throw err
  }

  if (result.created.length > 0) {
    eventBus.emit('card.created', { deckId: body.deckId, count: result.created.length })
  }
  return Response.json({
    ok: true,
    importedCount: result.created.length,
    skippedCount: result.skipped,
    cards: result.created,
  })
})
