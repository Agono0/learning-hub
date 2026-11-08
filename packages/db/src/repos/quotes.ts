/**
 * Quotes repository — motivational quotes (seeded or user-added) with historical context,
 * daily deterministic selection (Ryan & Deci's SDT autonomy/motivation), and favorites.
 */
import { desc, eq } from 'drizzle-orm'
import { dailyQuote, dayKey, type QuoteLike } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { quotes } from '../schema'

export type QuoteRow = typeof quotes.$inferSelect
export type { QuoteLike }

export interface CreateQuoteInput {
  text: string
  author: string
  context?: string | null
  tags?: string[]
  isUserAdded?: boolean
  favorite?: boolean
  createdAt?: string
}

export interface PatchQuoteInput {
  favorite?: boolean
  text?: string
  author?: string
  context?: string | null
  tags?: string[]
}

/**
 * List quotes with optional tag and text search filtering.
 */
export function listQuotes(
  opts: {
    tag?: string | null
    search?: string | null
    limit?: number
    db?: LearningHubDB
  } = {},
): { quotes: QuoteRow[]; total: number } {
  const db = opts.db ?? getDb()
  const rows = db.select().from(quotes).orderBy(desc(quotes.createdAt)).all()

  const tag = opts.tag?.trim()
  const q = opts.search?.toLowerCase().trim()

  const filtered = rows.filter((r) => {
    if (tag && !(r.tags ?? []).includes(tag)) return false
    if (q && !`${r.text} ${r.author}`.toLowerCase().includes(q)) return false
    return true
  })

  if (opts.limit && opts.limit > 0) {
    return { quotes: filtered.slice(0, opts.limit), total: rows.length }
  }

  return { quotes: filtered, total: rows.length }
}

/**
 * Get a single quote by id.
 */
export function getQuote(id: number, opts: { db?: LearningHubDB } = {}): QuoteRow | null {
  const db = opts.db ?? getDb()
  const [row] = db.select().from(quotes).where(eq(quotes.id, id)).limit(1).all()
  return row ?? null
}

/**
 * Select a deterministic daily quote based on the client date.
 */
export function getDailyQuote(
  opts: {
    date?: string
    tag?: string | null
    search?: string | null
    db?: LearningHubDB
  } = {},
): { quote: QuoteRow | null; date: string } {
  const db = opts.db ?? getDb()
  const date = opts.date ?? dayKey(new Date())
  const { quotes: filtered, total } = listQuotes({
    tag: opts.tag,
    search: opts.search,
    db,
  })

  const allRows = total > 0 ? (filtered.length > 0 ? filtered : listQuotes({ db }).quotes) : []
  if (allRows.length === 0) return { quote: null, date }

  try {
    const selected = dailyQuote(allRows, date)
    return { quote: (selected as QuoteRow) ?? null, date }
  } catch {
    return { quote: null, date }
  }
}

/**
 * Select a random quote from the library.
 */
export function getRandomQuote(
  opts: {
    tag?: string | null
    search?: string | null
    db?: LearningHubDB
  } = {},
): QuoteRow | null {
  const { quotes: filtered } = listQuotes(opts)
  if (filtered.length === 0) return null
  return filtered[Math.floor(Math.random() * filtered.length)] ?? null
}

/**
 * Create a new quote.
 */
export function createQuote(input: CreateQuoteInput, opts: { db?: LearningHubDB } = {}): QuoteRow {
  const db = opts.db ?? getDb()
  const [created] = db
    .insert(quotes)
    .values({
      text: input.text.trim(),
      author: input.author.trim(),
      context: input.context?.trim() || null,
      tags: input.tags ?? [],
      isUserAdded: input.isUserAdded ?? true,
      favorite: input.favorite ?? false,
      createdAt: input.createdAt ?? new Date().toISOString(),
    })
    .returning()
    .all()

  return created!
}

/**
 * Update an existing quote (toggle favorite, edit text/tags).
 */
export function updateQuote(
  id: number,
  patch: PatchQuoteInput,
  opts: { db?: LearningHubDB } = {},
): QuoteRow | null {
  const db = opts.db ?? getDb()
  const values: Partial<typeof quotes.$inferInsert> = {}

  if (patch.favorite !== undefined) values.favorite = patch.favorite
  if (patch.text !== undefined) values.text = patch.text.trim()
  if (patch.author !== undefined) values.author = patch.author.trim()
  if (patch.context !== undefined) values.context = patch.context?.trim() || null
  if (patch.tags !== undefined) values.tags = patch.tags

  const [updated] = db.update(quotes).set(values).where(eq(quotes.id, id)).returning().all()
  return updated ?? null
}

/**
 * Delete a quote by id.
 */
export function deleteQuote(id: number, opts: { db?: LearningHubDB } = {}): boolean {
  const db = opts.db ?? getDb()
  const res = db.delete(quotes).where(eq(quotes.id, id)).run()
  return (res.changes ?? 0) > 0
}
