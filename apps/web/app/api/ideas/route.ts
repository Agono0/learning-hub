/**
 * /api/ideas — list + create. Create accepts an optional `linkedTo` to wire a
 * link immediately. Ideas are the inbox board + incubator data.
 */
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, ideaLinks, ideas } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const IDEA_STAGES = ['seed', 'growing', 'validated', 'project'] as const
const IDEA_LINK_TYPES = ['related', 'supports', 'contradicts', 'refines', 'parent-of'] as const

const createIdeaSchema = z.object({
  title: z.string().trim().min(1, 'title required'),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
  stage: z.enum(IDEA_STAGES).optional(),
  linkedTo: z
    .object({
      ideaId: z.number().int().positive(),
      type: z.enum(IDEA_LINK_TYPES).optional(),
      context: z.string().optional(),
    })
    .optional(),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const stageParam = url.searchParams.get('stage')
  // column is typed IdeaStage — only pass through valid values, else unfiltered
  const stage = (IDEA_STAGES as readonly string[]).includes(stageParam ?? '') ? (stageParam as (typeof IDEA_STAGES)[number]) : null
  const rows = stage
    ? await db.select().from(ideas).where(eq(ideas.stage, stage)).orderBy(desc(ideas.updatedAt)).limit(200)
    : await db.select().from(ideas).orderBy(desc(ideas.updatedAt)).limit(200)
  const links = await db.select().from(ideaLinks)
  return Response.json({ ideas: rows, links })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createIdeaSchema)
  const [idea] = await db
    .insert(ideas)
    .values({ title: body.title, content: body.content ?? '', tags: body.tags ?? [], stage: body.stage ?? 'seed' })
    .returning()
  if (body.linkedTo?.ideaId) {
    await db.insert(ideaLinks).values({
      fromIdeaId: body.linkedTo.ideaId,
      toIdeaId: idea!.id,
      type: body.linkedTo.type ?? 'related',
      context: body.linkedTo.context ?? null,
    })
  }
  return Response.json({ ok: true, idea })
})
