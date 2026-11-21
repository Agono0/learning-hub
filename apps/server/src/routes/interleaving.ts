/**
 * Learning HUB headless server — INTERLEAVING routes. Split from the former routes.ts
 * monolith (TD-11): same handlers, same zod validation, same Route[] table
 * pattern; composition lives in ./index.ts.
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  CALIBRATED_INVARIANCE_CATEGORIES,
  CALIBRATED_INVARIANCE_PROBLEMS,
  computeCategoryContrastMatrix,
  computeDiscriminationTelemetry,
  computeInterleavingSchedule,
  computeSequenceMetrics,
  exportFSRSInterleavingDeck,
  generateContrastSchedule,
  interleavingItemSchema,
  interleavingScheduleOptionsSchema,
} from '@learning-hub/core'
import { sendJson, readJson, readQuery } from '../http'
import type { Route } from './shared'

const invarianceAttemptSchema = z.object({
  problemId: z.string().min(1),
  trueCategoryId: z.string().min(1),
  chosenCategoryId: z.string().min(1),
  reactionMs: z.coerce.number().int().nonnegative().optional(),
})

const invarianceQuerySchema = z.object({
  mode: z.enum(['interleaved', 'blocked']).default('interleaved'),
  attemptsJson: z.string().max(100_000).optional(),
})

/** POST /cognitive/interleaving/schedule body — candidate items + partial scheduling options (parity with the web handler). */
const interleavingRequestSchema = z.object({
  items: z.array(interleavingItemSchema),
  options: interleavingScheduleOptionsSchema.partial().optional(),
})

/** Parses ?attemptsJson into validated attempts; malformed input scores as no telemetry. */
function parseInvarianceAttempts(
  raw: string | undefined,
): ReturnType<typeof computeDiscriminationTelemetry> | null {
  if (!raw) return null
  try {
    const parsed = invarianceAttemptSchema.array().max(1000).parse(JSON.parse(raw))
    return computeDiscriminationTelemetry(
      parsed,
      CALIBRATED_INVARIANCE_CATEGORIES,
      CALIBRATED_INVARIANCE_PROBLEMS,
    )
  } catch {
    return null
  }
}

/** GET /cognitive/structural-invariance — interleaved practice plan over the calibrated curriculum. */
/** GET /cognitive/structural-invariance — interleaved practice plan over the calibrated curriculum. */
async function getStructuralInvariance(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const q = readQuery(url, invarianceQuerySchema)
  const { schedule, metrics } = generateContrastSchedule(
    CALIBRATED_INVARIANCE_PROBLEMS,
    CALIBRATED_INVARIANCE_CATEGORIES,
    { mode: q.mode },
  )
  sendJson(res, 200, {
    ok: true,
    mode: q.mode,
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
    deck: exportFSRSInterleavingDeck(
      CALIBRATED_INVARIANCE_PROBLEMS,
      CALIBRATED_INVARIANCE_CATEGORIES,
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
    telemetry: parseInvarianceAttempts(q.attemptsJson),
  })
}

/**
 * POST /cognitive/interleaving/schedule — Rohrer & Taylor interleaving practice
 * scheduler & discrimination engine: compute the optimal interleaved sequence for
 * candidate items, with category entropy and reflection prompts.
 */
async function postInterleavingSchedule(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, interleavingRequestSchema)
  const result = computeInterleavingSchedule(body.items, body.options ?? {})
  sendJson(res, 200, { ok: true, result })
}

/** GET /plugins — names + versions of the plugins loaded at boot (core registry). */

/** Route table for this area — concatenated in ./index.ts in the original routes.ts order. */
export const interleavingRoutes: Route[] = [
  {
    method: 'GET',
    path: '/cognitive/structural-invariance',
    summary: 'interleaved structural invariance plan (?mode=interleaved|blocked)',
    handler: getStructuralInvariance,
  },
  {
    method: 'POST',
    path: '/cognitive/interleaving/schedule',
    summary: 'compute optimal interleaved practice schedule for candidate items',
    handler: postInterleavingSchedule,
  },
]
