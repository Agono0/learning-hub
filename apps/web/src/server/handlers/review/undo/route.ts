/**
 * /api/review/undo — restore a card row to its PRE-review state (the client
 * posts back the `preReview` snapshot returned by POST /api/review).
 *
 * The snapshot is fully zod-validated (it used to be trusted blindly, which let
 * arbitrary JSON corrupt the FSRS schedule). The restore itself is atomic via
 * withTransaction: the card row is written back AND the revlog row created by
 * the review being undone (the card's latest revlog whose pre-review `state`
 * matches the snapshot) is deleted.
 *
 * XP events stay append-only: undo does NOT remove the XP earned.
 */
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { cards, revlog, withTransaction, CardNotFoundError } from '@learning-hub/db'
import { ApiError, readJson, withRoute } from '@/lib/api'

/** ISO-8601 timestamp as produced by Date.toISOString() (any parseable ISO is accepted). */
const isoTimestamp = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'must be an ISO date string')

const preReviewSchema = z.object({
  id: z.number().int().positive(),
  due: isoTimestamp,
  stability: z.number().min(0),
  difficulty: z.number().min(0).max(10),
  elapsedDays: z.number().int().min(0),
  scheduledDays: z.number().int(),
  reps: z.number().int().min(0),
  lapses: z.number().int().min(0),
  state: z.number().int().min(0).max(3),
  lastReview: isoTimestamp.nullable(),
  learningStep: z.number().int().min(0),
})

const undoBodySchema = z.object({
  cardId: z.number().int().positive(),
  preReview: preReviewSchema,
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, undoBodySchema)
  const snap = body.preReview
  if (snap.id !== body.cardId) {
    throw new ApiError(400, 'preReview.id must match cardId')
  }

  // Atomic undo: card restore + removal of the review's revlog row.
  const { card, revlogDeleted } = withTransaction((tx) => {
    const existing = tx.select().from(cards).where(eq(cards.id, body.cardId)).limit(1).get()
    if (!existing) throw new CardNotFoundError(body.cardId)

    tx.update(cards)
      .set({
        due: snap.due,
        stability: snap.stability,
        difficulty: snap.difficulty,
        elapsedDays: snap.elapsedDays,
        scheduledDays: snap.scheduledDays,
        reps: snap.reps,
        lapses: snap.lapses,
        state: snap.state,
        lastReview: snap.lastReview,
        learningStep: snap.learningStep,
      })
      .where(eq(cards.id, body.cardId))
      .run()

    // revlog.state is the state BEFORE the review (Anki spec) — the snapshot's
    // state therefore identifies the revlog row created by the undone review.
    const latestMatching = tx
      .select()
      .from(revlog)
      .where(and(eq(revlog.cardId, body.cardId), eq(revlog.state, snap.state)))
      .orderBy(desc(revlog.id))
      .limit(1)
      .get()

    if (latestMatching) {
      tx.delete(revlog).where(eq(revlog.id, latestMatching.id)).run()
    }

    const restored = tx.select().from(cards).where(eq(cards.id, body.cardId)).limit(1).get()
    return { card: restored!, revlogDeleted: Boolean(latestMatching) }
  })

  return Response.json({ ok: true, card, revlogDeleted })
})
