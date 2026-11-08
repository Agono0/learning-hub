/**
 * /api/ideas — list + create. Create accepts an optional `linkedTo` to wire a
 * link immediately. Ideas are the inbox board + incubator data.
 */
import { z } from 'zod'
import { createIdea, listIdeas, type IdeaLinkType, type IdeaStage } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

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
  const stage = (IDEA_STAGES as readonly string[]).includes(stageParam ?? '')
    ? (stageParam as IdeaStage)
    : null
  const { ideas: rows, links } = listIdeas({ stage, limit: 200 })
  return Response.json({ ideas: rows, links })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createIdeaSchema)
  const idea = createIdea({
    title: body.title,
    content: body.content,
    tags: body.tags,
    stage: body.stage as IdeaStage | undefined,
    linkedTo: body.linkedTo
      ? {
          ideaId: body.linkedTo.ideaId,
          type: body.linkedTo.type as IdeaLinkType | undefined,
          context: body.linkedTo.context,
        }
      : undefined,
  })
  return Response.json({ ok: true, idea })
})
