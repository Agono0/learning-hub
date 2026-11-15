/**
 * /api/decks/doctor — Deck Doctor diagnostic inspection and mechanical one-click fixes.
 *
 * GET  /api/decks/doctor?deckId= — diagnose a deck (linter findings, leeches, health score).
 * POST /api/decks/doctor — apply mechanical actions atomically in ONE transaction (rule 6).
 * Never touches FSRS, mastery, or XP (rule 7: no grading here).
 */
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { diagnoseDeck, type DoctorCardInput, type DoctorDeckInput } from '@learning-hub/core'
import {
  cards,
  computeRecordNaturalKey,
  db,
  decks,
  recordDeletionTombstone,
  withTransaction,
} from '@learning-hub/db'
import { readJson, readQuery, withRoute } from '@/lib/api'

const QuerySchema = z.object({
  deckId: z.coerce.number().int().positive(),
})

const BodySchema = z.object({
  deckId: z.number().int().positive(),
  actions: z
    .array(
      z.union([
        z.object({
          kind: z.literal('suspend-card'),
          cardId: z.number().int().positive(),
          rule: z.string(),
        }),
        z.object({
          kind: z.literal('delete-card'),
          cardId: z.number().int().positive(),
          rule: z.string(),
        }),
        z.object({
          kind: z.literal('regenerate-cloze'),
          cardId: z.number().int().positive(),
          rule: z.string(),
        }),
        z.object({
          kind: z.literal('rename-deck'),
          deckId: z.number().int().positive(),
          to: z.string().min(1),
          rule: z.string(),
        }),
      ]),
    )
    .min(1),
})

export const GET = withRoute(async (req: Request) => {
  const { deckId } = readQuery(req, QuerySchema)

  const [deck] = await db
    .select({
      id: decks.id,
      name: decks.name,
      description: decks.description,
    })
    .from(decks)
    .where(eq(decks.id, deckId))
    .limit(1)

  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  const rawCards = await db
    .select({
      id: cards.id,
      deckId: cards.deckId,
      type: cards.type,
      content: cards.content,
      source: cards.source,
      tags: cards.tags,
      suspended: cards.suspended,
      lapses: cards.lapses,
      reps: cards.reps,
    })
    .from(cards)
    .where(eq(cards.deckId, deckId))
    .all()

  const doctorCards: DoctorCardInput[] = rawCards.map((c) => ({
    id: c.id,
    deckId: c.deckId,
    type: c.type,
    content: c.content,
    source: c.source,
    tags: c.tags,
    suspended: c.suspended,
    lapses: c.lapses,
    reps: c.reps,
  }))

  const doctorDeck: DoctorDeckInput = {
    id: deck.id,
    name: deck.name,
    description: deck.description,
  }

  const diagnosis = diagnoseDeck({
    deck: doctorDeck,
    cards: doctorCards,
  })

  return Response.json(diagnosis)
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, BodySchema)

  const [deck] = await db.select().from(decks).where(eq(decks.id, body.deckId)).limit(1)

  if (!deck) {
    return Response.json({ error: 'Deck not found' }, { status: 404 })
  }

  const summary = withTransaction((tx) => {
    const results: Array<{ kind: string; targetId: number; status: 'applied' | 'skipped' }> = []

    for (const action of body.actions) {
      if (action.kind === 'suspend-card') {
        const res = tx
          .update(cards)
          .set({ suspended: true })
          .where(and(eq(cards.id, action.cardId), eq(cards.deckId, body.deckId)))
          .run()
        results.push({
          kind: action.kind,
          targetId: action.cardId,
          status: res.changes > 0 ? 'applied' : 'skipped',
        })
      } else if (action.kind === 'delete-card') {
        const [existing] = tx
          .select()
          .from(cards)
          .where(and(eq(cards.id, action.cardId), eq(cards.deckId, body.deckId)))
          .limit(1)
          .all()

        if (existing) {
          tx.delete(cards).where(eq(cards.id, action.cardId)).run()
          const nk = computeRecordNaturalKey('cards', {
            deck_id: existing.deckId,
            source_key: existing.sourceKey,
            type: existing.type,
            content: JSON.stringify(existing.content),
          })
          if (nk) recordDeletionTombstone('cards', nk)
          results.push({ kind: action.kind, targetId: action.cardId, status: 'applied' })
        } else {
          results.push({ kind: action.kind, targetId: action.cardId, status: 'skipped' })
        }
      } else if (action.kind === 'regenerate-cloze') {
        const [existing] = tx
          .select()
          .from(cards)
          .where(and(eq(cards.id, action.cardId), eq(cards.deckId, body.deckId)))
          .limit(1)
          .all()

        if (existing && existing.type === 'basic' && existing.content.basic) {
          const front = existing.content.basic.front.trim()
          const back = existing.content.basic.back.trim()
          tx.update(cards)
            .set({
              type: 'cloze',
              content: {
                cloze: {
                  text: `${front}: {{c1::${back}}}`,
                  answers: [back],
                  mode: 'basic',
                },
              },
            })
            .where(eq(cards.id, action.cardId))
            .run()
          results.push({ kind: action.kind, targetId: action.cardId, status: 'applied' })
        } else {
          results.push({ kind: action.kind, targetId: action.cardId, status: 'skipped' })
        }
      } else if (action.kind === 'rename-deck') {
        const res = tx.update(decks).set({ name: action.to }).where(eq(decks.id, body.deckId)).run()
        results.push({
          kind: action.kind,
          targetId: body.deckId,
          status: res.changes > 0 ? 'applied' : 'skipped',
        })
      }
    }

    return results
  })

  return Response.json({
    ok: true,
    deckId: body.deckId,
    appliedCount: summary.filter((s) => s.status === 'applied').length,
    summary,
  })
})
