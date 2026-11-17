/**
 * /api/cognitive/structural-invariance — Rohrer & Taylor (2007) structural invariance engine.
 *
 * GET  → Return the calibrated counter-balanced curriculum demo: interleaved vs blocked
 *        schedules, category contrast matrix, and discrimination telemetry.
 * POST → Compute a practice plan (schedule, metrics, contrast matrix, FSRS deck) for the
 *        calibrated curriculum, optionally scoring learner attempts into a confusion matrix.
 */
import { z } from 'zod'
import {
  CALIBRATED_INVARIANCE_CATEGORIES,
  CALIBRATED_INVARIANCE_PROBLEMS,
  computeCategoryContrastMatrix,
  computeDiscriminationTelemetry,
  computeSequenceMetrics,
  exportFSRSInterleavingDeck,
  generateContrastSchedule,
} from '@learning-hub/core'
import { readJson, readQuery, withRoute } from '@/lib/api'

const planQuerySchema = z.object({
  mode: z.enum(['interleaved', 'blocked']).default('interleaved'),
  contrastWeight: z.coerce.number().min(0).max(1).optional(),
  spacingWeight: z.coerce.number().min(0).max(1).optional(),
})

const attemptSchema = z.object({
  problemId: z.string().min(1),
  trueCategoryId: z.string().min(1),
  chosenCategoryId: z.string().min(1),
  reactionMs: z.number().int().nonnegative().optional(),
})

const planBodySchema = z.object({
  mode: z.enum(['interleaved', 'blocked']).default('interleaved'),
  contrastWeight: z.number().min(0).max(1).optional(),
  spacingWeight: z.number().min(0).max(1).optional(),
  /** Learner attempts recorded client-side; scored into confusion-matrix telemetry. */
  attempts: z.array(attemptSchema).max(1000).optional(),
})

/** Builds the full plan payload for a schedule under the given options. */
function buildPlan(
  mode: 'interleaved' | 'blocked',
  options: { contrastWeight?: number; spacingWeight?: number } = {},
) {
  const scheduleOptions = {
    mode,
    ...(options.contrastWeight !== undefined ? { contrastWeight: options.contrastWeight } : {}),
    ...(options.spacingWeight !== undefined ? { spacingWeight: options.spacingWeight } : {}),
  }
  const { schedule, metrics } = generateContrastSchedule(
    CALIBRATED_INVARIANCE_PROBLEMS,
    CALIBRATED_INVARIANCE_CATEGORIES,
    scheduleOptions,
  )

  return {
    mode,
    schedule: schedule.map((p) => ({
      id: p.id,
      categoryId: p.categoryId,
      title: p.title,
      prompt: p.prompt,
    })),
    metrics,
    contrastMatrix: computeCategoryContrastMatrix(
      CALIBRATED_INVARIANCE_CATEGORIES,
      CALIBRATED_INVARIANCE_PROBLEMS,
    ),
    interleavedMetrics: computeSequenceMetrics(
      generateContrastSchedule(CALIBRATED_INVARIANCE_PROBLEMS, CALIBRATED_INVARIANCE_CATEGORIES, {
        mode: 'interleaved',
      }).schedule,
      CALIBRATED_INVARIANCE_CATEGORIES,
      CALIBRATED_INVARIANCE_PROBLEMS,
    ),
    blockedMetrics: computeSequenceMetrics(
      generateContrastSchedule(CALIBRATED_INVARIANCE_PROBLEMS, CALIBRATED_INVARIANCE_CATEGORIES, {
        mode: 'blocked',
      }).schedule,
      CALIBRATED_INVARIANCE_CATEGORIES,
      CALIBRATED_INVARIANCE_PROBLEMS,
    ),
    deck: exportFSRSInterleavingDeck(
      CALIBRATED_INVARIANCE_PROBLEMS,
      CALIBRATED_INVARIANCE_CATEGORIES,
    ),
  }
}

export const GET = withRoute(async (req: Request) => {
  const q = readQuery(req, planQuerySchema)
  return Response.json({ ok: true, plan: buildPlan(q.mode, q) })
})

export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, planBodySchema)
  const plan = buildPlan(body.mode, body)

  const telemetry =
    body.attempts && body.attempts.length > 0
      ? computeDiscriminationTelemetry(
          body.attempts,
          CALIBRATED_INVARIANCE_CATEGORIES,
          CALIBRATED_INVARIANCE_PROBLEMS,
        )
      : null

  return Response.json({ ok: true, plan, telemetry })
})
