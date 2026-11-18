/**
 * Runtime-neutral API handler for the Prototype & Exemplar Categorization Studio
 *
 * Grounded in:
 * - Rosch (1975) typicality norms & family resemblance (Rosch & Mervis 1975)
 * - Posner & Keele (1968, 1970) prototype abstraction
 * - Medin & Schaffer (1978) 5-4 structure & exemplar theory
 * - Nosofsky (1986) Generalized Context Model with attention fitting
 * - Ashby & Gott (1988) rule-based decision bounds
 * - Landauer & Bjork (1978) expanding retrieval + Kang (2016) interleaving
 *   (the multi-day study schedule)
 *
 * Actions (zod-discriminated):
 * - `evaluate`: full session telemetry (TSC/CTS/MCD/CRI + model comparison)
 * - `plan`: the most model-diagnostic trial sequence for a category set;
 *   with session history attached it ALSO returns the multi-day study
 *   schedule (expanding retrieval on mastered sets, daily frontier block)
 * - `deck`: FSRS-calibrated review cards scaled by the CRI
 * - `saveSession`: appends the completed session to the append-only ledger
 *   (a session is a completed event — no update, no delete, no resume)
 * - `listSessions`: recent ledger rows for the History section
 *
 * GET returns the canonical scenarios plus, when the device has any recorded
 * sessions, the last session and day-bucketed stats for the dashboard widget.
 * On devices without a reachable database the history degrades to `null` —
 * the scenarios never disappear (manual-mode guarantee, rule 9).
 */

import { z } from 'zod'
import {
  CANONICAL_CATEGORIZATION_SETS,
  categorizationSubmissionSchema,
  evaluateCategorizationSession,
  findCategorySet,
  generateCategorizationDeck,
  planCategorizationStudy,
  planDiscriminatingBlock,
  studyPlanOptionsSchema,
  studyPlanSessionSchema,
  type CategorizationEvaluation,
  type StudyPlan,
} from '@learning-hub/core'
import {
  countSessions,
  getLastSession,
  listSessions,
  saveSession,
  statsByDay,
} from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const postPrototypeExemplarBodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('evaluate'),
    submission: categorizationSubmissionSchema,
  }),
  z.object({
    action: z.literal('plan'),
    setId: z.string(),
    maxTrials: z.number().int().min(1).max(24).default(6),
    /** Completed-session history; when present the response gains `schedule`. */
    sessions: z.array(studyPlanSessionSchema).max(500).default([]),
    /** Schedule controls (defaults come from the core planner's defaults). */
    scheduleOptions: studyPlanOptionsSchema.omit({ now: true }).partial().default({}),
    /** Planning instant (ISO). Defaults to the handler's clock when absent. */
    now: z.string().optional(),
  }),
  z.object({
    action: z.literal('deck'),
    setId: z.string(),
    criBaseline: z.number().min(0).max(100).default(50),
  }),
  z.object({
    action: z.literal('saveSession'),
    /** The completed round-trip; the engine re-evaluates server-side so the
     * stored metrics are always the engine's own telemetry (never client-claimed). */
    submission: categorizationSubmissionSchema,
  }),
  z.object({
    action: z.literal('listSessions'),
    limit: z.number().int().min(1).max(100).default(10),
  }),
])

export const GET = withRoute(async () => {
  // History is best-effort: devices without an initialized database still get
  // the full scenario catalog (the studio must never depend on persistence).
  let history: {
    lastSession: ReturnType<typeof getLastSession>
    stats: ReturnType<typeof statsByDay>
    totalSessions: number
  } | null = null
  try {
    history = {
      lastSession: getLastSession(),
      stats: statsByDay({ days: 7 }),
      totalSessions: countSessions(),
    }
  } catch {
    history = null
  }
  return Response.json({
    ok: true,
    scenarios: CANONICAL_CATEGORIZATION_SETS,
    lastSession: history?.lastSession ?? null,
    stats: history?.stats ?? [],
    totalSessions: history?.totalSessions ?? 0,
  })
})

export const POST = withRoute(async (req) => {
  const body = await readJson(req, postPrototypeExemplarBodySchema)

  if (body.action === 'evaluate') {
    const set = findCategorySet(body.submission.setId)
    const evaluation = evaluateCategorizationSession(set, body.submission)
    return Response.json({
      ok: true,
      evaluation,
    })
  }

  if (body.action === 'plan') {
    const set = findCategorySet(body.setId)
    const plan = planDiscriminatingBlock(set, body.maxTrials)
    let schedule: StudyPlan | null = null
    if (body.sessions.length > 0) {
      schedule = planCategorizationStudySafe(body.sessions, body.now, body.scheduleOptions)
    }
    return Response.json({
      ok: true,
      plan,
      schedule,
    })
  }

  if (body.action === 'saveSession') {
    const set = findCategorySet(body.submission.setId)
    const evaluation = evaluateCategorizationSession(set, body.submission)
    const session = saveSession({
      setId: set.id,
      submission: body.submission,
      evaluation,
    })
    return Response.json({
      ok: true,
      session,
    })
  }

  if (body.action === 'listSessions') {
    const sessions = listSessions({ limit: body.limit })
    return Response.json({
      ok: true,
      sessions,
      total: countSessions(),
    })
  }

  // action === 'deck' — the deck scales FSRS parameters off the CRI baseline,
  // so a neutral evaluation (empty submission) suffices; only `cri` is used.
  const set = findCategorySet(body.setId)
  const neutralEvaluation: CategorizationEvaluation = evaluateCategorizationSession(set, {
    setId: set.id,
  })
  neutralEvaluation.cri = body.criBaseline
  const deck = generateCategorizationDeck(set, neutralEvaluation)
  return Response.json({
    ok: true,
    deck,
  })
})

/**
 * Plan the schedule without letting a malformed history kill the whole
 * response: the discriminating-trial plan still returns, the schedule degrades
 * to null with the validation error logged. (The zod error messages are safe
 * to surface — they are schema diagnostics, not secrets.)
 */
function planCategorizationStudySafe(
  sessions: z.infer<typeof studyPlanSessionSchema>[],
  now: string | undefined,
  options: Partial<Omit<z.infer<typeof studyPlanOptionsSchema>, 'now'>>,
): StudyPlan | null {
  try {
    return planCategorizationStudy(sessions, {
      ...options,
      now: now ?? new Date().toISOString(),
    })
  } catch (err) {
    console.error('[prototype-exemplar] schedule planning failed:', err)
    return null
  }
}
