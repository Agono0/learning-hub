/**
 * POST /api/ideas/council — run the idea past 4 personas (optimist, skeptic,
 * domain expert, devil's advocate) sequentially. Body: { ideaId }
 */
import { z } from 'zod'
import { createChatSession, getIdea } from '@learning-hub/db'
import { COUNCIL_PERSONAS } from '@learning-hub/core'
import { requireAI } from '@/lib/ai'
import { aiErrorResponse, readJson, withRoute } from '@/lib/api'

const councilSchema = z.object({
  ideaId: z.number().int().positive('ideaId required'),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, councilSchema)
  const idea = getIdea(body.ideaId)
  if (!idea) return Response.json({ error: 'idea not found' }, { status: 404 })

  try {
    const ai = await requireAI()
    const prompt = `Idea under review: "${idea.title}"\n${idea.content || '(no description yet)'}\n\nGive your persona's assessment of this idea.`
    const responses: { key: string; name: string; response: string }[] = []
    for (const persona of COUNCIL_PERSONAS) {
      const text = await ai.generateText({ system: persona.system, prompt })
      responses.push({ key: persona.key, name: persona.name, response: text })
    }
    createChatSession({
      kind: 'council',
      contextType: 'idea',
      contextId: idea.id,
      title: `Council: ${idea.title.slice(0, 60)}`,
      messages: responses as unknown[],
    })
    return Response.json({ ok: true, responses })
  } catch (e) {
    // provider errors leak base URLs / model ids / upstream statuses — keep them server-side
    return aiErrorResponse(e)
  }
})
