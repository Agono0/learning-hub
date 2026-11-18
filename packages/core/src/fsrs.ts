/**
 * FSRS-6 scheduling bridge — the canonical, pure layer between the
 * `cards` DB rows and ts-fsrs v6's `DefaultScheduler`.
 *
 * NO db import here: functions are pure; route handlers (apps/web) and the
 * mcp/cli adapters apply the returned values to the database themselves.
 *
 * ts-fsrs v6 facts (verified 2026-11-04 against the installed 6.0.0):
 *  - legacy `fsrs().reviewCard` is REMOVED; use `DefaultScheduler`.
 *  - Card fields: { cardId, stability, difficulty, dueAt(Date), lastReviewAt,
 *    state, scheduleStatus, reps, lapses, scheduledDays, learningStep }.
 *  - `sched.review({ card, grade, now })` returns { card, revlog } and does
 *    NOT mutate the input card.
 *  - `revlog.state` is the state BEFORE the review; `revlog.scheduledDays`
 *    is the interval that WAS scheduled (the card's pre-review value).
 */
import {
  DefaultScheduler,
  type DefaultSchedulerCard,
  type DefaultSchedulerRevlog,
  type Grade as FsrsGrade,
} from 'ts-fsrs'
import type { Confidence, Grade } from './types'

/** ts-fsrs v6 card (FSRS-6 variant — the version this app schedules with). */
export type FsrsCard = DefaultSchedulerCard<'FSRS-6'>
/** ts-fsrs v6 review log returned by `sched.review`. */
export type FsrsRevlog = DefaultSchedulerRevlog<'FSRS-6'>

/** Minimal DB row shape needed to reconstruct a scheduler card. DB rows satisfy this structurally. */
export interface FsrsCardRow {
  id: number
  due: string // ISO
  stability: number
  difficulty: number
  scheduledDays: number
  learningStep: number
  reps: number
  lapses: number
  state: number // 0 New 1 Learning 2 Review 3 Relearning
  lastReview: string | null // ISO
}

/** Patch to write back into the `cards` table after a review (or for undo snapshots). */
export interface FsrsRowPatch {
  due: string // ISO
  stability: number
  difficulty: number
  scheduledDays: number
  learningStep: number
  reps: number
  lapses: number
  state: number
  lastReview: string | null // ISO
}

// ─── Retrievability Telemetry (Feature 10 / Addon 10) ─────────────────────────

/** FSRS-6 default decay parameter (w20 in the 21-parameter weight vector). */
export const FSRS6_DEFAULT_DECAY = 0.1542

/**
 * FSRS-6 decay factor derived from R(S, S) = 0.9:
 * factor = exp((-1 / decay) * ln(0.9)) - 1 ≈ 0.98034649
 */
export const FSRS6_DEFAULT_FACTOR = Math.exp(Math.pow(-FSRS6_DEFAULT_DECAY, -1) * Math.log(0.9)) - 1

/**
 * Calculate predicted retrievability R(t, S) = (1 + factor * t / S)^(-decay).
 * Strictly bounded in [0, 1].
 *
 * @param stability Memory stability S in days (must be > 0).
 * @param elapsedDays Days t elapsed since last review (non-negative).
 * @param decay FSRS decay parameter (defaults to FSRS6_DEFAULT_DECAY = 0.1542).
 * @returns Retrievability probability strictly within [0, 1].
 */
export function calculateRetrievability(
  stability: number,
  elapsedDays: number,
  decay: number = FSRS6_DEFAULT_DECAY,
): number {
  if (typeof stability !== 'number' || typeof elapsedDays !== 'number') return 0
  if (isNaN(stability) || isNaN(elapsedDays)) return 0
  if (stability <= 0) return 0
  if (elapsedDays <= 0) return 1
  const factor =
    decay === FSRS6_DEFAULT_DECAY
      ? FSRS6_DEFAULT_FACTOR
      : Math.exp(Math.pow(-decay, -1) * Math.log(0.9)) - 1
  const r = Math.pow(1 + (factor * elapsedDays) / stability, -decay)
  if (isNaN(r) || !isFinite(r)) return 0
  return Math.min(1, Math.max(0, r))
}

/** Shape of one `revlog` table insert (append-only, id = epoch ms of the review). */
export interface RevlogInsert {
  id: number // epoch ms
  cardId: number
  rating: Grade // 1 Again / 2 Hard / 3 Good / 4 Easy
  state: number // state BEFORE review
  elapsedDays: number
  scheduledDays: number
  timeMs: number
  confidence: Confidence
  retrievability?: number | null // Feature 10 (Addon 10)
  reviewedAt: string // ISO
}

const DAY_MS = 86_400_000

/** Schedulers are pure config — cache one per (desiredRetention, weights) pair. */
const schedulerCache = new Map<string, Promise<Awaited<ReturnType<typeof DefaultScheduler>>>>()

function weightsCacheKey(weights?: readonly number[] | null): string {
  if (!weights || weights.length === 0) return 'default'
  return weights.map((n) => n.toFixed(4)).join(',')
}

async function getScheduler(desiredRetention: number, weights?: readonly number[] | null) {
  const clampedRetention = Math.max(0.5, Math.min(0.97, desiredRetention))
  const key = `${clampedRetention.toFixed(3)}:${weightsCacheKey(weights)}`
  let cached = schedulerCache.get(key)
  if (!cached) {
    cached = DefaultScheduler({
      version: 'FSRS-6',
      desiredRetention: clampedRetention,
      weights: weights && weights.length > 0 ? [...weights] : undefined,
      enableShortTerm: true,
    })
    schedulerCache.set(key, cached)
  }
  return cached
}

/**
 * Format a future due timestamp relative to `now` as a compact Anki-style
 * interval badge (`<1m`, `10m`, `4h`, `1d`, `6d`, `1.5mo`, `1.2y`).
 */
export function formatInterval(dueAtIso: string, now: Date = new Date()): string {
  const diffMs = Math.max(0, Date.parse(dueAtIso) - now.getTime())
  if (diffMs < 60_000) return '<1m'
  const mins = Math.round(diffMs / 60_000)
  if (mins < 60) return `${mins}m`
  const hours = Math.round(diffMs / 3_600_000)
  if (hours < 24) return `${hours}h`
  const days = Math.round(diffMs / DAY_MS)
  if (days < 30) return `${days}d`
  if (days < 365) {
    const months = Math.round((days / 30) * 10) / 10
    return `${months}mo`
  }
  const years = Math.round((days / 365) * 10) / 10
  return `${years}y`
}

function scheduleStatusForState(state: number): 'new' | 'learning' | 'review' {
  // v6 ScheduleStatus is 'new' | 'learning' | 'review' (relearning reports as 'learning'
  // while its steps run; state itself stays 3).
  if (state === 0) return 'new'
  if (state === 2) return 'review'
  return 'learning'
}

/**
 * Rebuild a scheduler-native v6 Card from a DB row. The scheduler validates the
 * card by shape at runtime, so a plain object with exactly the fields emitted
 * by `newCard()` (verified empirically against ts-fsrs 6.0.0) is accepted — no
 * async scheduler needed here. The single `as FsrsCard` is deliberate: the
 * published type carries an extra `stabilityFast` field that the FSRS-6
 * runtime never materializes (the engine recomputes it from `stability`).
 */
export function cardRowToFsrs(row: FsrsCardRow): FsrsCard {
  return {
    cardId: String(row.id),
    stability: row.stability,
    difficulty: row.difficulty,
    dueAt: new Date(row.due),
    lastReviewAt: row.lastReview ? new Date(row.lastReview) : null,
    state: row.state as FsrsCard['state'],
    scheduleStatus: scheduleStatusForState(row.state),
    reps: row.reps,
    lapses: row.lapses,
    scheduledDays: row.scheduledDays,
    learningStep: row.learningStep,
  } as FsrsCard
}

/** Serialize a scheduler card back to the `cards`-table column values (Date → ISO). */
export function fsrsToCardRow(card: FsrsCard): FsrsRowPatch {
  return {
    due: card.dueAt.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduledDays,
    learningStep: card.learningStep,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state as number,
    lastReview: card.lastReviewAt ? card.lastReviewAt.toISOString() : null,
  }
}

/**
 * Apply one review to a card row — pure: returns the updated scheduler card and
 * the exact `revlog` row the caller should INSERT. Nothing is mutated.
 */
export async function reviewCard(
  cardRow: FsrsCardRow,
  grade: Grade,
  confidence: Confidence,
  timeMs: number,
  desiredRetention = 0.9,
  opts: { now?: Date; weights?: readonly number[] | null } = {},
): Promise<{ card: FsrsCard; revlogItem: RevlogInsert }> {
  const now = opts.now ?? new Date()
  const sched = await getScheduler(desiredRetention, opts.weights)
  const input = cardRowToFsrs(cardRow)
  const { card: next, revlog } = sched.review({
    // `as never`: ts-fsrs 6.0.0's review() INPUT type demands `stabilityFast`
    // although the FSRS-6 Card type (and runtime) never carries it — same
    // upstream skew the mcp/cli adapters worked around. Runtime-verified.
    card: input as never,
    grade: grade as FsrsGrade,
    now,
  })
  const elapsedDays = cardRow.lastReview
    ? Math.max(0, Math.round((now.getTime() - Date.parse(cardRow.lastReview)) / DAY_MS))
    : 0
  const decay = opts.weights && opts.weights.length === 21 ? opts.weights[20]! : FSRS6_DEFAULT_DECAY
  const retrievability =
    cardRow.state !== 0 && cardRow.stability > 0
      ? Math.round(calculateRetrievability(cardRow.stability, elapsedDays, decay) * 10000) / 10000
      : null
  return {
    card: next,
    revlogItem: {
      id: now.getTime(),
      cardId: cardRow.id,
      rating: grade,
      state: cardRow.state, // state BEFORE the review (matches ts-fsrs revlog.state)
      elapsedDays,
      scheduledDays: revlog.scheduledDays,
      timeMs,
      confidence,
      retrievability,
      reviewedAt: now.toISOString(),
    },
  }
}

/** Preview the four grade outcomes without committing (for "how long will Hard give me?" UI). */
export async function previewGrades(
  cardRow: FsrsCardRow,
  desiredRetention = 0.9,
  opts: { now?: Date; weights?: readonly number[] | null } = {},
): Promise<{ grade: Grade; dueAt: string; scheduledDays: number; label: string }[]> {
  const now = opts.now ?? new Date()
  const sched = await getScheduler(desiredRetention, opts.weights)
  const input = cardRowToFsrs(cardRow)
  const out: { grade: Grade; dueAt: string; scheduledDays: number; label: string }[] = []
  for (const preview of sched.preview({ card: input as never, now })) {
    const dueAt = preview.card.dueAt.toISOString()
    out.push({
      grade: preview.grade as Grade,
      dueAt,
      scheduledDays: preview.card.scheduledDays,
      label: formatInterval(dueAt, now),
    })
  }
  return out
}

// ─── Queue selection / forecast / leeches ───────────────────────────────────

/** Minimal queue row shape (DB rows satisfy this structurally). */
export interface QueueRow {
  id: number
  due: string
  suspended?: boolean | null
  buryUntil?: string | null
}

/** Cards due at `asOf`, respecting suspension and sibling burying, soonest first. */
export function dueQueueSelector<T extends QueueRow>(rows: T[], asOf: Date = new Date()): T[] {
  const asOfIso = asOf.toISOString()
  return rows
    .filter((r) => !r.suspended && (!r.buryUntil || r.buryUntil <= asOfIso) && r.due <= asOfIso)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.id - b.id))
}

/** Due-count per day for the next 30 days (UTC day keys, `from`'s day first). */
export function forecastNext30Days(
  rows: { due: string }[],
  from: Date = new Date(),
): { date: string; due: number }[] {
  const startUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())
  const buckets = new Map<string, number>()
  for (let i = 0; i < 30; i++) {
    buckets.set(new Date(startUtc + i * DAY_MS).toISOString().slice(0, 10), 0)
  }
  for (const r of rows) {
    const key = new Date(r.due).toISOString().slice(0, 10)
    const bucket = buckets.get(key)
    if (bucket !== undefined) buckets.set(key, bucket + 1)
  }
  return Array.from(buckets.entries()).map(([date, due]) => ({ date, due }))
}

/** Wozniak/SuperMemo leeches: cards that keep being forgotten. */
export function leechCandidates<T extends { id: number; lapses: number }>(
  rows: T[],
  threshold = 8,
): T[] {
  return rows.filter((r) => r.lapses >= threshold)
}

/**
 * Leitner box (1–5) as a VIEW over the FSRS state — the classic box model
 * (Leitner 1972) as a mental picture of where a card stands:
 *   box 1 new/learning · 2 young review (< 1 d stability) · 3 (< 10 d)
 *   4 (< 100 d) · 5 mature (≥ 100 d). A lapse does not demote directly here —
 *   FSRS stability already drops, which maps to the lower box.
 */
export function leitnerBox(row: {
  state: number // 0 New 1 Learning 2 Review 3 Relearning
  stability: number
}): 1 | 2 | 3 | 4 | 5 {
  if (row.state === 0 || row.state === 1 || row.state === 3) return 1
  if (row.stability < 1) return 2
  if (row.stability < 10) return 3
  if (row.stability < 100) return 4
  return 5
}

/** Histogram over rows: box (1–5) → count. */
export function leitnerHistogram<T extends { state: number; stability: number }>(
  rows: T[],
): number[] {
  const boxes = [0, 0, 0, 0, 0]
  for (const r of rows) boxes[leitnerBox(r) - 1]! += 1
  return boxes
}

/**
 * Format rotation (recognition → recall graduation): keep MCQs while the memory
 * is unstable (stability < 5 days), then graduate to cloze, then to typein
 * (maximum retrieval effort). Other formats are kept as-is.
 */
export function formatRotation(type: string, stability: number): string {
  if (type === 'mcq') {
    if (stability < 5) return 'mcq'
    if (stability < 10) return 'cloze'
    return 'typein'
  }
  if (type === 'cloze' && stability >= 10) return 'typein'
  return type
}

export { Rating, State as FsrsState } from 'ts-fsrs'
// Note: the FSRS-6 optimizer is NOT re-exported here — it imports back from
// this module, so that re-export made the barrel load order cyclic. The
// package barrel (src/index.ts) exports ./fsrs-optimizer directly.
