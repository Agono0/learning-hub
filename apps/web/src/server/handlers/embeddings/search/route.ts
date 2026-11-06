/**
 * /api/embeddings/search — Vector cosine similarity search across card embeddings.
 */
import { z } from 'zod'
import { searchCardEmbeddingsCosine, upsertCardEmbedding } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const searchSchema = z.object({
  queryVector: z.array(z.number()),
  topK: z.number().int().min(1).max(50).default(5),
  minScore: z.number().min(-1).max(1).default(0.1),
})

const upsertSchema = z.object({
  cardId: z.number().int().positive(),
  embedding: z.array(z.number()),
  model: z.string().optional(),
})

export const POST = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const isUpsert = url.searchParams.get('mode') === 'upsert'

  if (isUpsert) {
    const body = await readJson(req, upsertSchema)
    upsertCardEmbedding(body)
    return Response.json({ ok: true })
  }

  const body = await readJson(req, searchSchema)
  const matches = searchCardEmbeddingsCosine(body.queryVector, body.topK, body.minScore)

  return Response.json({
    ok: true,
    matches,
  })
})
