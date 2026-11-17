/**
 * /api/cognitive/tmr — Rasch & Born sleep memory consolidation & TMR cue planner,
 * fed by REAL FSRS card state.
 *
 * GET  → Rank the learner's actual cards by consolidation fragility (low FSRS
 *        stability, high difficulty, due soonest), derive deterministic tonal
 *        signatures, and return tonight's default plan (23:00 → 07:00, neutral
 *        chronotype) plus the candidate list. No samples: an empty deck returns
 *        an honest empty plan.
 * POST → Generate a personalized plan from an explicit sleep profile (bedtime,
 *        wake, chronotype, sleep debt, acoustic ceiling) — optionally over the
 *        learner's own vulnerable cards (omit `cards` to auto-select).
 */
import { z } from 'zod'
import { asc, eq } from 'drizzle-orm'
import {
  buildTonightPlan,
  clockTimeSchema,
  deriveBaseFrequency,
  deriveHarmonicType,
  fragilityScore,
  generateSleepConsolidationPlan,
  sleepProfileSchema,
  toConsolidationCandidates,
  type ConsolidationCandidate,
  type TonightPlan,
} from '@learning-hub/core'
import { db } from '@/lib/db'
import { cards } from '@learning-hub/db'
import { readJson, withRoute } from '@/lib/api'

const consolidationCandidateInputSchema = z.object({
  cardId: z.number().int().positive(),
  stability: z.number().min(0).default(1),
  difficulty: z.number().min(0).max(10).default(5),
  due: z.string().optional(),
  baseFrequency: z.number().min(100).max(2000).optional(),
  harmonicType: z.enum(['major_triad', 'perfect_fifth', 'octave_bloom', 'subharmonic']).optional(),
  title: z.string().max(120).optional(),
})

const tonightPlanInputSchema = sleepProfileSchema.extend({
  /** Times default to the standard 23:00 → 07:00 planning window */
  bedtime: clockTimeSchema.optional().default('23:00'),
  wakeTime: clockTimeSchema.optional().default('07:00'),
  /** Explicit candidates; when omitted the handler picks real FSRS candidates */
  cards: z.array(consolidationCandidateInputSchema).optional(),
  /** Max cues per SWS block (habituation guard) */
  maxCuesPerBlock: z.number().int().min(1).max(30).default(10),
})

/** Default planning window used when the caller has not set a schedule. */
export const DEFAULT_SLEEP_PROFILE = {
  bedtime: '23:00',
  wakeTime: '07:00',
  chronotype: 0,
  sleepDebtHours: 0,
  personalNeedHours: 8,
  maxAcousticDba: 35,
} as const

/**
 * Selects the learner's most TMR-worthy cards from the real `cards` table:
 * not suspended, past the new-card stage (state ≥ 2, i.e. review state),
 * ranked by consolidation fragility. Returns planner candidates with derived
 * tonal signatures. Pure DB read — no writes (AGENTS.md rule 7).
 */
export function selectVulnerableCandidates(limit = 12): ConsolidationCandidate[] {
  const rows = db
    .select({
      id: cards.id,
      stability: cards.stability,
      difficulty: cards.difficulty,
      due: cards.due,
      state: cards.state,
      suspended: cards.suspended,
    })
    .from(cards)
    .where(eq(cards.suspended, false))
    .orderBy(asc(cards.stability))
    .limit(300)
    .all()

  const usable = rows.filter((r) => !r.suspended && r.state >= 2 && r.stability > 0)
  const candidates = toConsolidationCandidates(
    usable.map((r) => ({ id: r.id, stability: r.stability, difficulty: r.difficulty, due: r.due })),
  )
  return candidates.sort((a, b) => fragilityScore(b) - fragilityScore(a)).slice(0, limit)
}

/** GET /api/cognitive/tmr — vulnerable FSRS candidates + tonight's default plan. */
export const GET = withRoute(async () => {
  const candidates = selectVulnerableCandidates(12)
  const plan: TonightPlan = buildTonightPlan({ ...DEFAULT_SLEEP_PROFILE }, candidates)
  // Legacy contract (plan.swsWindows / forecastedRetentionGain) stays present
  // for existing consumers, now derived from the real hypnogram.
  return Response.json({
    ok: true,
    plan: {
      sleepDurationHours: Number((plan.hypnogram.totalOpportunityMinutes / 60).toFixed(1)),
      swsWindows: plan.swsBlocks.map((b) => ({
        cycleIndex: b.cycleIndex,
        startMinute: b.startMinute,
        endMinute: b.endMinute,
        description: `Cycle ${b.cycleIndex} slow-wave block (delta weight ${b.deltaWeight})`,
      })),
      cues: plan.cues.map((c) => ({
        cardId: c.cardId,
        playbackOffsetSeconds: Math.round(c.offsetMinutes * 60),
        cycleIndex: c.cycleIndex,
        baseFrequency: c.baseFrequency,
        harmonicType: c.harmonicType,
      })),
      forecastedRetentionGain: Number(Math.min(0.28, plan.meanPredictedBoostPct / 100).toFixed(3)),
      targetAcousticDba: plan.safety.maxAcousticDba,
      advisory: plan.advisory,
    },
    tonight: plan,
    candidates: candidates.map((c) => ({ ...c, fragility: fragilityScore(c) })),
    sampleSize: candidates.length,
  })
})

/** POST /api/cognitive/tmr — plan an explicit or auto-selected night. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, tonightPlanInputSchema)
  const { cards: explicit, maxCuesPerBlock, ...profile } = body

  const candidates: ConsolidationCandidate[] = explicit
    ? explicit.map((c) => ({
        cardId: c.cardId,
        stability: c.stability,
        difficulty: c.difficulty,
        due: c.due,
        baseFrequency: c.baseFrequency ?? deriveBaseFrequency(c.cardId),
        harmonicType: c.harmonicType ?? deriveHarmonicType(c.cardId),
        title: c.title,
      }))
    : selectVulnerableCandidates(12)

  const plan = buildTonightPlan(profile, candidates, {
    maxCuesPerBlock,
    minSpacingSeconds: 28,
    maxReplaysPerCard: 4,
  })

  return Response.json({ ok: true, plan, candidateCount: candidates.length })
})

// Keep the legacy duration-based generator exported for parity consumers that
// only need a simple schedule (CLI scripts, older integrations).
export const legacyDurationPlan = generateSleepConsolidationPlan
