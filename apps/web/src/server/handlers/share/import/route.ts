/**
 * /api/share/import — Imports a deck or course from an `lh-share/v1` envelope or base64 string.
 *
 * Share strings come from other people, so their payload is validated exactly
 * like first-party input: every card through validateCardContent, and courses
 * through the LHCF parser (parseCurriculum). Any invalid item rejects the whole
 * import with 422 and path-addressed errors — nothing is half-imported.
 */
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  decodeShareString,
  shareEnvelopeSchema,
  type ShareEnvelope,
} from '@learning-hub/core/share'
import { isCardFormat, validateCardContent } from '@learning-hub/core'
import { parseCurriculum } from '@learning-hub/core/curriculum'
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
    const rawCards: unknown[] = Array.isArray(envelope.data.cards) ? envelope.data.cards : []
    const validCards: Array<{ type: CardFormat; content: CardContent; tags: string[] }> = []
    const errors: Array<{ path: string; message: string }> = []
    rawCards.forEach((raw, i) => {
      const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
      if (!isCardFormat(c.type)) {
        errors.push({ path: `cards.${i}.type`, message: `unknown card type: ${String(c.type)}` })
        return
      }
      const checked = validateCardContent(c.type, c.content)
      if (!checked.ok) {
        for (const message of checked.errors) errors.push({ path: `cards.${i}.content`, message })
        return
      }
      const tags = Array.isArray(c.tags)
        ? c.tags.filter((t): t is string => typeof t === 'string').slice(0, 50)
        : []
      validCards.push({ type: c.type, content: checked.data as CardContent, tags })
    })
    if (errors.length > 0) {
      return Response.json({ ok: false, error: 'Invalid cards in share', errors }, { status: 422 })
    }

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
      for (const c of validCards) {
        tx.insert(cards)
          .values({
            deckId: targetDeckId,
            type: c.type,
            content: c.content,
            tags: c.tags,
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
  const rawCourse: unknown = envelope.data.course
  if (!rawCourse || typeof rawCourse !== 'object') {
    throw new ApiError(400, 'Invalid course data in envelope')
  }
  const parsed = parseCurriculum(JSON.stringify(rawCourse), { format: 'json' })
  if (!parsed.ok) {
    return Response.json(
      { ok: false, error: 'Invalid course in share', errors: parsed.errors },
      { status: 422 },
    )
  }

  const report = importCurriculum(parsed.course)
  return Response.json({
    ok: true,
    type: 'course',
    courseId: report.courseId,
    importedCount: report.lessons.added + report.lessons.updated,
  })
})
