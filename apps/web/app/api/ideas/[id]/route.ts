/**
 * /api/ideas/[id] — read (with links), update (stage / promote-to-project /
 * incubator resurface), delete.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, ideaLinks, ideas, projects, withTransaction } from '@learning-hub/db'
import { incubatorScore, promoteToProject } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const patchIdeaSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  stage: z.enum(['seed', 'growing', 'validated', 'project']).optional(),
  tags: z.array(z.string()).optional(),
  resurface: z.boolean().optional(),
  promote: z.boolean().optional(),
})

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const ideaId = Number(id)
  const [idea] = await db.select().from(ideas).where(eq(ideas.id, ideaId)).limit(1)
  if (!idea) return Response.json({ error: 'not found' }, { status: 404 })
  const links = await db
    .select()
    .from(ideaLinks)
    .where(eq(ideaLinks.fromIdeaId, ideaId))
  const incoming = await db
    .select()
    .from(ideaLinks)
    .where(eq(ideaLinks.toIdeaId, ideaId))
  return Response.json({ idea, links, incoming, decayScore: incubatorScore(idea, new Date()) })
}

export const PATCH = withRoute(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const ideaId = Number(id)
  const [idea] = await db.select().from(ideas).where(eq(ideas.id, ideaId)).limit(1)
  if (!idea) return Response.json({ error: 'not found' }, { status: 404 })
  const body = await readJson(req, patchIdeaSchema)

  // resurface → promote → plain update: one atomic sequence so a promote can
  // never create the project row while leaving the idea stage un-updated.
  return withTransaction((tx) => {
    if (body.resurface) {
      tx.update(ideas)
        .set({ lastResurfacedAt: new Date().toISOString(), decayScore: 1.0, updatedAt: new Date().toISOString() })
        .where(eq(ideas.id, ideaId))
        .run()
    }

    if (body.promote) {
      const fields = promoteToProject(idea.id, { title: body.title ?? idea.title, content: body.content ?? idea.content })
      const [project] = tx.insert(projects).values(fields).returning().all()
      tx.update(ideas).set({ stage: 'project', projectId: project!.id, updatedAt: new Date().toISOString() }).where(eq(ideas.id, ideaId)).run()
      return Response.json({ ok: true, project })
    }

    tx.update(ideas)
      .set({
        title: body.title ?? idea.title,
        content: body.content ?? idea.content,
        stage: body.stage ?? idea.stage,
        tags: body.tags ?? idea.tags,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(ideas.id, ideaId))
      .run()
    return Response.json({ ok: true })
  })
})

export const DELETE = withRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const ideaId = Number(id)
  withTransaction((tx) => {
    tx.delete(ideaLinks).where(eq(ideaLinks.fromIdeaId, ideaId)).run()
    tx.delete(ideaLinks).where(eq(ideaLinks.toIdeaId, ideaId)).run()
    tx.delete(ideas).where(eq(ideas.id, ideaId)).run()
  })
  return Response.json({ ok: true })
})
