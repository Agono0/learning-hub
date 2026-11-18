/**
 * /api/decks — list decks (with card + due counts) and create decks.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, decks, getDeckSummaries } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const createDeckSchema = z.object({
  name: z.string().trim().min(1, 'name required'),
  description: z.string().optional(),
  emoji: z.string().optional(),
})

export async function GET() {
  // Shared stats repo — the headless server serves the same rows from the
  // same query (repos/stats); the aggregate SQL exists exactly once.
  return Response.json({ decks: getDeckSummaries() })
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
