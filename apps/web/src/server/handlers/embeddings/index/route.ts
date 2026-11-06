/**
 * /api/embeddings/index — status, pending texts, store and related-content for
 * the omniverse embeddings table (migration 019).
 *
 * The client computes vectors on-device (MiniLM via transformers.js) and posts
 * them here; the server never runs a model.
 */
import { z } from 'zod'
import {
  EMBEDDING_KINDS,
  findRelatedEmbeddings,
  getEmbeddingStatus,
  getPendingEmbeddingTexts,
  upsertEmbeddings,
  type EmbeddingKind,
} from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

/** GET /api/embeddings/index — per-kind coverage + model info. */
export const GET = withRoute(async () => {
  return Response.json({ ok: true, ...getEmbeddingStatus() })
})

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('pending'),
    kinds: z
      .array(z.enum(EMBEDDING_KINDS as unknown as [EmbeddingKind, ...EmbeddingKind[]]))
      .optional(),
    limit: z.number().int().min(1).max(400).optional().default(120),
  }),
  z.object({
    action: z.literal('store'),
    items: z
      .array(
        z.object({
          kind: z.enum(EMBEDDING_KINDS as unknown as [EmbeddingKind, ...EmbeddingKind[]]),
          refId: z.number().int().positive(),
          vector: z.array(z.number()).min(16).max(4096),
        }),
      )
      .min(1)
      .max(200),
  }),
  z.object({
    action: z.literal('related'),
    kind: z.enum(EMBEDDING_KINDS as unknown as [EmbeddingKind, ...EmbeddingKind[]]),
    refId: z.number().int().positive(),
    topK: z.number().int().min(1).max(20).optional().default(6),
  }),
])

/** POST /api/embeddings/index — { action: 'pending' | 'store' | 'related', … } */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, actionSchema)

  if (body.action === 'pending') {
    const texts = getPendingEmbeddingTexts(body.kinds ?? [...EMBEDDING_KINDS], body.limit)
    return Response.json({ ok: true, items: texts })
  }

  if (body.action === 'store') {
    const written = upsertEmbeddings(body.items)
    return Response.json({ ok: true, written })
  }

  const related = findRelatedEmbeddings(body.kind, body.refId, body.topK)
  return Response.json({ ok: true, ...related })
})
