/**
 * /api/cognitive/difficulty-audit — Dunlosky et al. (2013) technique audit
 * over the learner's REAL review telemetry.
 *
 * GET  → Derive the MEASURED behavior stream from revlog for the last 7 days
 *        (retrieval minutes, per-day distribution, deck-interleaving runs) and
 *        return it with the spacing + interleaving audits. The technique mix
 *        is NOT derivable from telemetry — the response says so honestly and
 *        returns the self-report prompt catalog instead of fake minutes.
 * POST → Accepts the self-reported technique minutes (zod-validated) plus the
 *        measured stream (recomputed server-side, never trusted from client),
 *        and returns the full integrated audit: dividend, fluency-illusion
 *        risk, spacing/interleaving verdicts, substitution plan, composite.
 */
import { z } from 'zod'
import {
  auditDesirableDifficulty,
  auditInterleaving,
  auditSpacing,
  measuredBehaviorSchema,
  selfReportedBehaviorSchema,
  SELF_REPORT_PROMPTS,
} from '@learning-hub/core'
import { deriveMeasuredBehavior, AUDIT_WINDOW_DAYS } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const auditInputSchema = selfReportedBehaviorSchema.extend({
  /** Optional timezone offset (minutes) for day bucketing, as elsewhere */
  tzOffset: z.number().int().min(-720).max(840).optional(),
})

/** How many days back the GET audit window looks. */
const WINDOW_DAYS = AUDIT_WINDOW_DAYS

/** GET /api/cognitive/difficulty-audit — real telemetry audits + prompt catalog. */
export const GET = withRoute(async (req: Request) => {
  const url = new URL(req.url)
  const tzOffset = Number(url.searchParams.get('tzOffset') ?? '0')
  const measured = deriveMeasuredBehavior(tzOffset)

  return Response.json({
    ok: true,
    measured,
    spacing: auditSpacing(measured, WINDOW_DAYS),
    interleaving: auditInterleaving(measured),
    // Honest boundary: the technique mix cannot be measured from telemetry.
    techniqueMix: {
      measurable: false,
      note: 'Technique minutes (rereading, highlighting, retrieval…) are invisible to telemetry — log them in the studio for the full audit.',
      prompts: SELF_REPORT_PROMPTS,
    },
    windowDays: WINDOW_DAYS,
  })
})

/** POST /api/cognitive/difficulty-audit — full integrated audit. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, auditInputSchema)
  const { tzOffset, ...selfReported } = body
  // The measured stream is ALWAYS recomputed server-side — clients may not
  // inject flattering telemetry.
  const measured = deriveMeasuredBehavior(tzOffset ?? 0)
  const report = auditDesirableDifficulty(selfReported, measured)
  return Response.json({ ok: true, report, measured })
})

// zod schema passthrough for parity consumers
export const auditSchemas = {
  selfReportedBehaviorSchema,
  measuredBehaviorSchema,
}
