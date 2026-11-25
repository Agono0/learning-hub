import type { PlannerCard, PlannerInput, PlannerReview } from '../src/retention-planner'

export const NOW = new Date('2026-06-01T12:00:00.000Z')

/** Deterministic Review-state cards spread over a realistic stability range. */
export function makeCards(n: number, extra: Partial<PlannerCard> = {}): PlannerCard[] {
  return Array.from({ length: n }, (_, i) => {
    const stability = 2 + ((i * 37) % 120)
    const lastDays = 1 + ((i * 13) % Math.ceil(stability))
    const last = new Date(NOW.getTime() - lastDays * 86_400_000)
    const due = new Date(last.getTime() + stability * 86_400_000)
    return {
      id: i + 1,
      deckId: 1 + (i % 3),
      state: 2,
      suspended: false,
      stability,
      difficulty: 3 + ((i * 7) % 6),
      due: due.toISOString(),
      lastReview: last.toISOString(),
      scheduledDays: Math.round(stability),
      reps: 5,
      lapses: i % 4,
      learningStep: 0,
      ...extra,
    }
  })
}

export function makeReviews(
  n: number,
  timeMs = (i: number) => 4000 + ((i * 311) % 9000),
): PlannerReview[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 1_700_000_000_000 + i * 60_000,
    cardId: 1 + (i % 50),
    rating: (i % 10 === 0 ? 1 : i % 7 === 0 ? 2 : i % 5 === 0 ? 4 : 3) as 1 | 2 | 3 | 4,
    reviewedAt: new Date(1_700_000_000_000 + (i * 86_400_000) / 4).toISOString(),
    elapsedDays: i < 50 ? 0 : 1 + (i % 20),
    timeMs: timeMs(i),
  }))
}

export function makeInput(
  cards: PlannerCard[],
  reviews: PlannerReview[] = makeReviews(300),
): PlannerInput {
  return { cards, reviews, weights: null, currentRetention: 0.9, currentSource: 'global', now: NOW }
}
