/**
 * /api/decks/[id] — rename/edit or delete a deck (cascades its cards).
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, cards, decks } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const patchDeckSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  emoji: z.string().optional(),
})

function parseId(id: string): number {
  const deckId = Number(id)
  if (!Number.isInteger(deckId) || deckId <= 0) throw new ApiError(400, 'invalid id')
  return deckId
}

export const PATCH = withRoute(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const deckId = parseId(id)
  const body = await readJson(req, patchDeckSchema)
  const [existing] = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1)
  if (!existing) return Response.json({ error: 'not found' }, { status: 404 })
  const [deck] = await db
    .update(decks)
    .set({
      name: body.name?.trim() || existing.name,
      description: body.description !== undefined ? body.description : existing.description,
      emoji: body.emoji ?? existing.emoji,
    })
    .where(eq(decks.id, deckId))
    .returning()
  return Response.json({ ok: true, deck })
})

export const DELETE = withRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const deckId = parseId(id)

  const [existing] = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1)
  if (!existing) return Response.json({ error: 'not found' }, { status: 404 })

  db.transaction((tx) => {
    tx.delete(cards).where(eq(cards.deckId, deckId)).run()
    tx.delete(decks).where(eq(decks.id, deckId)).run()
  })

  return Response.json({ ok: true })
})
