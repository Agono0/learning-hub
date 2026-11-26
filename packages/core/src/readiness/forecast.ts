import { DefaultScheduler, type Grade as FsrsGrade } from 'ts-fsrs'
import { calculateRetrievability, cardRowToFsrs, type FsrsCard } from '../fsrs'
import { MS_PER_DAY, type CardForecast, type ReadinessCard, type ReviewPlan } from './model'

/** True when the card has real memory state to predict from. */
export function isSeen(card: ReadinessCard): boolean {
  return card.state !== 0 && card.stability > 0 && card.lastReview !== null
}

/** Whole and fractional days from `from` to `to` (never negative). */
export function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / MS_PER_DAY)
}

/**
 * Recall probability on `at` if the card is not touched again. Unseen cards
 * return 0 and are flagged separately by the caller, so a deck that was never
 * opened reads as "not started" rather than "forgotten".
 */
export function recallAt(card: ReadinessCard, at: Date): number {
  if (!isSeen(card)) return 0
  const last = new Date(card.lastReview as string)
  return calculateRetrievability(card.stability, daysBetween(last, at))
}

/** Rating.Good as ts-fsrs's grade type (3). */
const GOOD: FsrsGrade = 3

type Scheduler = Awaited<ReturnType<typeof DefaultScheduler>>

/** Options for the simulated scheduler. Match the learner's real settings when known. */
export interface SimulationOptions {
  desiredRetention?: number
  weights?: readonly number[] | null
  /** Called for every simulated review, in order. For explaining a scenario and for tests. */
  onReview?: (event: SimulatedReview) => void
}

/** One simulated review inside a scenario. */
export interface SimulatedReview {
  cardId: number
  at: Date
  /** Recall probability just before this review. */
  recallBefore: number
  /** Stability after this review, in days. */
  stabilityAfter: number
}

let cachedScheduler: { key: string; value: Promise<Scheduler> } | null = null

function getScheduler(opts: SimulationOptions): Promise<Scheduler> {
  const retention = Math.max(0.5, Math.min(0.97, opts.desiredRetention ?? 0.9))
  const weights = opts.weights && opts.weights.length > 0 ? [...opts.weights] : undefined
  const key = `${retention}:${weights?.join(',') ?? 'default'}`
  if (!cachedScheduler || cachedScheduler.key !== key) {
    cachedScheduler = {
      key,
      value: DefaultScheduler({
        version: 'FSRS-6',
        desiredRetention: retention,
        weights,
        enableShortTerm: true,
      }),
    }
  }
  return cachedScheduler.value
}

/** Pure one-step review: returns the next card state without touching the input. */
function reviewOnce(sched: Scheduler, fsrs: FsrsCard, now: Date, grade: FsrsGrade): FsrsCard {
  // `as never`: ts-fsrs 6.0.0 demands `stabilityFast` on input though FSRS-6 cards never carry it
  // (same workaround as fsrs.ts reviewCard).
  return sched.review({ card: fsrs as never, grade, now }).card as FsrsCard
}

/** Recall for a scheduler card on `at`. */
function fsrsRecall(card: FsrsCard, at: Date): number {
  if (!card.lastReviewAt || card.stability <= 0) return 0
  return calculateRetrievability(card.stability, daysBetween(card.lastReviewAt, at))
}

function toFsrs(card: ReadinessCard): FsrsCard {
  return cardRowToFsrs({
    id: card.id,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduledDays,
    learningStep: card.learningStep,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.lastReview,
  })
}

/** UTC midnight that starts the day containing `d`. */
function startOfDay(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
}

interface SimCard {
  src: ReadinessCard
  fsrs: FsrsCard
}

/**
 * Simulate reviews from `now` up to `exam` and return each card's planned
 * recall on the exam date.
 *
 * - `none`: nothing is reviewed, planned equals baseline.
 * - `on-schedule`: a card is reviewed (graded Good) on the day it falls due,
 *   again and again until the exam.
 * - `capacity`: each day at most `perDay` due cards are reviewed, the
 *   lowest-recall ones first. Cards left over keep decaying, which is the
 *   honest cost of a limited daily budget.
 *
 * Reviews happen at noon UTC of each simulated day so a card due late in the
 * day is not reviewed before it is due.
 */
export async function plannedRecall(
  cards: readonly ReadinessCard[],
  now: Date,
  exam: Date,
  plan: ReviewPlan,
  opts: SimulationOptions = {},
): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  const live = cards.filter((c) => !c.suspended)
  if (plan.kind === 'none' || exam.getTime() <= now.getTime()) {
    for (const c of live) out.set(c.id, recallAt(c, exam))
    return out
  }
  const sched = await getScheduler(opts)
  const sims: SimCard[] = live.filter(isSeen).map((src) => ({ src, fsrs: toFsrs(src) }))
  const firstDay = startOfDay(now)
  const lastDay = startOfDay(exam)
  for (let day = firstDay; day < lastDay; day += MS_PER_DAY) {
    const when = new Date(day + MS_PER_DAY / 2)
    if (when.getTime() < now.getTime()) continue
    const due = sims.filter((s) => s.fsrs.dueAt.getTime() <= when.getTime())
    if (due.length === 0) continue
    const todo =
      plan.kind === 'capacity'
        ? [...due]
            .sort(
              (a, b) => fsrsRecall(a.fsrs, when) - fsrsRecall(b.fsrs, when) || a.src.id - b.src.id,
            )
            .slice(0, Math.max(0, Math.floor(plan.perDay)))
        : due
    for (const s of todo) {
      const before = fsrsRecall(s.fsrs, when)
      s.fsrs = reviewOnce(sched, s.fsrs, when, GOOD)
      opts.onReview?.({
        cardId: s.src.id,
        at: when,
        recallBefore: before,
        stabilityAfter: s.fsrs.stability,
      })
    }
  }
  for (const c of live) out.set(c.id, 0)
  for (const s of sims) out.set(s.src.id, fsrsRecall(s.fsrs, exam))
  return out
}

/** Baseline and planned recall for every non-suspended card on the exam date. */
export async function forecastCards(
  cards: readonly ReadinessCard[],
  now: Date,
  exam: Date,
  plan: ReviewPlan,
  opts: SimulationOptions = {},
): Promise<CardForecast[]> {
  const planned = await plannedRecall(cards, now, exam, plan, opts)
  return cards
    .filter((c) => !c.suspended)
    .map((c) => ({
      cardId: c.id,
      deckId: c.deckId,
      skillId: c.skillId,
      baseline: recallAt(c, exam),
      planned: planned.get(c.id) ?? 0,
      unseen: !isSeen(c),
    }))
}

/**
 * The simulation primitives, for planners built on the same model (exam-prep).
 * One object so the barrel adds a single name instead of five generic ones.
 */
export const simulationKit = { getScheduler, reviewOnce, fsrsRecall, toFsrs, startOfDay } as const
export type SimulationScheduler = Scheduler
