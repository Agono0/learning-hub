import { z } from 'zod'
import {
  createQuote,
  getDailyQuote,
  getRandomQuote,
  listQuotes,
  updateQuote,
  type QuoteLike,
  type QuoteRow,
} from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const createQuoteSchema = z.object({
  text: z.string().trim().min(3, 'Quote text and author are required.'),
  author: z.string().trim().min(2, 'Quote text and author are required.'),
  context: z.string().optional(),
  tags: z.array(z.string()).max(6).optional(),
})

const favoriteQuoteSchema = z.object({
  id: z.coerce.number().int('id is required'),
  favorite: z.boolean().optional(),
})

/** GET /api/quotes?mode=daily|random|all&tag=learning&q=streak */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('mode') ?? 'daily'
  const tag = url.searchParams.get('tag')
  const q = url.searchParams.get('q')?.toLowerCase()

  if (mode === 'daily') {
    const { quote, date } = getDailyQuote({ tag, search: q })
    return Response.json({ quote, date })
  }
  if (mode === 'random') {
    const quote = getRandomQuote({ tag, search: q })
    return Response.json({ quote })
  }
  const { quotes, total } = listQuotes({ tag, search: q })
  return Response.json({ quotes, total })
}

/** POST /api/quotes { text, author, context?, tags? } — add a user quote. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createQuoteSchema)
  const row = createQuote({
    text: body.text,
    author: body.author,
    context: body.context,
    tags: body.tags,
  })
  return Response.json({ quote: row }, { status: 201 })
})

/** PATCH /api/quotes { id, favorite } — toggle favorite. */
export const PATCH = withRoute(async (req: Request) => {
  const body = await readJson(req, favoriteQuoteSchema)
  const row = updateQuote(body.id, { favorite: body.favorite === true })
  if (!row) return Response.json({ error: 'Quote not found' }, { status: 404 })
  return Response.json({ quote: row })
})

export type { QuoteLike, QuoteRow }
