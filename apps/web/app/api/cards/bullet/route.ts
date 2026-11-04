/**
 * /api/cards/bullet — CONTRACT with the notes page (Agent C's UI posts here).
 * Turns a note bullet into a card (RemNote pattern) and links bullet→card.
 *
 * Body: { noteId, bulletId, content, deckId, format? }
 * The card content is derived from the bullet text itself (syncBulletCard:
 * cloze markers → cloze, Q:/A: or :: / | separators → basic), so editing the
 * bullet and re-posting regenerates the card. Response: { ok, card, lint }.
 */
import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db, cards, noteBullets } from '@learning-hub/db'
import { lintCard, syncBulletCard, validateCardContent, type LintResult } from '@learning-hub/core'
import { readJson, withRoute } from '@/lib/api'

export const runtime = 'nodejs'

const bulletCardSchema = z.object({
  noteId: z.number().int().positive('noteId required'),
  bulletId: z.number().int().positive('bulletId required'),
  deckId: z.number().int().positive('deckId required'),
  content: z.string().trim().min(1, 'content required'),
  format: z.string().optional(), // accepted for contract compatibility; content shape wins
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, bulletCardSchema)

  const [bullet] = await db.select().from(noteBullets).where(eq(noteBullets.id, body.bulletId)).limit(1)
  if (!bullet) return Response.json({ error: 'bullet not found' }, { status: 404 })

  // Derive format+content from the bullet text; the existing card (if any) is
  // regenerated rather than duplicated.
  const derived = syncBulletCard(body.content, 0)
  const type = derived.type
  const validated = validateCardContent(type, derived.content)
  if (!validated.ok) {
    return Response.json({ error: 'invalid derived content', issues: validated.errors }, { status: 400 })
  }

  let card: typeof cards.$inferSelect | undefined
  if (bullet.cardId) {
    ;[card] = await db
      .update(cards)
      .set({ type, content: validated.data })
      .where(eq(cards.id, bullet.cardId))
      .returning()
  }
  if (!card) {
    ;[card] = await db
      .insert(cards)
      .values({
        deckId: body.deckId,
        noteId: body.noteId,
        bulletId: body.bulletId,
        type,
        content: validated.data,
        source: 'note-bullet',
        due: new Date().toISOString(),
      })
      .returning()
  }

  await db
    .update(noteBullets)
    .set({ cardId: card!.id, updatedAt: new Date().toISOString() })
    .where(eq(noteBullets.id, body.bulletId))

  const siblings = await db
    .select()
    .from(cards)
    .where(and(eq(cards.deckId, body.deckId), ne(cards.id, card!.id)))
    .limit(100)
  const lint: LintResult[] = lintCard(
    { id: card!.id, deckId: card!.deckId, type: card!.type, content: card!.content, source: card!.source, tags: card!.tags },
    siblings,
  )

  return Response.json({ ok: true, card, lint }, { status: 201 })
})
