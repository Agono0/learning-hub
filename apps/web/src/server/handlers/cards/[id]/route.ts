/**
 * /api/cards/[id] — edit or delete a single card. Content edits re-run the
 * Wozniak linter and return its results.
 */
import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db, cards } from '@learning-hub/db'
import { lintCard, validateCardContent, type LintResult } from '@learning-hub/core'
import { ApiError, readJson, withRoute } from '@/lib/api'

const CARD_FORMATS = [
  'basic',
  'cloze',
  'mcq',
  'typein',
  'occlusion',
  'proof_step',
  'grammar',
  'matching',
] as const

const patchCardSchema = z.object({
  type: z.enum(CARD_FORMATS).optional(),
  // zod v4 makes z.unknown() keys required — .optional() keeps content omitted-able
  content: z.unknown().optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().nullable().optional(),
  suspended: z.boolean().optional(),
  deckId: z.number().int().positive().optional(),
  buryUntil: z.string().nullable().optional(),
  skillId: z.number().int().positive().nullable().optional(),
})

function parseId(id: string): number {
  const cardId = Number(id)
  if (!Number.isInteger(cardId) || cardId <= 0) throw new ApiError(400, 'invalid id')
  return cardId
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const [card] = await db
    .select()
    .from(cards)
    .where(eq(cards.id, Number(id)))
    .limit(1)
  if (!card) return Response.json({ error: 'not found' }, { status: 404 })
  return Response.json({ card })
}

export const PATCH = withRoute(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const cardId = parseId(id)
  const body = await readJson(req, patchCardSchema)
  const [existing] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1)
  if (!existing) return Response.json({ error: 'not found' }, { status: 404 })

  const nextType = body.type ?? existing.type
  let nextContent = existing.content
  if (body.content !== undefined) {
    const validated = validateCardContent(nextType, body.content)
    if (!validated.ok) {
      return Response.json({ error: 'invalid content', issues: validated.errors }, { status: 400 })
    }
    nextContent = validated.data
  }

  const [card] = await db
    .update(cards)
    .set({
      type: nextType,
      content: nextContent,
      tags: body.tags ?? existing.tags,
      source: body.source !== undefined ? body.source : existing.source,
      suspended: body.suspended ?? existing.suspended,
      deckId: body.deckId ?? existing.deckId,
      buryUntil: body.buryUntil !== undefined ? body.buryUntil : existing.buryUntil,
      skillId: body.skillId !== undefined ? body.skillId : existing.skillId,
    })
    .where(eq(cards.id, cardId))
    .returning()

  // re-lint edited content against same-deck siblings
  const siblings = await db
    .select()
    .from(cards)
    .where(and(eq(cards.deckId, card!.deckId), ne(cards.id, cardId)))
    .limit(100)
  const lint: LintResult[] = lintCard(
    {
      id: card!.id,
      deckId: card!.deckId,
      type: card!.type,
      content: card!.content,
      source: card!.source,
      tags: card!.tags,
    },
    siblings,
  )
  return Response.json({ ok: true, card, lint })
})

export const DELETE = withRoute(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params
  const cardId = parseId(id)
  const [existing] = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1)
  await db.delete(cards).where(eq(cards.id, cardId))
  if (existing) {
    const { computeRecordNaturalKey, recordDeletionTombstone } = await import('@learning-hub/db')
    const nk = computeRecordNaturalKey('cards', {
      deck_id: existing.deckId,
      source_key: existing.sourceKey,
      type: existing.type,
      content: JSON.stringify(existing.content),
    })
    if (nk) recordDeletionTombstone('cards', nk)
  }
  return Response.json({ ok: true })
})
