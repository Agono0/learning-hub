/**
 * /api/cards — browse cards (filters: deck, tags, FSRS state) and create cards
 * with a Wozniak linter pass (lint results come back for the editor panel).
 */
import { and, eq, desc, inArray, sql, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db, cards, withTransaction } from '@learning-hub/db'
import { lintCard, validateCardContent, type LintResult } from '@learning-hub/core'
import { ApiError, readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const CARD_FORMATS = ['basic', 'cloze', 'mcq', 'typein', 'occlusion', 'proof_step', 'grammar', 'matching'] as const

const isoTimestamp = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'must be an ISO date string')

const createCardSchema = z.object({
  deckId: z.number().int().positive('deckId required'),
  type: z.enum(CARD_FORMATS, { message: 'type required' }),
  // zod v4 makes z.unknown() keys required — .optional() keeps content omitted-able
  content: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().nullable().optional(),
  noteId: z.number().int().positive().nullable().optional(),
  bulletId: z.number().int().positive().nullable().optional(),
  skillId: z.number().int().positive().nullable().optional(),
  due: isoTimestamp.optional(), // optional backdating (bulk imports)
})

const bulkCardItemSchema = z.object({
  type: z.enum(CARD_FORMATS).optional(),
  content: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().nullable().optional(),
})

const bulkSchema = z.object({
  deckId: z.number().int().positive('deckId required'),
  items: z.array(bulkCardItemSchema).min(1, 'items required'),
})

export async function GET(req: Request) {
  const url = new URL(req.url)
  const deckId = url.searchParams.get('deckId')
  const tags = url.searchParams.get('tags') // comma-separated; card must contain all
  const state = url.searchParams.get('state') // 0 new | 1 learning | 2 review | 3 relearning
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 200), 500)

  const filters: SQL[] = []
  if (deckId) filters.push(eq(cards.deckId, Number(deckId)))
  if (state !== null && state !== '') filters.push(eq(cards.state, Number(state)))
  let rows = await db
    .select()
    .from(cards)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(cards.createdAt))
    .limit(limit)

  if (tags) {
    const wanted = tags.split(',').map((t) => t.trim()).filter(Boolean)
    rows = rows.filter((row) => wanted.every((t) => row.tags.includes(t)))
  }

  return Response.json({ cards: rows })
}

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, createCardSchema)
  const validated = validateCardContent(body.type, body.content)
  if (!validated.ok) {
    return Response.json({ error: 'invalid content', issues: validated.errors }, { status: 400 })
  }

  const [card] = await db
    .insert(cards)
    .values({
      deckId: body.deckId,
      type: body.type,
      content: validated.data,
      tags: body.tags ?? [],
      source: body.source ?? null,
      noteId: body.noteId ?? null,
      bulletId: body.bulletId ?? null,
      skillId: body.skillId ?? null,
      due: body.due ?? new Date().toISOString(),
    })
    .returning()

  // Wozniak lint against same-deck siblings (informational, never blocks)
  const siblings = await db
    .select()
    .from(cards)
    .where(and(eq(cards.deckId, body.deckId), sql`${cards.id} != ${card!.id}`))
    .limit(100)
  const lint: LintResult[] = lintCard(
    { id: card!.id, deckId: card!.deckId, type: card!.type, content: card!.content, source: card!.source, tags: card!.tags },
    siblings,
  )

  return Response.json({ ok: true, card, lint }, { status: 201 })
})

/** Bulk create (paste import) — POST /api/cards?bulk=1 with { deckId, items: [...] }. */
export const PUT = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  if (url.searchParams.get('bulk') !== '1') {
    throw new ApiError(400, 'unsupported')
  }
  const body = await readJson(req, bulkSchema)
  const created: number[] = []
  const rejected: { index: number; issues: string[] }[] = []
  const due = new Date().toISOString()

  // One atomic paste-import: either every valid item lands or none does.
  withTransaction((tx) => {
    for (let i = 0; i < body.items.length; i++) {
      const item = body.items[i]!
      const validated = validateCardContent(item.type ?? 'basic', item.content)
      if (!validated.ok) {
        rejected.push({ index: i, issues: validated.errors })
        continue
      }
      const [card] = tx
        .insert(cards)
        .values({
          deckId: body.deckId,
          type: item.type ?? 'basic',
          content: validated.data,
          tags: item.tags ?? [],
          source: item.source ?? 'paste',
          due,
        })
        .returning()
        .all()
      created.push(card!.id)
    }
  })

  return Response.json({ ok: true, created: created.length, cardIds: created, rejected }, { status: 201 })
})

/** DELETE /api/cards?ids=1,2,3 — bulk delete used by the browser view. */
export const DELETE = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const ids = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0)
  if (ids.length === 0) throw new ApiError(400, 'ids required')
  await db.delete(cards).where(inArray(cards.id, ids))
  return Response.json({ ok: true, deleted: ids.length })
})
