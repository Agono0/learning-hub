/**
 * /api/share/import — Imports a deck or course from an `lh-share/v1` envelope or base64 string.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  decodeShareString,
  shareEnvelopeSchema,
  type ShareEnvelope,
} from '@learning-hub/core/share'
import type { CardContent, CardFormat } from '@learning-hub/core/types'
import { cards, db, decks, importCurriculum, withTransaction } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

const importPayloadSchema = z.object({
  payload: z.union([z.string().min(1), shareEnvelopeSchema]),
  targetDeckId: z.number().int().positive().optional(),
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, importPayloadSchema)

  let envelope: ShareEnvelope
  if (typeof body.payload === 'string') {
    envelope = decodeShareString(body.payload)
  } else {
    envelope = shareEnvelopeSchema.parse(body.payload)
  }

  const nowIso = new Date().toISOString()

  if (envelope.type === 'deck') {
    const rawCards = (envelope.data.cards ?? []) as Array<{
      type: CardFormat
      content: CardContent
      tags?: string[]
    }>

    return withTransaction((tx) => {
      let targetDeckId = body.targetDeckId
      let finalDeckName = envelope.metadata.title
      if (!targetDeckId) {
        let deckName = envelope.metadata.title
        const existing = tx.select().from(decks).where(eq(decks.name, deckName)).get()
        if (existing) {
          deckName = `${deckName} (Imported)`
          const existing2 = tx.select().from(decks).where(eq(decks.name, deckName)).get()
          if (existing2) {
            deckName = `${deckName} ${Date.now()}`
          }
        }
        finalDeckName = deckName

        const [newDeck] = tx
          .insert(decks)
          .values({
            name: deckName,
            description: envelope.metadata.description,
            createdAt: nowIso,
          })
          .returning()
          .all()
        targetDeckId = newDeck!.id
      }

      let count = 0
      for (const c of rawCards) {
        tx.insert(cards)
          .values({
            deckId: targetDeckId,
            type: c.type,
            content: c.content,
            tags: c.tags ?? [],
            due: nowIso,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            reps: 0,
            lapses: 0,
            state: 0,
            learningStep: 0,
            suspended: false,
            createdAt: nowIso,
          })
          .run()
        count++
      }

      return Response.json({
        ok: true,
        type: 'deck',
        deckId: targetDeckId,
        deckName: finalDeckName,
        importedCount: count,
      })
    }, db)
  }

  // Course import
  const rawCourse = envelope.data.course as any
  if (!rawCourse) throw new ApiError(400, 'Invalid course data in envelope')

  const report = importCurriculum(rawCourse)
  return Response.json({
    ok: true,
    type: 'course',
    courseId: report.courseId,
    importedCount: report.lessons.added + report.lessons.updated,
  })
})
