import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { quotes } from '@learning-hub/db'
import { dailyQuote, dayKey, type QuoteLike } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

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

  const rows = db.select().from(quotes).all()
  const filtered = rows.filter((r) => {
    if (tag && !(r.tags ?? []).includes(tag)) return false
    if (q && !(`${r.text} ${r.author}`.toLowerCase().includes(q))) return false
    return true
  })

  if (mode === 'daily') {
    try {
      const quote = dailyQuote(filtered.length > 0 ? filtered : rows, dayKey(new Date()))
      return NextResponse.json({ quote, date: dayKey(new Date()) })
    } catch {
      return NextResponse.json({ quote: null, date: dayKey(new Date()) })
    }
  }
  if (mode === 'random') {
    if (filtered.length === 0) return NextResponse.json({ quote: null })
    const quote = filtered[Math.floor(Math.random() * filtered.length)]
    return NextResponse.json({ quote })
  }
  return NextResponse.json({ quotes: filtered, total: rows.length })
}

/** POST /api/quotes { text, author, context?, tags? } — add a user quote. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createQuoteSchema)
  const [row] = db
    .insert(quotes)
    .values({
      text: body.text,
      author: body.author,
      context: body.context?.trim() || null,
      tags: body.tags ?? [],
      isUserAdded: true,
    })
    .returning()
    .all()
  return NextResponse.json({ quote: row }, { status: 201 })
})

/** PATCH /api/quotes { id, favorite } — toggle favorite. */
export const PATCH = withRoute(async (req: Request) => {
  const body = await readJson(req, favoriteQuoteSchema)
  const favorite = body.favorite === true
  const [row] = db.update(quotes).set({ favorite }).where(eq(quotes.id, body.id)).returning().all()
  if (!row) return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
  return NextResponse.json({ quote: row })
})

// re-export type used by pages (keeps the QuoteLike shape aligned with DB rows)
export type QuoteRow = typeof quotes.$inferSelect
export type { QuoteLike }
