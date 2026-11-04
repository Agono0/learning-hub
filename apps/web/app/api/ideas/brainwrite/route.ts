/**
 * POST /api/ideas/brainwrite — AI brainwriting partner generates new angles,
 * then the merge dedupes anything too similar (>0.85) to the user's own ideas.
 * Body: { topic, userIdeas[] }
 */
import { z } from 'zod'
import { BRAINWRITE_SYSTEM, brainwritePrompt, brainwritingMerge } from '@learning-hub/core'
import { requireAI } from '@/lib/ai'
import { aiErrorResponse, readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const ideasSchema = z.object({ ideas: z.array(z.string().min(1)).min(1) })

const brainwriteSchema = z.object({
  topic: z.string().trim().min(1, 'topic required'),
  userIdeas: z.array(z.string()).optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, brainwriteSchema)
  const userIdeas = (body.userIdeas ?? []).filter((i) => i.trim())

  try {
    const ai = await requireAI()
    const aiOut = await ai.generateJSON({
      schema: ideasSchema,
      system: BRAINWRITE_SYSTEM,
      prompt: brainwritePrompt(body.topic, userIdeas),
    })
    const { merged, dropped } = brainwritingMerge(userIdeas, aiOut.ideas)
    return Response.json({ ok: true, merged, dropped, aiIdeas: aiOut.ideas })
  } catch (e) {
    // provider errors leak base URLs / model ids / upstream statuses — keep them server-side
    return aiErrorResponse(e)
  }
})
