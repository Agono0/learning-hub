/**
 * Exam readiness model: shared types for predicting how much of a learner's
 * card memory will still be recalled on a target date. Pure, no db import.
 */

/** The slice of a `cards` row the forecast needs (rows satisfy this structurally). */
export interface ReadinessCard {
  id: number
  deckId: number
  skillId: number | null
  /** 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number
  stability: number
  difficulty: number
  scheduledDays: number
  learningStep: number
  reps: number
  lapses: number
  due: string
  lastReview: string | null
  suspended: boolean
}

/** A target the learner is working toward. */
export interface ExamTarget {
  title: string
  /** ISO date or timestamp of the exam. */
  date: string
  courseId?: number | null
}

/** How reviews between now and the exam are assumed to happen. */
export type ReviewPlan =
  /** No reviews at all: the "if I stop today" baseline. */
  | { kind: 'none' }
  /** Every card is reviewed on the day it falls due, graded Good. */
  | { kind: 'on-schedule' }
  /** At most `perDay` reviews a day, most-forgotten cards first. */
  | { kind: 'capacity'; perDay: number }

export const DEFAULT_TARGET_RECALL = 0.85
export const MIN_USEFUL_REPS = 2
export const MS_PER_DAY = 86_400_000

/** Predicted recall for one card on the exam date. */
export interface CardForecast {
  cardId: number
  deckId: number
  skillId: number | null
  /** Recall probability on the exam date if nothing more is reviewed. */
  baseline: number
  /** Recall probability on the exam date under the chosen review plan. */
  planned: number
  /** True when the card has never been studied, so recall is unknown rather than low. */
  unseen: boolean
}

/** Roll-up of card forecasts for a group (overall, a deck, a skill). */
export interface GroupReadiness {
  key: string
  label: string
  cards: number
  unseen: number
  baselineRecall: number
  plannedRecall: number
  /** Share of seen cards whose planned recall meets the target. */
  atTarget: number
}

export type ReadinessConfidenceLevel = 'insufficient' | 'low' | 'moderate' | 'good'

/**
 * How much study history the forecast stands on. This is a data-sufficiency
 * label, NOT a statistical confidence interval: no calibration against real
 * exam results exists, so none is claimed.
 */
export interface ReadinessConfidence {
  level: ReadinessConfidenceLevel
  /** Why the level was chosen, in plain words for the learner. */
  reason: string
  seenCards: number
  /** Share of seen cards with at least MIN_USEFUL_REPS reviews. */
  wellEstablished: number
}

export interface ReadinessReport {
  target: ExamTarget
  asOf: string
  daysLeft: number
  targetRecall: number
  plan: ReviewPlan
  overall: GroupReadiness
  decks: GroupReadiness[]
  skills: GroupReadiness[]
  confidence: ReadinessConfidence
  /** Plain-language limits of this forecast, to show next to the numbers. */
  assumptions: string[]
  /** True when the exam date is today or already past, so no review can help. */
  expired: boolean
}

/**
 * Limits that must be shown with every readiness report. The scenario is a
 * model run, not a prediction of what the learner will do or score.
 */
export const READINESS_ASSUMPTIONS: readonly string[] = [
  'Recall figures come from the FSRS memory model applied to your review history. They are estimates, not validated exam scores.',
  'The no-review baseline assumes you stop studying today.',
  'The review scenario assumes every scheduled review happens on the first day it is possible and is answered Good. It shows what the plan could do, not what will happen.',
  'Figures measure recall on the exam date only. A scenario with fewer or later reviews can show a slightly higher number on that one day while leaving you less prepared in between, so do not read a lower review count as better learning.',
  'New cards you have not studied are counted separately and are not treated as forgotten.',
]
