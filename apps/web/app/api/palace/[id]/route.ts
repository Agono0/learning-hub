/**
 * /api/palace/[id] — edit palace + loci, walk order, delete.
 * PATCH replaces the full loci set when `items` is provided (palace loci are
 * edited as a whole list in the builder), returns items in walk order
 * (palaceWalkOrder = ascending lociIndex).
 */
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, palaceItems, palaces } from '@learning-hub/db'
import { palaceWalkOrder } from '@learning-hub/core'
import { ApiError, readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const patchPalaceSchema = z.object({
  name: z.string().optional(),
  description: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        lociIndex: z.number().int().min(0),
        name: z.string(),
        vividImage: z.string().nullable().optional(),
        cardId: z.number().int().positive().nullable().optional(),
      }),
    )
    .optional(),
})

function parseId(id: string): number {
  const palaceId = Number(id)
  if (!Number.isInteger(palaceId) || palaceId <= 0) throw new ApiError(400, 'invalid id')
  return palaceId
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const palaceId = Number(id)
  const [palace] = await db.select().from(palaces).where(eq(palaces.id, palaceId)).limit(1)
  if (!palace) return Response.json({ error: 'not found' }, { status: 404 })
  const items = await db
    .select()
    .from(palaceItems)
    .where(eq(palaceItems.palaceId, palaceId))
    .orderBy(asc(palaceItems.lociIndex))
  return Response.json({ palace, items: palaceWalkOrder(items) })
}

export const PATCH = withRoute(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const palaceId = parseId(id)
  const body = await readJson(req, patchPalaceSchema)
  const [existing] = await db.select().from(palaces).where(eq(palaces.id, palaceId)).limit(1)
  if (!existing) return Response.json({ error: 'not found' }, { status: 404 })

  if (body.name !== undefined || body.description !== undefined) {
    await db
      .update(palaces)
      .set({
        name: body.name?.trim() || existing.name,
        description: body.description !== undefined ? body.description : existing.description,
      })
      .where(eq(palaces.id, palaceId))
  }

  if (body.items) {
    const items = body.items
    db.transaction((tx) => {
      tx.delete(palaceItems).where(eq(palaceItems.palaceId, palaceId)).run()
      if (items.length > 0) {
        tx.insert(palaceItems)
          .values(
            items.map((item) => ({
              palaceId,
              lociIndex: item.lociIndex,
              name: item.name,
              vividImage: item.vividImage ?? null,
              cardId: item.cardId ?? null,
            })),
          )
          .run()
      }
    })
  }

  const [palace] = await db.select().from(palaces).where(eq(palaces.id, palaceId)).limit(1)
  const items = await db
    .select()
    .from(palaceItems)
    .where(eq(palaceItems.palaceId, palaceId))
    .orderBy(asc(palaceItems.lociIndex))
  return Response.json({ ok: true, palace, items: palaceWalkOrder(items) })
})

export const DELETE = withRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const palaceId = parseId(id)

  db.transaction((tx) => {
    tx.delete(palaceItems).where(eq(palaceItems.palaceId, palaceId)).run()
    tx.delete(palaces).where(eq(palaces.id, palaceId)).run()
  })

  return Response.json({ ok: true })
})
