/**
 * /api/decks — list decks (with card + due counts) and create decks.
 */
import { asc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, cards, decks } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const createDeckSchema = z.object({
  name: z.string().trim().min(1, 'name required'),
  description: z.string().optional(),
  emoji: z.string().optional(),
})

export async function GET() {
  const rows = await db
    .select({
      id: decks.id,
      name: decks.name,
      description: decks.description,
      emoji: decks.emoji,
      createdAt: decks.createdAt,
      total: sql<number>`count(${cards.id})`,
      due: sql<number>`sum(CASE WHEN ${cards.due} <= ${new Date().toISOString()} AND ${cards.suspended} = 0 THEN 1 ELSE 0 END)`,
      newCards: sql<number>`sum(CASE WHEN ${cards.state} = 0 THEN 1 ELSE 0 END)`,
    })
    .from(decks)
    .leftJoin(cards, eq(cards.deckId, decks.id))
    .groupBy(decks.id)
    .orderBy(asc(decks.name))
  return Response.json({
    decks: rows.map((r) => ({
      ...r,
      total: Number(r.total ?? 0),
      due: Number(r.due ?? 0),
      newCards: Number(r.newCards ?? 0),
    })),
  })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createDeckSchema)
  const name = body.name
  const [existing] = await db.select().from(decks).where(eq(decks.name, name)).limit(1)
  if (existing)
    return Response.json({ error: 'deck name already exists', deck: existing }, { status: 409 })
  const [deck] = await db
    .insert(decks)
    .values({ name, description: body.description ?? null, emoji: body.emoji ?? '📚' })
    .returning()
  return Response.json({ ok: true, deck }, { status: 201 })
})
