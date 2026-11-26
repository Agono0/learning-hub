/**
 * /api/review/undo — restore a card row to its PRE-review state (the client
 * posts back the `preReview` snapshot and optional `revlogId` returned by
 * POST /api/review).
 *
 * Strictly append-only (Hard Rule #8): never runs DELETE FROM revlog; instead
 * records an undo tombstone in `revlog_undos` via `undoCardReview`, which
 * derived views (`v_true_retention`, `v_daily_reviews`), analytics, and the
 * FSRS-6 optimizer automatically exclude.
 */
import { z } from 'zod'
import { undoCardReview, UndoConflictError } from '@learning-hub/db'
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
  revlogId: z.number().int().positive().optional(),
  preReview: preReviewSchema,
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, undoBodySchema)
  if (body.preReview.id !== body.cardId) {
    throw new ApiError(400, 'preReview.id must match cardId')
  }

  let undone: ReturnType<typeof undoCardReview>
  try {
    undone = undoCardReview({
      cardId: body.cardId,
      revlogId: body.revlogId,
      preReview: body.preReview,
    })
  } catch (err) {
    // Stale / replayed / cross-card undo: the card row was not touched.
    if (err instanceof UndoConflictError) throw new ApiError(409, err.message)
    throw err
  }
  const { card, revlogUndone, revlogId } = undone

  return Response.json({
    ok: true,
    card,
    revlogId,
    revlogUndone,
    revlogDeleted: revlogUndone,
  })
})
