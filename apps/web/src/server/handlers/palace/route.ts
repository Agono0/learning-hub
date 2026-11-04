/**
 * /api/palace — memory palaces: list (with loci) and create.
 * Layout shape: { rooms: { name, emoji }[] } (per schema).
 */
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, palaceItems, palaces } from '@learning-hub/db'
import { palaceWalkOrder } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

const createPalaceSchema = z.object({
  name: z.string().trim().min(1, 'name required'),
  description: z.string().nullable().optional(),
  rooms: z.array(z.object({ name: z.string(), emoji: z.string().optional() })).optional(),
})

async function palaceWithItems(palaceId: number) {
  const [palace] = await db.select().from(palaces).where(eq(palaces.id, palaceId)).limit(1)
  if (!palace) return null
  const items = await db
    .select()
    .from(palaceItems)
    .where(eq(palaceItems.palaceId, palaceId))
    .orderBy(asc(palaceItems.lociIndex))
  return { palace, items: palaceWalkOrder(items) }
}

export async function GET() {
  const rows = await db.select().from(palaces).orderBy(asc(palaces.name))
  const withItems = await Promise.all(rows.map((p) => palaceWithItems(p.id)))
  return Response.json({ palaces: withItems.filter((p) => p !== null) })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createPalaceSchema)
  const [palace] = await db
    .insert(palaces)
    .values({
      name: body.name,
      description: body.description ?? null,
      layout: { rooms: (body.rooms ?? []).map((r) => ({ name: r.name, emoji: r.emoji ?? '🚪' })) },
    })
    .returning()
  return Response.json({ ok: true, ...(await palaceWithItems(palace!.id)) }, { status: 201 })
})
