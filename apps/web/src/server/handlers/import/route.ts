/**
 * /api/import — create a deck + its cards from an Anki export or our JSON.
 *
 * Body: { kind: 'apkg' | 'txt' | 'json', payload: string, deckName?: string }
 * - 'apkg': base64-encoded .apkg (ZIP + legacy SQLite). Capped at 50MB of base64.
 * - 'txt':  Anki plain-text export (TSV with #separator/#html headers).
 * - 'json': our own deck JSON schema (from /api/export?format=json).
 *
 * Always creates a NEW deck (name gets an "(import N)" suffix on collision) and
 * its cards; invalid card contents are skipped and reported, never half-inserted.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, cards, decks, withTransaction } from '@learning-hub/db'
import {
  parseAnkiTxt,
  parseHubDeckJson,
  validateCardContent,
  type CardContent,
  type CardFormat,
} from '@learning-hub/core'
import { ApiError, readJson, withRoute } from '@/lib/api'

/** The .apkg payload is base64 — capped at 50MB per the import contract. */
const MAX_APKG_BASE64_CHARS = 50 * 1024 * 1024
/** JSON body cap for this route: the base64 payload plus a little for the other fields. */
const MAX_IMPORT_BODY_BYTES = MAX_APKG_BASE64_CHARS + 64 * 1024
/** Plain-text/JSON payloads — 10MB is far beyond any real text export. */
const MAX_TEXT_CHARS = 10 * 1024 * 1024
/** Cards per bulk INSERT (stays far below SQLite's bound-parameter limit). */
const INSERT_CHUNK = 50

const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/

const importSchema = z.object({
  kind: z.enum(['apkg', 'txt', 'json']),
  payload: z.string().min(1, 'payload required'),
  deckName: z.string().trim().min(1).max(200).optional(),
})

/** Normalized card ready for insertion (validated). */
interface ImportableCard {
  type: CardFormat
  content: CardContent
  tags: string[]
}

interface ParsedImport {
  name: string
  cards: { type: CardFormat; content: CardContent; tags: string[] }[]
  skippedModels: string[]
  source: string
}

/** Decode + parse the payload into a ParsedImport (throws ApiError on bad input). */
async function parsePayload(kind: 'apkg' | 'txt' | 'json', payload: string): Promise<ParsedImport> {
  if (kind === 'apkg') {
    if (payload.length > MAX_APKG_BASE64_CHARS) {
      throw new ApiError(413, 'apkg payload exceeds the 50MB base64 limit')
    }
    const clean = payload.trim()
    if (!BASE64_RE.test(clean)) throw new ApiError(400, 'apkg payload must be a base64 string')
    const bytes = Buffer.from(clean, 'base64')
    if (bytes.length === 0) throw new ApiError(400, 'apkg payload decodes to empty bytes')
    try {
      // Lazy module boundary: @learning-hub/core/anki statically imports
      // better-sqlite3, so parseApkg must stay out of the route's static graph.
      const { parseApkg } = await import('@learning-hub/core/anki')
      const deck = await parseApkg(bytes)
      return {
        name: deck.name,
        skippedModels: deck.skippedModels,
        source: 'anki-import',
        cards: deck.cards.map((c) => ({ type: c.format, content: c.content, tags: c.tags })),
      }
    } catch (err) {
      throw new ApiError(400, err instanceof Error ? err.message : 'could not parse .apkg file')
    }
  }

  if (payload.length > MAX_TEXT_CHARS) {
    throw new ApiError(413, `${kind} payload exceeds the 10MB limit`)
  }
  if (kind === 'txt') {
    const deck = parseAnkiTxt(payload)
    return {
      name: deck.name,
      skippedModels: deck.skippedModels,
      source: 'anki-import',
      cards: deck.cards.map((c) => ({ type: c.format, content: c.content, tags: c.tags })),
    }
  }
  try {
    const deck = parseHubDeckJson(payload)
    return { name: deck.name, skippedModels: [], source: 'json-import', cards: deck.cards }
  } catch (err) {
    throw new ApiError(400, err instanceof Error ? err.message : 'invalid deck JSON')
  }
}

/** First unused "name", appending "(import 2)", "(import 3)"… on collisions. */
async function uniqueDeckName(base: string): Promise<string> {
  let candidate = base
  for (let n = 2; ; n++) {
    const [existing] = await db
      .select({ id: decks.id })
      .from(decks)
      .where(eq(decks.name, candidate))
      .limit(1)
    if (!existing) return candidate
    candidate = `${base} (import ${n})`
  }
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, importSchema, { maxBytes: MAX_IMPORT_BODY_BYTES })
  const parsed = await parsePayload(body.kind, body.payload)

  // Per-format content validation — invalid rows are skipped, not inserted.
  const valid: ImportableCard[] = []
  let rejectedCards = 0
  for (const card of parsed.cards) {
    const validated = validateCardContent(card.type, card.content)
    if (!validated.ok) {
      rejectedCards++
      continue
    }
    valid.push({ type: card.type, content: validated.data, tags: card.tags })
  }

  const deckName = await uniqueDeckName(body.deckName ?? parsed.name)
  const due = new Date().toISOString()

  const result = withTransaction((tx) => {
    // sync better-sqlite3 driver: returning() needs an explicit .all() inside transactions
    const [deck] = tx
      .insert(decks)
      .values({
        name: deckName,
        emoji: '📥',
        description: `Imported (${body.kind}) on ${due.slice(0, 10)}`,
      })
      .returning({ id: decks.id })
      .all()
    for (let i = 0; i < valid.length; i += INSERT_CHUNK) {
      tx.insert(cards)
        .values(
          valid.slice(i, i + INSERT_CHUNK).map((c) => ({
            deckId: deck!.id,
            type: c.type,
            content: c.content,
            tags: c.tags,
            source: parsed.source,
            due,
          })),
        )
        .run()
    }
    return deck!.id
  })

  return Response.json(
    {
      ok: true,
      deckId: result,
      deckName,
      imported: valid.length,
      rejectedCards,
      skippedModels: parsed.skippedModels,
    },
    { status: 201 },
  )
})
