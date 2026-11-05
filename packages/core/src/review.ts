/**
 * Review session logic — session building with hypercorrection
 * priority, the session energy system, worked-example fading for proofs and
 * Yerkes-Dodson difficulty tuning. Pure module — safe for client bundles.
 */
import type { Confidence } from './types'

// ─── Session building ───────────────────────────────────────────────────────

export type SessionMode = 'normal' | 'pretest' | 'cram'

/**
 * One candidate row for a session. DB card rows satisfy this structurally;
 * `recentRevlog` is the card's most recent revlog entry, passed in by the
 * caller (the API route joins cards with recent revlog rows).
 */
export interface SessionRow {
  id: number
  deckId: number
  due: string
  state: number
  reps: number
  stability: number
  suspended?: boolean | null
  buryUntil?: string | null
  recentRevlog?: { rating: number; confidence: Confidence; reviewedAt: string } | null
}

const DAY_MS = 86_400_000

/** Hypercorrection: confident-wrong answers (sure but failed) are retried first. */
function isConfidentWrong(row: SessionRow): boolean {
  return row.recentRevlog?.rating === 1 && row.recentRevlog.confidence === 1
}

function isAvailable(row: SessionRow, asOf: Date): boolean {
  if (row.suspended) return false
  if (row.buryUntil && row.buryUntil > asOf.toISOString()) return false
  return true
}

/** Overdue-ness in days (for tie-breaking ordering). */
function overdueDays(row: SessionRow, asOf: Date): number {
  return (asOf.getTime() - Date.parse(row.due)) / DAY_MS
}

/**
 * Round-robin merge across groups that PRESERVES each group's internal order —
 * the priority order computed by the caller (overdue-ness, stability, recency)
 * must survive the merge; only the group alternation is introduced.
 */
export function interleaveBy<T>(rows: T[], keyOf: (row: T) => string | number): T[] {
  const byKey = new Map<string | number, T[]>()
  for (const r of rows) {
    const k = keyOf(r)
    const q = byKey.get(k) ?? []
    q.push(r)
    byKey.set(k, q)
  }
  const queues = Array.from(byKey.values())
  const out: T[] = []
  while (queues.some((q) => q.length > 0)) {
    for (const q of queues) {
      const next = q.shift()
      if (next !== undefined) out.push(next)
    }
  }
  return out
}

function roundRobinByDeck(rows: SessionRow[]): SessionRow[] {
  return interleaveBy(rows, (r) => r.deckId)
}

/**
 * Build a review session.
 *
 *  - normal: due cards only; confident-wrong cards first (hypercorrection —
 *    Butler et al.: errors made with high confidence benefit most from an
 *    immediate retest), then most-overdue first; decks interleaved per tier.
 *  - pretest: test-before-study — never-reviewed cards (reps = 0) surface
 *    before due cards, so preexisting knowledge is measured, not trained.
 *  - cram: ignores due dates; weakest memories (lowest stability) first —
 *    hypercorrection still leads.
 */
export function buildSession({
  rows,
  limit = 20,
  mode = 'normal',
  asOf = new Date(),
}: {
  rows: SessionRow[]
  limit?: number
  mode?: SessionMode
  asOf?: Date
}): SessionRow[] {
  const available = rows.filter((r) => isAvailable(r, asOf))
  if (available.length === 0) return []

  const hyper = available
    .filter(isConfidentWrong)
    .sort((a, b) =>
      (b.recentRevlog?.reviewedAt ?? '').localeCompare(a.recentRevlog?.reviewedAt ?? ''),
    )
  const rest = available.filter((r) => !isConfidentWrong(r))

  let orderedRest: SessionRow[]
  if (mode === 'cram') {
    orderedRest = [...rest].sort((a, b) => a.stability - b.stability || a.id - b.id)
  } else if (mode === 'pretest') {
    orderedRest = [...rest].sort((a, b) => {
      const aNew = a.reps === 0 ? 0 : 1
      const bNew = b.reps === 0 ? 0 : 1
      if (aNew !== bNew) return aNew - bNew
      return overdueDays(b, asOf) - overdueDays(a, asOf)
    })
  } else {
    // normal: due cards, most overdue first
    const asOfIso = asOf.toISOString()
    orderedRest = rest
      .filter((r) => r.due <= asOfIso)
      .sort((a, b) => overdueDays(b, asOf) - overdueDays(a, asOf) || a.id - b.id)
  }

  return [...roundRobinByDeck(hyper), ...roundRobinByDeck(orderedRest)].slice(0, limit)
}

// ─── Energy system ──────────────────────────────────────────────────────────

/** Session energy: max 5; each mistake costs 1; refilled at session start. */
export const MAX_ENERGY = 5

/** Energy at the start of a session (refill per session — no cross-session debt). */
export function initialEnergy(): number {
  return MAX_ENERGY
}

/** A mistake (Again) costs 1 energy, floored at 0. */
export function applyMistake(energy: number): number {
  return Math.max(0, energy - 1)
}

/** Energy refills to max at the start of each session. */
export function refillEnergy(): number {
  return MAX_ENERGY
}

// ─── Worked example fading (Renkl & Atkinson) ───────────────────────────────

export interface FadePolicy {
  level: 0 | 1 | 2 | 3
  label: string
  /** fraction of proof steps shown to the learner (the rest must be recalled) */
  visibleFraction: number
  description: string
}

const FADE_POLICIES: FadePolicy[] = [
  {
    level: 0,
    label: 'worked example',
    visibleFraction: 1,
    description: 'Study the fully worked proof.',
  },
  {
    level: 1,
    label: 'completion problem',
    visibleFraction: 2 / 3,
    description: 'Most steps shown — fill in the last third.',
  },
  {
    level: 2,
    label: 'faded example',
    visibleFraction: 1 / 3,
    description: 'Only the opening steps are shown.',
  },
  {
    level: 3,
    label: 'full problem',
    visibleFraction: 0,
    description: 'Reproduce the whole proof yourself.',
  },
]

/** Fade policy for a proof_step ladder level (clamped to 0..3). */
export function workedExampleFade(level: number): FadePolicy {
  const clamped = Math.min(3, Math.max(0, Math.round(level))) as 0 | 1 | 2 | 3
  return FADE_POLICIES[clamped]
}

/** How many of `totalSteps` to show for a fade level. */
export function stepsToShow(level: number, totalSteps: number): number {
  return Math.round(totalSteps * workedExampleFade(level).visibleFraction)
}

// ─── Yerkes-Dodson difficulty tuning ────────────────────────────────────────

export interface DifficultyAdjustment {
  suggestion: 'easier' | 'keep' | 'harder'
  reason: string
  /** desirable-difficulty accuracy band center */
  targetAccuracy: number
}

/**
 * Suggest a difficulty move from recent performance. Optimal learning sits at
 * ~0.7–0.9 accuracy (desirable difficulty); below that is the frustration
 * zone, above it (with fast answers) the boredom zone.
 */
export function adjustDifficulty(input: {
  recentAccuracy: number
  recentAvgTime?: number | null
}): DifficultyAdjustment {
  const { recentAccuracy, recentAvgTime } = input
  const pct = Math.round(recentAccuracy * 100)
  if (recentAccuracy < 0.65) {
    return {
      suggestion: 'easier',
      reason: `Accuracy ${pct}% is in the frustration zone (<65%) — reduce load.`,
      targetAccuracy: 0.8,
    }
  }
  const fast = recentAvgTime == null || recentAvgTime < 15_000
  if (recentAccuracy > 0.9 && fast) {
    return {
      suggestion: 'harder',
      reason: `Accuracy ${pct}% with quick answers — boredom zone, raise challenge.`,
      targetAccuracy: 0.8,
    }
  }
  return {
    suggestion: 'keep',
    reason: `Accuracy ${pct}% sits in the desirable-difficulty band.`,
    targetAccuracy: 0.8,
  }
}
