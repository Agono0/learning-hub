import { calculateRetrievability } from '../fsrs'
import { MS_PER_DAY, type ReadinessCard } from '../readiness/model'
import { isSeen, recallAt, simulationKit } from '../readiness/forecast'
import { assessConfidence, round3 } from '../readiness/aggregate'
import {
  PREP_ASSUMPTIONS,
  PREP_DEFAULTS,
  type PlanDay,
  type PlannedReview,
  type PrepOptions,
  type PrepPlan,
} from './model'
import type { FsrsCard } from '../fsrs'

const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

interface Live {
  src: ReadinessCard
  fsrs: FsrsCard
  count: number
  /** Exam-day recall given the reviews planned so far. */
  examRecall: number
}

const clampInt = (n: number | undefined, lo: number, hi: number, dflt: number): number =>
  n === undefined || !Number.isFinite(n) ? dflt : Math.max(lo, Math.min(hi, Math.floor(n)))

/**
 * Build the schedule. Deterministic for fixed inputs. Greedy per day: for each
 * study day it asks, for every card, "if I review this card now and remember
 * it, how much higher is its recall on exam day?", then takes the best
 * `perDay` that clear `minGain`, in that order. Card state advances with each
 * planned review, so a later day sees the spacing already chosen.
 */
export async function planExamPrep(
  cards: readonly ReadinessCard[],
  now: Date,
  exam: Date,
  targetRecall: number,
  options: PrepOptions = {},
): Promise<PrepPlan | null> {
  if (Number.isNaN(exam.getTime()) || Number.isNaN(now.getTime())) return null
  const perDay = clampInt(options.perDay, 0, PREP_DEFAULTS.maxPerDay, PREP_DEFAULTS.perDay)
  const minGain = Math.max(0, Math.min(0.5, options.minGain ?? PREP_DEFAULTS.minGain))
  const maxReviewsPerCard = clampInt(
    options.maxReviewsPerCard,
    1,
    10,
    PREP_DEFAULTS.maxReviewsPerCard,
  )
  const maxCards = clampInt(options.maxCards, 1, 50000, PREP_DEFAULTS.maxCards)
  const rest = [
    ...new Set((options.restWeekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)),
  ].sort()
  const target = Math.max(0.5, Math.min(0.99, targetRecall))

  const live = cards.filter((c) => !c.suspended)
  const seen = live.filter(isSeen)
  const unseenCards = live.length - seen.length
  const { startOfDay, getScheduler, reviewOnce, fsrsRecall, toFsrs } = simulationKit
  const first = startOfDay(now)
  const last = startOfDay(exam)
  const expired = exam.getTime() <= now.getTime()

  const state: Live[] = seen.map((src) => ({
    src,
    fsrs: toFsrs(src),
    count: 0,
    examRecall: recallAt(src, exam),
  }))
  const baselineMean = state.length ? state.reduce((s, c) => s + c.examRecall, 0) / state.length : 0
  // Weakest cards first, ties by id, so the cut is deterministic. Cards past the cut are never
  // reviewed in the plan and stay at their no-review figure inside every mean below.
  const truncated = state.length > maxCards
  const active = truncated
    ? [...state]
        .sort((a, b) => a.examRecall - b.examRecall || a.src.id - b.src.id)
        .slice(0, maxCards)
    : state

  const days: PlanDay[] = []
  let capacityBound = false
  const planned = new Set<number>()
  let plannedReviews = 0

  if (!expired && state.length > 0) {
    const sched = await getScheduler({
      desiredRetention: options.desiredRetention,
      weights: options.weights,
    })
    for (let day = first; day < last; day += MS_PER_DAY) {
      const when = new Date(Math.max(day + MS_PER_DAY / 2, now.getTime()))
      const isRest = rest.includes(new Date(day).getUTCDay())
      const reviews: PlannedReview[] = []
      if (!isRest && perDay > 0) {
        const cands: { s: Live; next: FsrsCard; after: number; gain: number; before: number }[] = []
        for (const s of active) {
          if (s.count >= maxReviewsPerCard) continue
          // Exam prep is a deliberate extra review, so a card may be reviewed before it is due.
          const next = reviewOnce(sched, s.fsrs, when, 3)
          const after = calculateRetrievability(
            next.stability,
            Math.max(0, (exam.getTime() - when.getTime()) / MS_PER_DAY),
          )
          const gain = after - s.examRecall
          if (gain >= minGain)
            cands.push({ s, next, after, gain, before: fsrsRecall(s.fsrs, when) })
        }
        cands.sort((a, b) => b.gain - a.gain || a.s.src.id - b.s.src.id)
        if (cands.length > perDay) capacityBound = true
        for (const c of cands.slice(0, perDay)) {
          c.s.fsrs = c.next
          c.s.count += 1
          c.s.examRecall = c.after
          planned.add(c.s.src.id)
          plannedReviews += 1
          reviews.push({
            cardId: c.s.src.id,
            deckId: c.s.src.deckId,
            recallBefore: round3(c.before),
            examRecallAfter: round3(c.after),
            gain: round3(c.gain),
            nth: c.s.count,
          })
        }
      }
      days.push({
        date: dayKey(day),
        rest: isRest,
        reviews,
        meanExamRecallAfter: round3(state.reduce((sum, c) => sum + c.examRecall, 0) / state.length),
      })
    }
  }

  const plannedMean = state.length ? state.reduce((s, c) => s + c.examRecall, 0) / state.length : 0
  return {
    exam: exam.toISOString(),
    from: dayKey(first),
    targetRecall: target,
    days,
    summary: {
      studyDays: days.filter((d) => !d.rest).length,
      restDays: days.filter((d) => d.rest).length,
      plannedReviews,
      distinctCards: planned.size,
      baseline: round3(baselineMean),
      planned: round3(plannedMean),
      belowTarget: state.filter((c) => c.examRecall < target).length,
      seenCards: state.length,
      unseenCards,
      capacityBound,
      truncated,
      consideredCards: active.length,
    },
    confidence: assessConfidence(seen),
    options: { perDay, minGain, maxReviewsPerCard, maxCards, restWeekdays: rest },
    expired,
    assumptions: [...PREP_ASSUMPTIONS],
  }
}
