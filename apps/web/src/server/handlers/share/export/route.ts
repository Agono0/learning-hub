/**
 * /api/share/export — Exports a deck or course into an `lh-share/v1` envelope.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { createShareEnvelope, encodeShareString } from '@learning-hub/core/share'
import { cards, db, decks, exportCurriculum } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const exportSchema = z.object({
  type: z.enum(['deck', 'course']),
  id: z.number().int().positive(),
  author: z.string().optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, exportSchema)

  if (body.type === 'deck') {
    const deck = db.select().from(decks).where(eq(decks.id, body.id)).get()
    if (!deck) throw new ApiError(404, 'Deck not found')

    const cardRows = db.select().from(cards).where(eq(cards.deckId, body.id)).all()
    const cardData = cardRows.map((c) => ({
      type: c.type,
      content: c.content,
      tags: c.tags,
    }))

    const envelope = createShareEnvelope({
      type: 'deck',
      title: deck.name,
      itemCount: cardData.length,
      author: body.author,
      description: deck.description ?? undefined,
      data: { cards: cardData },
    })

    const shareString = encodeShareString(envelope)
    return Response.json({ ok: true, envelope, shareString })
  }

  // Course export
  const course = exportCurriculum(body.id)
  if (!course) throw new ApiError(404, 'Course not found')

  const envelope = createShareEnvelope({
    type: 'course',
    title: course.title,
    itemCount: (course.modules ?? []).flatMap((m) => m.lessons ?? []).length,
    author: body.author,
    description: course.description ?? undefined,
    data: { course },
  })

  const shareString = encodeShareString(envelope)
  return Response.json({ ok: true, envelope, shareString })
})
