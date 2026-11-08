/**
 * /api/ideas/[id] — read (with links), update (stage / promote-to-project /
 * incubator resurface), delete.
 */
import { z } from 'zod'
import { deleteIdea, getIdeaDetail, updateIdea } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

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
  const detail = getIdeaDetail(ideaId)
  if (!detail) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json(detail)
}

export const PATCH = withRoute(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const ideaId = Number(id)
  const body = await readJson(req, patchIdeaSchema)

  const result = updateIdea(ideaId, body)
  if (!result.idea) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json({ ok: true, idea: result.idea, project: result.project })
})

export const DELETE = withRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const ideaId = Number(id)
  deleteIdea(ideaId)
  return Response.json({ ok: true })
})
