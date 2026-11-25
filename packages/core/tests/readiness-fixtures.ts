import type { ReadinessCard } from '../src/readiness/model'

export const NOW = new Date('2026-11-01T12:00:00.000Z')
export const DAY = 86_400_000

export const iso = (offsetDays: number, from: Date = NOW): string =>
  new Date(from.getTime() + offsetDays * DAY).toISOString()

/** A reviewed card: last studied `ago` days before NOW, due `dueIn` days from NOW. */
export function seenCard(id: number, over: Partial<ReadinessCard> = {}): ReadinessCard {
  const stability = over.stability ?? 10
  return {
    id,
    deckId: 1,
    skillId: null,
    state: 2,
    stability,
    difficulty: 5,
    scheduledDays: Math.round(stability),
    learningStep: 0,
    reps: 4,
    lapses: 0,
    due: iso(Math.round(stability) - 3),
    lastReview: iso(-3),
    suspended: false,
    ...over,
  }
}

export function newCard(id: number, over: Partial<ReadinessCard> = {}): ReadinessCard {
  return {
    id,
    deckId: 1,
    skillId: null,
    state: 0,
    stability: 0,
    difficulty: 0,
    scheduledDays: 0,
    learningStep: 0,
    reps: 0,
    lapses: 0,
    due: iso(0),
    lastReview: null,
    suspended: false,
    ...over,
  }
}

/** A deterministic pseudo-random deck so invariants run over many shapes. */
export function mixedDeck(n: number, seed = 7): ReadinessCard[] {
  let s = seed
  const rnd = () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
  const out: ReadinessCard[] = []
  for (let i = 1; i <= n; i++) {
    const r = rnd()
    if (r < 0.15) out.push(newCard(i, { deckId: 1 + (i % 3) }))
    else {
      const stability = 1 + Math.floor(rnd() * 60)
      const ago = Math.floor(rnd() * 20)
      out.push(
        seenCard(i, {
          deckId: 1 + (i % 3),
          skillId: i % 4 === 0 ? null : 10 + (i % 4),
          stability,
          reps: 1 + Math.floor(rnd() * 8),
          lastReview: iso(-ago),
          due: iso(Math.round(stability) - ago),
          scheduledDays: Math.round(stability),
        }),
      )
    }
  }
  return out
}
