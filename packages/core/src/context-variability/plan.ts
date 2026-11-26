/**
 * Acting on the numbers: where to review a context-bound card next, how
 * familiar the learner is with the place they must perform in, and a short
 * mental-reinstatement script for when they cannot go there (Smith 1979).
 */
import {
  CTX_DEFAULTS,
  bucketOfHour,
  clamp01,
  round3,
  UNLOGGED,
  type CtxGoal,
  type ReviewContext,
  type TimeBucket,
} from './cues'
import type { CardContextProfile } from './transfer'

const BUCKETS: TimeBucket[] = ['morning', 'afternoon', 'evening', 'late', 'night']

export interface ContextSuggestion {
  place: string | null
  bucket: TimeBucket | null
  why: string
}

/**
 * A different context for one card. Prefers a logged place the card has not
 * been reviewed in (least used overall first), otherwise a different time of
 * day, otherwise a plain "change room or hour" instruction.
 */
export function suggestContext(
  profile: CardContextProfile,
  rows: ReviewContext[],
  loggedPlaces: readonly string[],
): ContextSuggestion {
  const [homePlace = UNLOGGED, homeBucket = ''] = profile.home.split('|')
  const used = new Set(rows.filter((r) => r.cardId === profile.cardId).map((r) => r.place))
  const placeUse = new Map<string, number>()
  for (const r of rows) placeUse.set(r.place, (placeUse.get(r.place) ?? 0) + 1)
  const unusedPlaces = loggedPlaces
    .filter((p) => p !== homePlace && !used.has(p))
    .sort((a, b) => (placeUse.get(a) ?? 0) - (placeUse.get(b) ?? 0) || a.localeCompare(b))
  const otherBucket = BUCKETS.find((b) => b !== homeBucket) ?? null
  if (unusedPlaces.length > 0) {
    return {
      place: unusedPlaces[0]!,
      bucket: otherBucket,
      why: `This card has been reviewed almost only at "${homePlace}" in the ${homeBucket}. Try it at "${unusedPlaces[0]}".`,
    }
  }
  const usedBuckets = new Set(
    rows.filter((r) => r.cardId === profile.cardId).map((r) => r.bucket as string),
  )
  const freshBucket = BUCKETS.find((b) => !usedBuckets.has(b)) ?? otherBucket
  if (freshBucket) {
    return {
      place: null,
      bucket: freshBucket,
      why: `No other place is logged. Try this card in the ${freshBucket} instead of the ${homeBucket}.`,
    }
  }
  return { place: null, bucket: null, why: 'Change the room or the hour for the next review.' }
}

export interface GoalReadiness {
  goalId: number
  label: string
  place: string
  window: string
  reviews: number
  /** Reviews at the goal place inside the goal hours. */
  matched: number
  /** Share of all reviews that match both place and hours. */
  matchShare: number
  /** Share of reviews at the goal place at any hour. */
  placeShare: number
  /** Share of reviews inside the goal hours anywhere. */
  hourShare: number
  status: 'familiar' | 'partial' | 'unfamiliar'
  /** More matching reviews needed to reach the familiar level at the current volume (0 if already there). */
  reviewsToFamiliar: number
  /** Mental-reinstatement script for when the real place is out of reach. */
  reinstatement: string[]
}

export const GOAL_FAMILIAR = 0.25
export const GOAL_PARTIAL = 0.1

/** True when `hour` falls in [start, end). Windows that wrap midnight are allowed (start > end). */
export function inWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return false
  return start < end ? hour >= start && hour < end : hour >= start || hour < end
}

const pad = (h: number) => `${String(h % 24).padStart(2, '0')}:00`

/** How much of the learner's practice happened where and when they must perform. */
export function goalReadiness(goal: CtxGoal, rows: ReviewContext[]): GoalReadiness {
  const total = rows.length
  let matched = 0
  let atPlace = 0
  let inHours = 0
  for (const r of rows) {
    const p = r.place === goal.place
    const h = inWindow(r.hour, goal.startHour, goal.endHour)
    if (p) atPlace++
    if (h) inHours++
    if (p && h) matched++
  }
  const share = total ? matched / total : 0
  const need =
    share >= GOAL_FAMILIAR || total === 0
      ? 0
      : Math.ceil((GOAL_FAMILIAR * total - matched) / (1 - GOAL_FAMILIAR))
  const window = `${pad(goal.startHour)} to ${pad(goal.endHour)}`
  const lines = [
    `Close your eyes and picture ${goal.place} at ${window}: the room, the light, where you sit.`,
    goal.noise
      ? `Hear it: ${goal.noise === 'quiet' ? 'near silence' : goal.noise === 'loud' ? 'plenty of background noise' : 'some background sound'}.`
      : 'Notice the sounds you expect there.',
    'Name three small details of the setting, then answer your cards as if you were sitting there.',
  ]
  return {
    goalId: goal.id,
    label: goal.label,
    place: goal.place,
    window,
    reviews: total,
    matched,
    matchShare: round3(clamp01(share)),
    placeShare: round3(total ? atPlace / total : 0),
    hourShare: round3(total ? inHours / total : 0),
    status: share >= GOAL_FAMILIAR ? 'familiar' : share >= GOAL_PARTIAL ? 'partial' : 'unfamiliar',
    reviewsToFamiliar: need,
    reinstatement: lines,
  }
}

/** Convenience for callers that only have an hour. */
export const bucketLabel = bucketOfHour

export const PLAN_LIMITS = { maxSuggestions: 20, minGroup: CTX_DEFAULTS.minGroup } as const
