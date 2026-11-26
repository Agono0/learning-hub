/**
 * Retention Planner: types and hard bounds.
 *
 * Question answered: under a stated model, how many daily review minutes do
 * my existing Review-state cards cost at each tested desired retention?
 * It never claims a learning-optimal retention.
 */

export const MIN_RETENTION = 0.7
export const MAX_RETENTION = 0.97
export const MIN_GRID_POINTS = 2
export const MAX_GRID_POINTS = 12
export const MIN_HORIZON_DAYS = 14
export const MAX_HORIZON_DAYS = 365
export const DEFAULT_HORIZON_DAYS = 90
export const MIN_BUDGET_MINUTES = 1
export const MAX_BUDGET_MINUTES = 600
/** Most cards ever simulated in one run. Above this a deterministic sample is used. */
export const MAX_SIMULATED_CARDS = 5000
export const DEFAULT_SIMULATED_CARDS = 1500
/** Absolute read ceiling for cards loaded from the database. */
export const MAX_CARDS_READ = 50_000
/** Hard ceiling on scheduler calls across grid x cards x events in one run. */
export const MAX_SCHEDULER_CALLS = 400_000
/** One card can never produce more than this many simulated reviews. */
export const MAX_REVIEWS_PER_CARD = 400
export const DEFAULT_GRID: readonly number[] = [0.8, 0.85, 0.9, 0.93, 0.95, 0.97]
export const DEFAULT_SEED = 20260101

/** Preflight upper-bound review count per card per day-of-horizon at retention r. */
export const PREFLIGHT_REVIEWS_PER_CARD_PER_30_DAYS = 4

export interface PlannerCard {
  id: number
  deckId: number
  /** FSRS state: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number
  suspended: boolean
  stability: number
  difficulty: number
  due: string
  lastReview: string | null
  scheduledDays: number
  reps: number
  lapses: number
  learningStep: number
  /** Deck has its own retention or weights, so the global setting does not govern this card. */
  ownSettings?: boolean
}

export interface PlannerReview {
  id: number
  cardId: number
  rating: 1 | 2 | 3 | 4
  reviewedAt: string
  elapsedDays: number
  timeMs: number
}

export interface PlannerInput {
  cards: readonly PlannerCard[]
  /** Active (non-undone) revlog, oldest first. */
  reviews: readonly PlannerReview[]
  weights: readonly number[] | null
  /** Retention currently in force for the chosen scope, and where it comes from. */
  currentRetention: number
  currentSource: 'deck' | 'global'
  now: Date
  /** null = every deck (global scope). A number = that deck only. */
  deckId?: number | null
}

export interface PlannerOptions {
  grid: readonly number[]
  horizonDays: number
  budgetMinutes: number
  maxCards: number
  seed: number
  maxCalls: number
}

export interface CardCoverage {
  total: number
  eligible: number
  simulated: number
  scaleUp: number
  excludedNew: number
  excludedLearning: number
  excludedRelearning: number
  excludedSuspended: number
  /** Review-state cards in decks with their own retention or weights (global scope only). */
  excludedOwnSettings: number
  selection: 'all-eligible' | 'every-kth-by-id'
  stride: number
}

export type TimingSource = 'per-rating-median' | 'overall-median' | 'default'

export interface TimingEstimate {
  source: TimingSource
  /** Seconds per review for ratings 1..4. */
  secondsByRating: [number, number, number, number]
  secondsOverall: number
  usable: number
  considered: number
  coverage: number
  note: string
}

export interface PassMix {
  hard: number
  good: number
  easy: number
  /** Passing reviews the mix is derived from. */
  n: number
  source: 'history' | 'default'
}

export interface GridPoint {
  retention: number
  reviews: number
  /** Scaled to the whole eligible set. */
  meanDailyReviews: number
  meanDailyMinutes: number
  peakDailyMinutes: number
  /** Share of simulated reviews that failed (model-drawn). */
  lapseShare: number
  fitsBudget: boolean
}

export interface Calibration {
  heldOutReviews: number
  scored: number
  activeLogLoss: number | null
  activeRmse: number | null
  defaultLogLoss: number | null
  defaultRmse: number | null
  usingCustomWeights: boolean
  note: string
}

export type PlannerStatus = 'ok' | 'incomplete' | 'no-eligible-cards' | 'rejected'

export interface PlannerResult {
  status: PlannerStatus
  message: string
  asOf: string
  currentRetention: number
  currentSource: 'deck' | 'global'
  weights: 'custom' | 'default'
  horizonDays: number
  budgetMinutes: number
  seed: number
  scope: 'all-decks' | 'deck'
  /** Hash of the inputs this run read (retention, weights, cards, review count). Lets a caller detect staleness. */
  fingerprint: string
  coverage: CardCoverage
  timing: TimingEstimate
  passMix: PassMix
  grid: GridPoint[]
  schedulerCalls: number
  maxCalls: number
  /** Highest tested retention within the budget. Null unless the whole grid finished. */
  recommendation: { retention: number; basis: string } | null
  calibration: Calibration
}
