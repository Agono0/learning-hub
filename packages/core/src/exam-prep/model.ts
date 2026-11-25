/**
 * Exam prep sprint: a day-by-day review schedule toward an exam date.
 *
 * It is a model run over the learner's real card state. Nothing here changes
 * the scheduler or writes a review. Every figure is an estimate under stated
 * assumptions, and the schedule is a greedy heuristic, not an optimal plan.
 */
import type { ReadinessCard, ReadinessConfidence } from '../readiness/model'

export interface PrepOptions {
  /** Most reviews to plan on a study day. Default 30. */
  perDay?: number
  /** UTC weekdays with no planned reviews, 0 = Sunday. */
  restWeekdays?: readonly number[]
  /** A card is only added to a day when one more review lifts its exam-day recall by at least this much. Default 0.01. */
  minGain?: number
  /** Most times one card may appear in the whole plan. Default 3. */
  maxReviewsPerCard?: number
  /** Learner's desired retention for the simulated scheduler. */
  desiredRetention?: number
  weights?: readonly number[] | null
}

export const PREP_DEFAULTS = {
  perDay: 30,
  minGain: 0.01,
  maxReviewsPerCard: 3,
  maxPerDay: 500,
} as const

/** One card on one day, in the order to review it. */
export interface PlannedReview {
  cardId: number
  deckId: number
  /** Recall just before this review, as the model expects it that day. */
  recallBefore: number
  /** This card's exam-day recall if this review is made and remembered. */
  examRecallAfter: number
  /** Gain from this review alone, on exam day. */
  gain: number
  /** 1 for the card's first review in the plan, 2 for its second, ... */
  nth: number
}

export interface PlanDay {
  /** UTC calendar date, YYYY-MM-DD. */
  date: string
  rest: boolean
  reviews: PlannedReview[]
  /** Mean exam-day recall over seen cards after this day's reviews, if every planned review so far is made and remembered. */
  meanExamRecallAfter: number
}

export interface PrepSummary {
  studyDays: number
  restDays: number
  plannedReviews: number
  distinctCards: number
  /** Mean exam-day recall if nothing more is reviewed. */
  baseline: number
  /** Mean exam-day recall if the whole plan is followed and every review is remembered. */
  planned: number
  /** Seen cards still below the target on exam day after the plan. */
  belowTarget: number
  seenCards: number
  unseenCards: number
  /** True when days ran out of capacity while reviews with gain >= minGain remained. */
  capacityBound: boolean
}

export interface PrepPlan {
  exam: string
  /** First study day (the day containing `now`). */
  from: string
  targetRecall: number
  days: PlanDay[]
  summary: PrepSummary
  confidence: ReadinessConfidence
  options: Required<Pick<PrepOptions, 'perDay' | 'minGain' | 'maxReviewsPerCard'>> & {
    restWeekdays: number[]
  }
  /** True when the exam date is today or past: there is nothing to plan. */
  expired: boolean
  assumptions: string[]
}

export const PREP_ASSUMPTIONS: readonly string[] = [
  'Recall figures are estimates from the FSRS memory model applied to your review history. They are not validated exam scores and carry no statistical interval.',
  'The schedule assumes every planned review is made on its day and answered Good. A lapse would change later days, and the plan is not re-forecast for you.',
  'Each day is filled greedily with the cards whose review lifts exam-day recall the most. This is a heuristic and not an optimal schedule.',
  'Figures measure recall on the exam day only. A review made earlier or later can show a slightly different number on that one day, so a smaller plan is not evidence of better learning.',
  'Study days run from today up to the day before the exam. A bare exam date counts through the end of that day (UTC).',
  'New cards you have not studied are counted separately and are not planned or treated as forgotten.',
  'Following the plan means doing real reviews, which change your card schedule. Nothing in this plan is applied for you.',
]

export type PrepCard = ReadinessCard
