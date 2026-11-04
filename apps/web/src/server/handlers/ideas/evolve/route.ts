/**
 * POST /api/ideas/evolve — combine two ideas into a hybrid offspring.
 * AI when configured, deterministic manual merge otherwise. Creates the
 * offspring idea + `parent-of` links from both parents.
 * Body: { aId, bId }
 */
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db, ideaLinks, ideas, xpEvents } from '@learning-hub/db'
import { evolveIdeas, manualHybrid, XP_REWARDS } from '@learning-hub/core'
import { getActiveAIClientFromDb } from '@/lib/ai'
import { readJson, withRoute } from '@/lib/api'

const hybridSchema = z.object({ title: z.string().min(1), content: z.string().min(1) })

const evolveSchema = z.object({
  aId: z.number().int().positive('aId required'),
  bId: z.number().int().positive('bId required'),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, evolveSchema)
  const [a] = await db.select().from(ideas).where(eq(ideas.id, body.aId)).limit(1)
  const [b] = await db.select().from(ideas).where(eq(ideas.id, body.bId)).limit(1)
  if (!a || !b) return Response.json({ error: 'idea not found' }, { status: 404 })

  const { system, prompt, guidance } = evolveIdeas(a, b)
  let title: string
  let content: string
  let mode: 'ai' | 'manual'
  const client = await getActiveAIClientFromDb()
  if (client) {
    try {
      const hybrid = await client.generateJSON({ schema: hybridSchema, system, prompt })
      title = hybrid.title
      content = hybrid.content
      mode = 'ai'
    } catch {
      const fallback = manualHybrid(a, b)
      title = fallback.title
      content = fallback.content
      mode = 'manual'
    }
  } else {
    const fallback = manualHybrid(a, b)
    title = fallback.title
    content = `${fallback.content}\n\nGuidance: ${guidance}`
    mode = 'manual'
  }

  const [offspring] = await db
    .insert(ideas)
    .values({ title, content, stage: 'seed', tags: ['hybrid'] })
    .returning()
  await db.insert(ideaLinks).values([
    { fromIdeaId: a.id, toIdeaId: offspring!.id, type: 'parent-of', context: 'evolution parent A' },
    { fromIdeaId: b.id, toIdeaId: offspring!.id, type: 'parent-of', context: 'evolution parent B' },
  ])
  await db
    .insert(xpEvents)
    .values({
      source: 'idea',
      amount: XP_REWARDS.ideaEvolve,
      meta: { parents: [a.id, b.id], offspring: offspring!.id, mode },
    })
  return Response.json({ ok: true, mode, offspring, parents: [a.id, b.id] })
})
