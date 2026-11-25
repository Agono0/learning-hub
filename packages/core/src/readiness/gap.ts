import { DefaultScheduler } from 'ts-fsrs'
import { calculateRetrievability, cardRowToFsrs } from '../fsrs'
import { daysBetween, isSeen, recallAt, type SimulationOptions } from './forecast'
import { round3 } from './aggregate'
import type { ReadinessCard } from './model'

/** One card and how much a single hypothetical review today would raise its exam-day recall. */
export interface ReviewGain {
  cardId: number
  deckId: number
  skillId: number | null
  /** Recall on exam day if nothing more is reviewed. */
  baseline: number
  /** Recall on exam day if the card is reviewed once today and remembered (Good). */
  afterReview: number
  gain: number
}

/**
 * Rank cards by how much one review today would help on exam day.
 *
 * "Remembered" is an assumption, not a prediction: a lapse would behave
 * differently. The ranking answers "where does my time buy the most recall",
 * under that explicit assumption. Cards with no memory state are left out
 * because there is nothing to forecast for them.
 */
export async function rankReviewGains(
  cards: readonly ReadinessCard[],
  now: Date,
  exam: Date,
  opts: SimulationOptions = {},
): Promise<ReviewGain[]> {
  if (exam.getTime() <= now.getTime()) return []
  const sched = await DefaultScheduler({
    version: 'FSRS-6',
    desiredRetention: Math.max(0.5, Math.min(0.97, opts.desiredRetention ?? 0.9)),
    weights: opts.weights && opts.weights.length > 0 ? [...opts.weights] : undefined,
    enableShortTerm: true,
  })
  const out: ReviewGain[] = []
  for (const c of cards) {
    if (c.suspended || !isSeen(c)) continue
    const baseline = recallAt(c, exam)
    const reviewed = sched.review({ card: cardRowToFsrs(c) as never, grade: 3, now }).card
    const afterReview = calculateRetrievability(reviewed.stability, daysBetween(now, exam))
    out.push({
      cardId: c.id,
      deckId: c.deckId,
      skillId: c.skillId,
      baseline: round3(baseline),
      afterReview: round3(afterReview),
      gain: round3(Math.max(0, afterReview - baseline)),
    })
  }
  return out.sort((a, b) => b.gain - a.gain || a.cardId - b.cardId)
}

/** Result of spending a fixed review budget on the highest-gain cards. */
export interface ReviewBudgetPlan {
  budget: number
  chosen: ReviewGain[]
  /** Mean exam-day recall over seen cards before and after the chosen reviews. */
  before: number
  after: number
}

/**
 * Pick the `budget` best cards to review and report the mean-recall change.
 * Gains are independent per card, so a greedy pick is optimal here.
 */
export function planBudget(gains: readonly ReviewGain[], budget: number): ReviewBudgetPlan {
  const n = Math.max(0, Math.floor(budget))
  const chosen = gains.slice(0, n).filter((g) => g.gain > 0)
  const total = gains.length
  if (total === 0) return { budget: n, chosen: [], before: 0, after: 0 }
  const before = gains.reduce((s, g) => s + g.baseline, 0) / total
  const lift = chosen.reduce((s, g) => s + g.gain, 0) / total
  return { budget: n, chosen, before: round3(before), after: round3(Math.min(1, before + lift)) }
}

/** Smallest budget (in reviews) whose greedy plan reaches `target` mean recall, or null if none can. */
export function reviewsNeededFor(gains: readonly ReviewGain[], target: number): number | null {
  if (gains.length === 0) return null
  let sum = gains.reduce((s, g) => s + g.baseline, 0)
  const need = target * gains.length
  if (sum >= need) return 0
  for (let i = 0; i < gains.length; i++) {
    const g = gains[i]!
    if (g.gain <= 0) return null
    sum += g.gain
    if (sum >= need) return i + 1
  }
  return null
}
