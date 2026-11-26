/**
 * Targeted study sessions: choose a bounded set of cards by what they are
 * (deck, tags, state, lapses, due window, estimated recall) and open exactly
 * that list in the review queue.
 *
 * Nothing here writes. Picking cards does not schedule, answer or change
 * anything. Reviews that follow are made by the learner in the normal queue.
 */

/** FSRS card state: 0 New, 1 Learning, 2 Review, 3 Relearning. */
export type StudyState = 0 | 1 | 2 | 3

export const SESSION_SORTS = ['most-overdue', 'lowest-recall', 'most-lapses', 'newest'] as const
export type SessionSort = (typeof SESSION_SORTS)[number]

export const STUDY_SESSION_LIMITS = {
  /** Most cards one session may hold. Equals the review queue's explicit-list cap, so Start never truncates. */
  maxCards: 100,
  defaultLimit: 20,
  maxDecks: 50,
  maxTags: 10,
  maxTagLength: 60,
  maxDueDays: 365,
  maxLapses: 1000,
  /** Most cards the selector will scan. Past this the request is refused, never sampled. */
  maxScan: 50_000,
} as const

/** FSRS-6 decay lives at index 20 of a 21-value weight set. Anything else (or an out-of-range value) means "use the default". */
export function decayFromWeights(weights: readonly number[] | null | undefined): number | null {
  if (!weights || weights.length !== 21) return null
  const d = weights[20]!
  return Number.isFinite(d) && d >= 0.1 && d <= 0.8 ? d : null
}

export interface StudySessionFilter {
  /** Only cards in these decks. */
  deckIds?: number[]
  /** A card must carry every one of these tags (exact match, like the card browser). */
  tags?: string[]
  /** Only these FSRS states. */
  states?: StudyState[]
  minLapses?: number
  maxLapses?: number
  /** Only cards whose estimated recall right now is below this (0.01-0.99). Drops cards with no estimate. */
  recallBelow?: number
  /** Only cards due within this many days from now (0 = due now or overdue). */
  dueByDays?: number
  sort: SessionSort
  limit: number
}

/** The card columns the selector reads. No card content: labels are fetched later for the picked cards only. */
export interface SessionCardRow {
  id: number
  deckId: number
  tags: readonly string[]
  state: number
  due: string
  stability: number
  lapses: number
  lastReview: string | null
  /** Forgetting-curve decay from the card's own FSRS weights (deck weights, else global), or null for the default. */
  decay?: number | null
  suspended: boolean
  buryUntil: string | null
  createdAt: string
}

export interface FunnelStep {
  key: 'eligible' | 'deck' | 'tags' | 'states' | 'lapses' | 'due' | 'recall'
  label: string
  /** Cards still matching after this step and every step before it. */
  count: number
}

export interface SessionPick {
  id: number
  deckId: number
  state: number
  lapses: number
  due: string
  /** Days from now until due. Negative means overdue. */
  dueInDays: number
  /** Estimated recall now, 0-1, or null when the model has no estimate for this card. */
  recall: number | null
  tags: string[]
}

export interface SessionSelection {
  asOf: string
  scanned: number
  excluded: {
    suspended: number
    buried: number
    /** Cards whose due date could not be read. */
    unreadableDue: number
  }
  funnel: FunnelStep[]
  /** Cards matching every filter, before the limit. */
  matched: number
  /** The session: at most `limit` cards, in review order. */
  selected: SessionPick[]
  /** True when more cards matched than the limit allows. The rest are left out, not dropped by mistake. */
  truncated: boolean
  /** Hash of the ordered ids. If it changes between preview and Start, the set changed. */
  fingerprint: string
  /** Cards dropped by the recall filter because the model has no estimate for them. */
  noRecallEstimate: number
  /** Cards with a recall estimate, split by which forgetting-curve decay produced it. */
  decaySource: { custom: number; default: number }
  assumptions: string[]
}

type Parsed = { ok: true; filter: StudySessionFilter } | { ok: false; error: string }

const KEYS = new Set([
  'deckIds',
  'tags',
  'states',
  'minLapses',
  'maxLapses',
  'recallBelow',
  'dueByDays',
  'sort',
  'limit',
])

function intIn(v: unknown, min: number, max: number): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : null
}

function list<T>(v: unknown, max: number, item: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > max) return null
  const out: T[] = []
  for (const x of v) {
    const r = item(x)
    if (r === null) return null
    out.push(r)
  }
  return new Set(out).size === out.length ? out : null
}

/**
 * Validate a filter. Strict on purpose: an unknown key, a wrong type, an
 * out-of-range value or an empty list is an error, never silently dropped or
 * clamped, so a typo cannot quietly widen a session.
 */
export function parseStudySessionFilter(input: unknown): Parsed {
  if (input === null || typeof input !== 'object' || Array.isArray(input))
    return { ok: false, error: 'filter must be an object' }
  const o = input as Record<string, unknown>
  for (const k of Object.keys(o))
    if (!KEYS.has(k)) return { ok: false, error: `unknown filter: ${k}` }
  const L = STUDY_SESSION_LIMITS
  const f: StudySessionFilter = { sort: 'most-overdue', limit: L.defaultLimit }

  if (o.deckIds !== undefined) {
    const v = list(o.deckIds, L.maxDecks, (x) => intIn(x, 1, Number.MAX_SAFE_INTEGER))
    if (!v)
      return { ok: false, error: `deckIds must be 1-${L.maxDecks} distinct positive integers` }
    f.deckIds = v
  }
  if (o.tags !== undefined) {
    const v = list(o.tags, L.maxTags, (x) =>
      typeof x === 'string' && x.trim() && x.trim().length <= L.maxTagLength ? x.trim() : null,
    )
    if (!v) return { ok: false, error: `tags must be 1-${L.maxTags} distinct non-empty tags` }
    f.tags = v
  }
  if (o.states !== undefined) {
    const v = list(o.states, 4, (x) => intIn(x, 0, 3))
    if (!v) return { ok: false, error: 'states must be distinct values from 0 to 3' }
    f.states = v as StudyState[]
  }
  if (o.minLapses !== undefined) {
    const v = intIn(o.minLapses, 0, L.maxLapses)
    if (v === null) return { ok: false, error: `minLapses must be an integer 0-${L.maxLapses}` }
    f.minLapses = v
  }
  if (o.maxLapses !== undefined) {
    const v = intIn(o.maxLapses, 0, L.maxLapses)
    if (v === null) return { ok: false, error: `maxLapses must be an integer 0-${L.maxLapses}` }
    f.maxLapses = v
  }
  if (f.minLapses !== undefined && f.maxLapses !== undefined && f.minLapses > f.maxLapses)
    return { ok: false, error: 'minLapses is above maxLapses' }
  if (o.recallBelow !== undefined) {
    const v = o.recallBelow
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0.01 || v > 0.99)
      return { ok: false, error: 'recallBelow must be a number from 0.01 to 0.99' }
    f.recallBelow = v
  }
  if (o.dueByDays !== undefined) {
    const v = intIn(o.dueByDays, 0, L.maxDueDays)
    if (v === null) return { ok: false, error: `dueByDays must be an integer 0-${L.maxDueDays}` }
    f.dueByDays = v
  }
  if (o.sort !== undefined) {
    if (typeof o.sort !== 'string' || !(SESSION_SORTS as readonly string[]).includes(o.sort))
      return { ok: false, error: `sort must be one of ${SESSION_SORTS.join(', ')}` }
    f.sort = o.sort as SessionSort
  }
  if (o.limit !== undefined) {
    const v = intIn(o.limit, 1, L.maxCards)
    if (v === null) return { ok: false, error: `limit must be an integer 1-${L.maxCards}` }
    f.limit = v
  }
  return { ok: true, filter: f }
}
