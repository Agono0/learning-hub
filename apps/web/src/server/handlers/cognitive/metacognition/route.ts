/**
 * /api/cognitive/metacognition — Koriat & Bjork metacognitive calibration &
 * fluency-illusion engine, fed by REAL review history.
 *
 * GET  → Derive canonical `TrialMetacognitiveRecord`s from `revlog` (the
 *        per-review confidence persisted by executeReview maps confident →
 *        0.9 / uncertain → 0.35, outcome from the grade), then evaluate with
 *        the engine's gamma / Murphy-Brier profile and surface the crucible
 *        drill list (confident-wrong cards). No samples: an empty history
 *        returns an honest empty profile.
 * POST → Evaluate explicitly supplied JOL trials (manual mode / parity).
 */
import { z } from 'zod'
import { desc, inArray, sql } from 'drizzle-orm'
import {
  evaluateMetacognitiveCalibrationProfile,
  evaluateMetacognitiveProfile,
  judgmentOfLearningSchema,
  toTrialMetacognitiveRecords,
  type RevlogTrialRow,
} from '@learning-hub/core'
import { db } from '@/lib/db'
import { cards, revlog } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const metacognitionInputSchema = z.object({
  trials: z.array(judgmentOfLearningSchema),
})

/** GET /api/cognitive/metacognition — real calibration profile from revlog. */
export const GET = withRoute(async () => {
  const rows: RevlogTrialRow[] = db
    .select({
      cardId: revlog.cardId,
      rating: revlog.rating,
      confidence: revlog.confidence,
      timeMs: revlog.timeMs,
    })
    .from(revlog)
    .where(sql`NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = ${revlog.id})`)
    .orderBy(desc(revlog.id))
    .limit(1000)
    .all()

  const records = toTrialMetacognitiveRecords(rows)
  const profile = evaluateMetacognitiveCalibrationProfile(records)

  // Crucible drill list: cards whose most recent miss was committed with high
  // confidence — the Butterfield-Metcalfe high-value retest targets.
  const lastMissConfidence = new Map<number, 0 | 1>()
  for (const r of rows) {
    if (r.rating < 3 && !lastMissConfidence.has(r.cardId)) {
      lastMissConfidence.set(r.cardId, r.confidence)
    }
  }
  const confidentMissIds = [...lastMissConfidence.entries()]
    .filter(([, conf]) => conf === 1)
    .map(([cardId]) => cardId)
    .slice(0, 10)

  const previewRows =
    confidentMissIds.length > 0
      ? db
          .select({ id: cards.id, type: cards.type, content: cards.content })
          .from(cards)
          .where(inArray(cards.id, confidentMissIds))
          .all()
      : []

  return Response.json({
    ok: true,
    profile,
    crucibleDrillIds: confidentMissIds,
    cruciblePreviews: previewRows,
    sampleSize: records.length,
  })
})

/** POST /api/cognitive/metacognition — evaluate explicit JOL trials. */
export const POST = withRoute(async (req: Request) => {
  const { trials } = await readJson(req, metacognitionInputSchema)
  const report = evaluateMetacognitiveProfile(trials)
  return Response.json({ ok: true, report })
})
