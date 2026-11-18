/**
 * Categorization Study Planner — sequences prototype/exemplar study over days.
 *
 * Grounded in:
 * - Thomas K. Landauer & Robert A. Bjork (1978) "Optimum Rehearsal Patterns
 *   and Free Recall". Expanding retrieval practice: successive retrievals of
 *   a mastered item are spaced at GROWING intervals (1 → 3 → 7 → 14 days);
 *   expanding schedules beat equal-interval schedules because each successful
 *   retrieval buys a longer retention horizon. The planner anchors refresh
 *   blocks on a mastered category's last session and spaces the next
 *   retrievals along the expanding ladder.
 * - Sean H. K. Kang (2016) "Spaced Repetition Promotes Efficient and Effective
 *   Learning: Policy Implications of Spacing, Retrieval, and Interleaving",
 *   Psychological Science in the Public Interest, 17(2), 65-121. Interleaving
 *   different but related categories (rather than blocking one category per
 *   day) improves inductive generalization; the planner alternates blocks from
 *   different category sets within a day so no two consecutive blocks come
 *   from the same set.
 * - Robert A. Bjork (1994) "Memory and Metamemory Considerations in the
 *   Training of Human Beings". Desirable difficulties: the frontier block
 *   re-runs {@link planDiscriminatingBlock} — the trials where the prototype
 *   and exemplar models disagree — so daily practice stays at the edge of the
 *   learner's ability, and refresh retrieval is TESTED, not re-read
 *   (retrieval-practice effect, Roediger & Karpicke 2006).
 *
 * What the planner computes:
 * 1. Per-set history summary — session count, last practice date, latest
 *    accuracy/CRI, best accuracy, and a mastery flag (enough sessions AND the
 *    latest session's accuracy ≥ the mastery threshold).
 * 2. A frontier category set — the first not-yet-mastered canonical set (the
 *    canonical list order IS the pedagogical sequence: introductory natural
 *    categories → artificial distortions → 5-4 structure → attention probes →
 *    rule boundaries). One frontier block is scheduled every day while the
 *    frontier exists.
 * 3. Expanding refresh blocks for previously-mastered categories, anchored on
 *    their last session, due at +1, +3, +7, +14 days (configurable ladder),
 *    capped at the horizon. Blocks that overflow the daily budget defer to the
 *    next day (deferred — never silently dropped) and note when they fall off
 *    the horizon entirely.
 * 4. Daily interleaving under the block budget (see {@link interleaveBlocks}).
 *
 * Purity: fully deterministic given (sessions, now) — no clock, no randomness,
 * no I/O. The same history always yields the same schedule (unit-testable).
 */

import { z } from 'zod'
import { dayKey } from '../streaks'
import {
  CANONICAL_CATEGORIZATION_SETS,
  findCategorySet,
  planDiscriminatingBlock,
  type DiscriminatingTrialPlan,
} from './prototype-exemplar-engine'

// ── Schemas ──────────────────────────────────────────────────────────────────

/** One completed session (a category set the learner finished evaluating). */
export const studyPlanSessionSchema = z.object({
  setId: z.string().min(1),
  /** ISO timestamp of session completion (the spacing anchor). */
  completedAt: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), 'completedAt must be an ISO timestamp'),
  /** Overall classification accuracy on the session's test items (0-100). */
  accuracy: z.number().min(0).max(100),
  /** Transfer (never-studied) accuracy, 0-100 (falls back to overall accuracy). */
  transferAccuracy: z.number().min(0).max(100),
  /** Typicality Sensitivity Correlation, 0-100. */
  tsc: z.number().min(0).max(100),
  /** Categorical Representation Index, 0-100. */
  cri: z.number().min(0).max(100),
  /** Maturity band reached on the session. */
  maturityBand: z.enum([
    'featural_guesser',
    'typicality_sensate',
    'boundary_tracer',
    'dual_model_theorist',
  ]),
})
export type StudyPlanSession = z.infer<typeof studyPlanSessionSchema>

/** Planner options. Every field has a research-grounded default. */
export const studyPlanOptionsSchema = z.object({
  /** The instant planning starts (day 0 = `dayKey(now)`, UTC). Required — no clock. */
  now: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'now must be an ISO timestamp'),
  /** Days planned ahead (1-30; default 10 ≈ the shortest useful expanding cycle). */
  horizonDays: z.number().int().min(1).max(30).default(10),
  /** Max blocks per day (1-8; default 4 — calm, achievable). */
  dailyBlockBudget: z.number().int().min(1).max(8).default(4),
  /** Trials per refresh (retrieval-practice) block. */
  refreshTrials: z.number().int().min(1).max(6).default(3),
  /** Trials per frontier (discriminating) block. */
  frontierTrials: z.number().int().min(1).max(12).default(6),
  /** Latest-session accuracy (0-100) at or above which a set counts as mastered. */
  masteryAccuracy: z.number().min(0).max(100).default(80),
  /** Completed sessions required before a set can be mastered. */
  minSessionsForMastery: z.number().int().min(1).max(10).default(2),
  /** Expanding retrieval ladder in days after the anchor session (Landauer & Bjork 1978). */
  expandingIntervals: z.array(z.number().int().min(1).max(365)).min(1).default([1, 3, 7, 14]),
})
export type StudyPlanOptions = z.infer<typeof studyPlanOptionsSchema>
export type StudyPlanOptionsInput = z.input<typeof studyPlanOptionsSchema>

/** One scheduled practice block (frontier or refresh) with its actual trials. */
export const studyPlanBlockSchema = z.object({
  /** 'frontier' = the current not-yet-mastered set; 'refresh' = retrieval on a mastered set. */
  kind: z.enum(['frontier', 'refresh']),
  setId: z.string(),
  setTitle: z.string(),
  /** 1-based retrieval ordinal within the expanding ladder (refresh only). */
  retrievalOrdinal: z.number().int().min(1).optional(),
  /** Days between the anchor session and this refresh (refresh only). */
  intervalDays: z.number().int().min(1).optional(),
  /** Model-diagnostic trials for this block (from planDiscriminatingBlock). */
  trials: z.array(
    z.object({
      stimulusId: z.string(),
      label: z.string(),
      isTransfer: z.boolean(),
      divergence: z.number(),
      rationale: z.string(),
    }),
  ),
  /** Why this block exists on this day (shown to the learner). */
  rationale: z.string(),
})
export type StudyPlanBlock = z.infer<typeof studyPlanBlockSchema>

/** One planned day. An empty block list is an honest rest day. */
export const studyPlanDaySchema = z.object({
  /** `YYYY-MM-DD` UTC day key (the repo-wide day-bucket convention). */
  day: z.string(),
  /** 0-based day index from `now`. */
  dayIndex: z.number().int().min(0),
  blocks: z.array(studyPlanBlockSchema),
})
export type StudyPlanDay = z.infer<typeof studyPlanDaySchema>

/** The complete multi-day study schedule. */
export const studyPlanSchema = z.object({
  /** ISO timestamp the plan was generated at (echoes `options.now`). */
  generatedAt: z.string(),
  horizonDays: z.number().int().min(1),
  /** The current frontier set, if any (null = every canonical set is mastered). */
  frontierSetId: z.string().nullable(),
  days: z.array(studyPlanDaySchema),
  /** Per-set mastery summary that drove the plan (transparent, inspectable). */
  setSummaries: z.array(
    z.object({
      setId: z.string(),
      setTitle: z.string(),
      sessionsCount: z.number().int().min(0),
      lastCompletedAt: z.string().nullable(),
      latestAccuracy: z.number().nullable(),
      latestCri: z.number().nullable(),
      bestAccuracy: z.number(),
      mastered: z.boolean(),
    }),
  ),
  /** Honest planning notes (skipped unknown sets, deferred blocks, rest days). */
  notes: z.array(z.string()),
})
export type StudyPlan = z.infer<typeof studyPlanSchema>

/** Full planner input: history + options. */
export const studyPlanInputSchema = z.object({
  sessions: z.array(studyPlanSessionSchema).default([]),
  options: studyPlanOptionsSchema,
})
export type StudyPlanInput = z.infer<typeof studyPlanInputSchema>
export type StudyPlanInputInput = z.input<typeof studyPlanInputSchema>

// ── History Summary ──────────────────────────────────────────────────────────

export interface StudyHistorySummaryOptions {
  /** Latest-session accuracy at or above which a set counts as mastered. */
  masteryAccuracy: number
  /** Completed sessions required before a set can be mastered. */
  minSessionsForMastery: number
}

const DEFAULT_SUMMARY_OPTIONS: StudyHistorySummaryOptions = {
  masteryAccuracy: 80,
  minSessionsForMastery: 2,
}

/**
 * Summarize per-set study history (deterministic; sets ordered canonically).
 * Unknown set ids are skipped and reported so callers can surface them. The
 * most recent session per set is the anchor; ties on the timestamp break to
 * the lower-accuracy session (deterministic, and the conservative choice).
 */
export function summarizeStudyHistory(
  sessions: StudyPlanSession[],
  options: StudyHistorySummaryOptions = DEFAULT_SUMMARY_OPTIONS,
): { summaries: StudyPlan['setSummaries']; unknownSetIds: string[] } {
  const bySetId = new Map<string, StudyPlanSession[]>()
  const unknownSetIds = new Set<string>()
  const knownIds = new Set(CANONICAL_CATEGORIZATION_SETS.map((s) => s.id))
  for (const session of sessions) {
    if (!knownIds.has(session.setId)) {
      unknownSetIds.add(session.setId)
      continue
    }
    const list = bySetId.get(session.setId) ?? []
    list.push(session)
    bySetId.set(session.setId, list)
  }
  for (const [, list] of bySetId) {
    list.sort(
      (a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt) || a.accuracy - b.accuracy,
    )
  }

  const summaries: StudyPlan['setSummaries'] = []
  for (const set of CANONICAL_CATEGORIZATION_SETS) {
    const list = bySetId.get(set.id) ?? []
    const latest = list[0]
    const mastered =
      latest !== undefined &&
      list.length >= options.minSessionsForMastery &&
      latest.accuracy >= options.masteryAccuracy
    summaries.push({
      setId: set.id,
      setTitle: set.title,
      sessionsCount: list.length,
      lastCompletedAt: latest?.completedAt ?? null,
      latestAccuracy: latest?.accuracy ?? null,
      latestCri: latest?.cri ?? null,
      bestAccuracy: list.reduce((best, s) => Math.max(best, s.accuracy), 0),
      mastered,
    })
  }
  return { summaries, unknownSetIds: [...unknownSetIds].sort() }
}

// ── Deterministic date helpers (UTC day arithmetic) ──────────────────────────

const DAY_MS = 86_400_000

/** The UTC day key of `iso + days` (day-bucket convention shared with repos). */
function dayKeyPlus(iso: string, days: number): string {
  return dayKey(new Date(Date.parse(iso) + days * DAY_MS))
}

/**
 * Interleave blocks so no two consecutive blocks come from the same category
 * set (Kang 2016): stable greedy over the id-sorted pool — always pick the
 * lexicographically smallest candidate whose set differs from the previous
 * pick; when only one set remains, pick the smallest (adjacency is then
 * unavoidable and honest).
 */
function interleaveBlocks(blocks: StudyPlanBlock[]): StudyPlanBlock[] {
  const pool = [...blocks].sort(
    (a, b) => a.setId.localeCompare(b.setId) || a.kind.localeCompare(b.kind),
  )
  const ordered: StudyPlanBlock[] = []
  let lastSetId: string | null = null
  while (pool.length > 0) {
    const differentIdx = pool.findIndex((b) => b.setId !== lastSetId)
    const chosenIdx = differentIdx !== -1 ? differentIdx : 0
    const [chosen] = pool.splice(chosenIdx, 1)
    ordered.push(chosen!)
    lastSetId = chosen!.setId
  }
  return ordered
}

// ── The Planner ──────────────────────────────────────────────────────────────

/**
 * Build the multi-day categorization study schedule (deterministic given the
 * session history and `now`).
 *
 * Day 0 is `dayKey(now)` (UTC). Every day with an open frontier gets exactly
 * one frontier block of discriminating trials; mastered sets get a refresh
 * block on each expanding-ladder day due inside the horizon. The daily budget
 * caps blocks per day: the frontier keeps its slot, overdue refreshes cascade
 * to the next day, and anything pushed past the horizon is reported in
 * `notes` (never dropped silently).
 */
export function planCategorizationStudy(
  sessions: StudyPlanSession[],
  options: StudyPlanOptionsInput,
): StudyPlan {
  const {
    now,
    horizonDays,
    dailyBlockBudget,
    refreshTrials,
    frontierTrials,
    masteryAccuracy,
    minSessionsForMastery,
    expandingIntervals,
  } = studyPlanOptionsSchema.parse(options)
  const history = z.array(studyPlanSessionSchema).parse(sessions)

  const { summaries, unknownSetIds } = summarizeStudyHistory(history, {
    masteryAccuracy,
    minSessionsForMastery,
  })
  const notes: string[] = []
  if (unknownSetIds.length > 0) {
    notes.push(
      `Skipped ${unknownSetIds.length === 1 ? '1 session' : `${unknownSetIds.length} sets' sessions`} for unknown category set${unknownSetIds.length === 1 ? '' : 's'} ${unknownSetIds.map((id) => `"${id}"`).join(', ')} — the plan covers the canonical sets only.`,
    )
  }

  const masteredSetIds = new Set(summaries.filter((s) => s.mastered).map((s) => s.setId))
  const frontierSummary = summaries.find((s) => !masteredSetIds.has(s.setId)) ?? null
  if (!frontierSummary) {
    notes.push(
      'Every canonical category set is mastered — the plan carries expanding retrieval only. Add a new category set to open a new frontier.',
    )
  }

  const buildBlock = (
    setId: string,
    kind: StudyPlanBlock['kind'],
    ordinal: number | undefined,
    intervalDays: number | undefined,
  ): StudyPlanBlock => {
    const set = findCategorySet(setId)
    const plan: DiscriminatingTrialPlan = planDiscriminatingBlock(
      set,
      kind === 'frontier' ? frontierTrials : refreshTrials,
    )
    return {
      kind,
      setId: set.id,
      setTitle: set.title,
      retrievalOrdinal: ordinal,
      intervalDays,
      trials: plan.trials,
      rationale:
        kind === 'frontier'
          ? `Frontier practice: ${plan.trials.length} model-diagnostic trials on "${set.title}" — the trials where prototype and exemplar predictions split (Medin & Schaffer 1978).`
          : `Expanding retrieval #${ordinal} (day +${intervalDays}, Landauer & Bjork 1978): ${plan.trials.length} diagnostic trials on mastered set "${set.title}" — retrieval, not re-reading (Roediger & Karpicke 2006).`,
    }
  }

  // ── Due refresh days per mastered set from the expanding ladder ────────────
  interface DueRefresh {
    setId: string
    setTitle: string
    retrievalOrdinal: number
    intervalDays: number
  }
  // Ascending, deduplicated ladder — the "skip past-horizon" cutoff below is
  // only sound for ascending intervals, and duplicate intervals are config noise.
  const ladder = [...new Set(expandingIntervals)].sort((a, b) => a - b)
  const dueByDay = new Map<number, DueRefresh[]>()
  for (const summary of summaries) {
    if (!masteredSetIds.has(summary.setId) || summary.lastCompletedAt === null) continue
    for (let i = 0; i < ladder.length; i++) {
      const intervalDays = ladder[i]!
      const dueDay = dayKeyPlus(summary.lastCompletedAt, intervalDays)
      // 0-based index of the due day relative to day 0 (now's day key).
      const dayIndex = Math.round(
        (Date.parse(`${dueDay}T00:00:00.000Z`) -
          Date.parse(`${dayKey(new Date(now))}T00:00:00.000Z`)) /
          DAY_MS,
      )
      if (dayIndex < 0) continue // ladder step already elapsed before day 0
      if (dayIndex >= horizonDays) break // later ladder steps fall past the horizon
      const list = dueByDay.get(dayIndex) ?? []
      list.push({
        setId: summary.setId,
        setTitle: summary.setTitle,
        retrievalOrdinal: i + 1,
        intervalDays,
      })
      dueByDay.set(dayIndex, list)
    }
  }
  for (const [, list] of dueByDay) {
    list.sort((a, b) => a.setId.localeCompare(b.setId) || a.retrievalOrdinal - b.retrievalOrdinal)
  }

  // ── Materialize days: frontier block daily, refresh blocks budgeted ────────
  const frontierBlock = frontierSummary
    ? buildBlock(frontierSummary.setId, 'frontier', undefined, undefined)
    : null
  const days: StudyPlanDay[] = []
  const startDay = dayKey(new Date(now))
  let restDays = 0
  for (let i = 0; i < horizonDays; i++) {
    const blocks: StudyPlanBlock[] = []
    if (frontierBlock) blocks.push(frontierBlock)
    const queue = dueByDay.get(i) ?? []
    for (const refresh of queue) {
      if (blocks.length < dailyBlockBudget) {
        blocks.push(
          buildBlock(refresh.setId, 'refresh', refresh.retrievalOrdinal, refresh.intervalDays),
        )
      } else {
        const nextDay = i + 1
        if (nextDay >= horizonDays) {
          notes.push(
            `Daily budget deferred a refresh of "${refresh.setTitle}" past the ${horizonDays}-day horizon — it resurfaces on the next plan.`,
          )
        } else {
          const nextQueue = dueByDay.get(nextDay) ?? []
          nextQueue.push(refresh)
          dueByDay.set(nextDay, nextQueue)
        }
      }
    }
    if (blocks.length === 0) restDays += 1
    days.push({
      day: dayKey(new Date(Date.parse(`${startDay}T00:00:00.000Z`) + i * DAY_MS)),
      dayIndex: i,
      blocks: interleaveBlocks(blocks),
    })
  }
  if (restDays > 0 && !frontierSummary) {
    notes.push(
      `${restDays} rest day${restDays === 1 ? '' : 's'} inside the horizon — spacing needs gaps; do not backfill them (Landauer & Bjork 1978).`,
    )
  }

  return {
    generatedAt: new Date(now).toISOString(),
    horizonDays,
    frontierSetId: frontierSummary?.setId ?? null,
    days,
    setSummaries: summaries,
    notes: [
      `Day 0 is ${startDay} (UTC). Frontier: ${frontierSummary ? `"${frontierSummary.setTitle}"` : 'none — all canonical sets mastered'}. Mastery needs ≥ ${minSessionsForMastery} session${minSessionsForMastery === 1 ? '' : 's'} with the latest at ≥ ${masteryAccuracy}% accuracy.`,
      ...notes,
    ],
  }
}
