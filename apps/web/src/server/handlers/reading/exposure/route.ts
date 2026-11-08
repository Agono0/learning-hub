/**
 * /api/reading/exposure — Ambient Exposure Ledger & Lexical Coverage:
 * Ingests naturally encountered tokens from reading, notes, and lessons.
 * Computes Krashen i+1 lexical coverage (Nation 2001) and flags words meeting
 * the spaced encounter promotion threshold for 1-click card conversion.
 */
import { z } from 'zod'
import {
  cards,
  db,
  decks,
  getKnownTokensSet,
  getWordExposureSummaries,
  recordExposure,
  recordExposureBatch,
} from '@learning-hub/db'
import { computeLexicalCoverage, tokenizeText } from '@learning-hub/core/exposure'
import { readJson, withRoute } from '@/lib/api'

const getQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  analyzeText: z.string().optional(),
})

const postBodySchema = z.object({
  action: z.enum(['record', 'record_batch', 'promote']),
  token: z.string().trim().optional(),
  tokens: z.array(z.string().trim()).optional(),
  sourceType: z.enum(['reading', 'note', 'lesson']).default('reading'),
  sourceId: z.number().int().positive().optional(),
  contextSnippet: z.string().max(500).optional(),
  // For 'promote' action
  deckId: z.number().int().positive().optional(),
  back: z.string().optional(),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const parsed = getQuerySchema.safeParse({
    limit: url.searchParams.get('limit') || undefined,
    analyzeText: url.searchParams.get('analyzeText') || undefined,
  })

  if (!parsed.success) {
    return Response.json(
      { error: 'invalid query params', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { limit, analyzeText } = parsed.data
  const words = getWordExposureSummaries(limit)

  let coverageAnalysis = null
  if (analyzeText) {
    const known = getKnownTokensSet()
    const tokens = tokenizeText(analyzeText)
    coverageAnalysis = computeLexicalCoverage(tokens, known)
  }

  return Response.json({
    ok: true,
    words,
    coverageAnalysis,
  })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, postBodySchema)

  if (body.action === 'record') {
    if (!body.token) {
      return Response.json({ error: 'token required for record' }, { status: 400 })
    }
    const event = recordExposure({
      token: body.token,
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      contextSnippet: body.contextSnippet,
    })
    return Response.json({ ok: true, action: 'record', event })
  }

  if (body.action === 'record_batch') {
    if (!body.tokens || body.tokens.length === 0) {
      return Response.json({ error: 'tokens array required for record_batch' }, { status: 400 })
    }
    const inserted = recordExposureBatch(body.tokens, {
      sourceType: body.sourceType,
      sourceId: body.sourceId,
      contextSnippet: body.contextSnippet,
    })
    return Response.json({ ok: true, action: 'record_batch', insertedCount: inserted })
  }

  if (body.action === 'promote') {
    if (!body.token) {
      return Response.json({ error: 'token required for promote' }, { status: 400 })
    }

    let targetDeckId = body.deckId
    if (!targetDeckId) {
      const [firstDeck] = await db.select({ id: decks.id }).from(decks).limit(1)
      if (!firstDeck) {
        const [newDeck] = await db
          .insert(decks)
          .values({ name: 'Vocabulary' })
          .returning({ id: decks.id })
        targetDeckId = newDeck.id
      } else {
        targetDeckId = firstDeck.id
      }
    }

    const front = body.token
    const back = body.back || body.contextSnippet || 'Context from reading'
    const nowIso = new Date().toISOString()

    const [card] = await db
      .insert(cards)
      .values({
        deckId: targetDeckId!,
        type: 'basic',
        content: { basic: { front, back } },
        tags: ['ambient-promoted', 'vocabulary'],
        due: nowIso,
      })
      .returning()

    return Response.json({ ok: true, action: 'promote', card }, { status: 201 })
  }

  return Response.json({ error: 'unsupported action' }, { status: 400 })
})
