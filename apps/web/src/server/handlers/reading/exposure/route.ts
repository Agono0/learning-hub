/**
 * /api/reading/exposure — Ambient Exposure Ledger & Lexical Coverage:
 * Ingests naturally encountered tokens from reading, notes, and lessons.
 * Computes Krashen i+1 lexical coverage (Nation 2001) and flags words meeting
 * the spaced encounter promotion threshold for 1-click card conversion.
 *
 * GET  ?limit&analyzeText      → word rollups (+ coverage for short texts)
 * POST { action: 'record' }       → one encounter
 * POST { action: 'record_batch' } → up to 500 encounters
 * POST { action: 'analyze', text } → coverage for long texts (no URL length limit)
 * POST { action: 'promote', token } → basic card; 409 if one already exists
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { eventBus } from '@learning-hub/core'
import {
  computeLexicalCoverage,
  exposureBatchSchema,
  exposureEventSchema,
  normalizeExposureToken,
  tokenizeText,
} from '@learning-hub/core/exposure'
import {
  cards,
  db,
  decks,
  findCardFronts,
  getKnownTokensSet,
  getWordExposureSummaries,
  recordExposure,
  recordExposureBatch,
} from '@learning-hub/db'
import { readJson, readQuery, withRoute } from '@/lib/api'

/** Cap analysed text so a pasted book can't stall the request. */
const MAX_ANALYZE_CHARS = 200_000

const getQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  analyzeText: z.string().max(4_000).optional(),
})

const postBodySchema = z.discriminatedUnion('action', [
  exposureEventSchema.extend({ action: z.literal('record') }),
  exposureBatchSchema.extend({ action: z.literal('record_batch') }),
  z.object({ action: z.literal('analyze'), text: z.string().min(1).max(MAX_ANALYZE_CHARS) }),
  z.object({
    action: z.literal('promote'),
    token: z.string().trim().min(1).max(100),
    deckId: z.number().int().positive().optional(),
    back: z.string().trim().max(2_000).optional(),
    contextSnippet: z.string().max(500).optional(),
  }),
])

function analyze(text: string) {
  return computeLexicalCoverage(tokenizeText(text), getKnownTokensSet())
}

export const GET = withRoute(async (req: Request) => {
  const { limit, analyzeText } = readQuery(req, getQuerySchema)
  return Response.json({
    ok: true,
    words: getWordExposureSummaries(limit),
    coverageAnalysis: analyzeText ? analyze(analyzeText) : null,
  })
})

/** The deck promoted words go into: the requested one, else the first, else a new "Vocabulary" deck. */
async function resolveDeckId(requested?: number): Promise<number | null> {
  if (requested) {
    const [deck] = await db
      .select({ id: decks.id })
      .from(decks)
      .where(eq(decks.id, requested))
      .limit(1)
    return deck?.id ?? null
  }
  const [first] = await db.select({ id: decks.id }).from(decks).limit(1)
  if (first) return first.id
  const [created] = await db
    .insert(decks)
    .values({ name: 'Vocabulary' })
    .returning({ id: decks.id })
  return created!.id
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, postBodySchema)

  switch (body.action) {
    case 'record': {
      if (!normalizeExposureToken(body.token)) {
        return Response.json({ error: 'token has no letters or digits' }, { status: 400 })
      }
      const event = recordExposure(body)
      return Response.json({ ok: true, action: 'record', event })
    }

    case 'record_batch': {
      const insertedCount = recordExposureBatch(body.tokens, {
        sourceType: body.sourceType,
        sourceId: body.sourceId,
        contextSnippet: body.contextSnippet,
      })
      return Response.json({ ok: true, action: 'record_batch', insertedCount })
    }

    case 'analyze':
      return Response.json({ ok: true, action: 'analyze', coverageAnalysis: analyze(body.text) })

    case 'promote': {
      const normalized = normalizeExposureToken(body.token)
      if (!normalized) {
        return Response.json({ error: 'token has no letters or digits' }, { status: 400 })
      }
      if (findCardFronts([normalized]).size > 0) {
        return Response.json({ error: 'a card for this word already exists' }, { status: 409 })
      }

      const deckId = await resolveDeckId(body.deckId)
      if (!deckId) return Response.json({ error: 'deck not found' }, { status: 404 })

      const [card] = await db
        .insert(cards)
        .values({
          deckId,
          type: 'basic',
          content: {
            basic: {
              front: body.token,
              back: body.back || body.contextSnippet || 'Context from reading',
            },
          },
          tags: ['ambient-promoted', 'vocabulary'],
          source: 'exposure-ledger',
          due: new Date().toISOString(),
        })
        .returning()

      eventBus.emit('card.created', { deckId, count: 1 })
      return Response.json({ ok: true, action: 'promote', card }, { status: 201 })
    }
  }
})
