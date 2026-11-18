/**
 * Typed TanStack Query key factory — one place for the hot query keys, so
 * pages and components stop re-declaring ad-hoc string literals.
 *
 * Every entry produces EXACTLY the key literals/arrays already in use across
 * the app (bit-identical strings), so swapping `['decks']` for
 * `queryKeys.decks` is a pure refactor with no behavior change. Only shapes
 * that already exist in the codebase are modelled here — never invent keys.
 *
 * Style follows `curriculumKeys` in `./curriculum-api`: grouped object,
 * readonly (`as const`) tuples, invalidate the root key after any write.
 */

export const queryKeys = {
  /** Deck list (`/api/decks`) — invalidate after any deck write (create/edit/delete/mined cards). */
  decks: ['decks'] as const,

  /** User settings — invalidate after any settings write. */
  settings: ['settings'] as const,

  /** Dashboard aggregate — invalidate after any write that affects dashboard widgets. */
  dashboard: ['dashboard'] as const,

  /** Focus session state — invalidate after any focus write. */
  focus: ['focus'] as const,

  /** Notes — invalidate after any note write. */
  notes: ['notes'] as const,

  /** Quests — invalidate after any quest write. */
  quests: ['quests'] as const,

  /** Workload forecast/balancer — invalidate `workload.all` after any workload write. */
  workload: {
    /** Root key: invalidates every workload query when passed to `invalidateQueries`. */
    all: ['workload'] as const,
    /** Per-deck balancer view: `['workload', deckId]` (deckId omitted = all decks). */
    forDeck: (deckId?: number) => ['workload', deckId] as const,
    /** Forecast view: `['workload', days, deckId]` (`'all'` = every deck). */
    forecast: (days: number, deckId: number | 'all') => ['workload', days, deckId] as const,
  },
}
