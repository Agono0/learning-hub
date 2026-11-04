/**
 * /api/export — download a deck for import elsewhere.
 * GET ?deckId=<id>&format=txt|json
 * - txt:  Anki-importable tab-separated text (cloze syntax restored) — via formatAnkiTxt
 * - json: our own full-fidelity deck JSON — via exportDeckToJSON
 * Both respond with Content-Disposition attachment so browsers download the file.
 */
import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, cards, decks } from '@learning-hub/db'
import { exportDeckToJSON, formatAnkiTxt } from '@learning-hub/core'
import { ApiError, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const querySchema = z.object({
  deckId: z.coerce.number().int().positive('deckId must be a positive integer'),
  format: z.enum(['txt', 'json']).default('txt'),
})

/** Filesystem-safe ASCII name for the Content-Disposition filename. */
function safeFileName(name: string): string {
  const clean = name.replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60)
  return clean || 'deck'
}

export const GET = withRoute(async (req: Request) => {
  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = querySchema.safeParse(params)
  if (!parsed.success) {
    throw new ApiError(400, 'invalid query', parsed.error.issues.map((i) => ({
      path: i.path.map(String).join('.'),
      message: i.message,
    })))
  }
  const { deckId, format } = parsed.data

  const [deck] = await db.select().from(decks).where(eq(decks.id, deckId)).limit(1)
  if (!deck) throw new ApiError(404, 'deck not found')

  const rows = await db
    .select({ type: cards.type, content: cards.content, tags: cards.tags })
    .from(cards)
    .where(eq(cards.deckId, deck.id))
    .orderBy(asc(cards.id))

  const fileBase = safeFileName(deck.name)
  if (format === 'json') {
    return new Response(JSON.stringify(exportDeckToJSON({ name: deck.name, cards: rows }), null, 2), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="${fileBase}.deck.json"`,
        'cache-control': 'no-store',
      },
    })
  }
  return new Response(formatAnkiTxt({ name: deck.name, cards: rows }), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="${fileBase}.anki.txt"`,
      'cache-control': 'no-store',
    },
  })
})
