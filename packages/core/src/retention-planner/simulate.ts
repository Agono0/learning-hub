import { DefaultScheduler } from 'ts-fsrs'
import { parseFsrsWeights } from '../fsrs-optimizer'
import { calculateRetrievability, cardRowToFsrs, FSRS6_DEFAULT_DECAY } from '../fsrs'
import type { CardCoverage, PassMix, PlannerCard, PlannerOptions, TimingEstimate } from './model'
import { MAX_REVIEWS_PER_CARD } from './model'

const DAY_MS = 86_400_000

/** Small deterministic PRNG (mulberry32). */
export function seededRandom(seed: number): () => number {
  let s = seed | 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Only Review-state, non-suspended cards are simulated. Selection is every k-th
 * eligible card by id so it is reproducible and not biased by deck order.
 */
export function selectCards(
  cards: readonly PlannerCard[],
  maxCards: number,
): { picked: PlannerCard[]; coverage: CardCoverage } {
  const sorted = [...cards].sort((a, b) => a.id - b.id)
  const eligible = sorted.filter(
    (c) => c.state === 2 && !c.suspended && c.stability > 0 && !c.ownSettings,
  )
  const stride = eligible.length > maxCards ? Math.ceil(eligible.length / maxCards) : 1
  const picked = stride === 1 ? eligible : eligible.filter((_, i) => i % stride === 0)
  const live = sorted.filter((c) => !c.suspended)
  return {
    picked,
    coverage: {
      total: cards.length,
      eligible: eligible.length,
      simulated: picked.length,
      scaleUp: picked.length === 0 ? 1 : eligible.length / picked.length,
      excludedNew: live.filter((c) => c.state === 0).length,
      excludedLearning: live.filter((c) => c.state === 1).length,
      excludedRelearning: live.filter((c) => c.state === 3).length,
      excludedSuspended: sorted.length - live.length,
      excludedOwnSettings: live.filter((c) => c.state === 2 && c.stability > 0 && c.ownSettings)
        .length,
      selection: stride === 1 ? 'all-eligible' : 'every-kth-by-id',
      stride,
    },
  }
}

/** Conservative upper bound on scheduler calls for a run, used before simulating. */
export function preflightCalls(cardCount: number, gridLen: number, horizonDays: number): number {
  const perCard = Math.min(MAX_REVIEWS_PER_CARD, Math.ceil(horizonDays / 30) * 4 + 4)
  return cardCount * gridLen * perCard
}

export interface DayLoad {
  reviews: number
  minutes: number
}

export interface SimulationOutcome {
  retention: number
  days: DayLoad[]
  reviews: number
  lapses: number
  calls: number
  complete: boolean
}

export interface CallCounter {
  used: number
  max: number
}

/**
 * Simulate one retention for the picked cards over the horizon. Event-driven:
 * each card jumps from due date to due date. A pass or fail is drawn from the
 * model's recall probability at review time; the history only supplies the
 * pass-grade mix and review time. Returns early with complete=false when the
 * shared call counter is exhausted.
 */
export function normalizeWeights(weights: readonly number[] | null): number[] | null {
  if (!weights || weights.length === 0) return null
  try {
    return parseFsrsWeights([...weights])
  } catch {
    return null
  }
}

export async function simulateRetention(args: {
  cards: readonly PlannerCard[]
  retention: number
  weights: readonly number[] | null
  options: Pick<PlannerOptions, 'horizonDays' | 'seed'>
  mix: PassMix
  timing: TimingEstimate
  now: Date
  counter: CallCounter
}): Promise<SimulationOutcome> {
  const { cards, retention, weights, options, mix, timing, now, counter } = args
  // Migrate 17/19-value vectors to 21 once, so the scheduler and the recall
  // draw below read the same decay. Unparseable weights fall back to defaults.
  const w = normalizeWeights(weights)
  const sched = await DefaultScheduler({
    version: 'FSRS-6',
    desiredRetention: retention,
    weights: w ?? undefined,
    enableShortTerm: true,
  })
  const decay = w ? w[20]! : FSRS6_DEFAULT_DECAY
  const days: DayLoad[] = Array.from({ length: options.horizonDays }, () => ({
    reviews: 0,
    minutes: 0,
  }))
  const start = Math.floor(now.getTime() / DAY_MS) * DAY_MS
  let reviews = 0
  let lapses = 0
  const passEasy = mix.easy
  const passHard = mix.hard
  for (const row of cards) {
    // Same random stream per card id across grid points keeps curves comparable.
    const cardRand = seededRandom(options.seed ^ (row.id * 2654435761))
    let card = cardRowToFsrs({
      id: row.id,
      stability: row.stability,
      difficulty: row.difficulty,
      due: row.due,
      lastReview: row.lastReview,
      state: row.state,
      reps: row.reps,
      lapses: row.lapses,
      scheduledDays: row.scheduledDays,
      learningStep: row.learningStep,
    } as Parameters<typeof cardRowToFsrs>[0])
    let guard = 0
    while (guard++ < MAX_REVIEWS_PER_CARD) {
      // Overdue cards are reviewed on the first simulated day.
      const dueMs = Math.max(card.dueAt.getTime(), now.getTime())
      const dayIndex = Math.floor((dueMs - start) / DAY_MS)
      if (dayIndex >= options.horizonDays) break
      if (counter.used >= counter.max) {
        return { retention, days, reviews, lapses, calls: counter.used, complete: false }
      }
      const reviewAt = new Date(dueMs)
      const last = card.lastReviewAt ? card.lastReviewAt.getTime() : reviewAt.getTime()
      const elapsed = Math.max(0, (reviewAt.getTime() - last) / DAY_MS)
      const recall = calculateRetrievability(card.stability, elapsed, decay)
      let grade: 1 | 2 | 3 | 4
      if (cardRand() >= recall) grade = 1
      else {
        const u = cardRand()
        grade = u < passHard ? 2 : u < passHard + passEasy ? 4 : 3
      }
      counter.used++
      card = sched.review({ card: card as never, grade, now: reviewAt }).card as typeof card
      const load = days[dayIndex]!
      load.reviews++
      load.minutes += timing.secondsByRating[grade - 1]! / 60
      reviews++
      if (grade === 1) lapses++
    }
  }
  return { retention, days, reviews, lapses, calls: counter.used, complete: true }
}
