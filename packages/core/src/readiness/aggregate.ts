import {
  MIN_USEFUL_REPS,
  type CardForecast,
  type Confidence,
  type GroupReadiness,
  type ReadinessCard,
} from './model'

const mean = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length

/** Round to 3 places so reports are stable and easy to compare in tests. */
export const round3 = (n: number): number => Math.round(n * 1000) / 1000

/**
 * Roll forecasts up into one group. Recall averages use SEEN cards only, so a
 * large unopened deck lowers `seen` coverage, not the recall figure. The UI
 * must show `unseen` next to the recall so the two are never confused.
 */
export function summarizeGroup(
  key: string,
  label: string,
  forecasts: readonly CardForecast[],
  targetRecall: number,
): GroupReadiness {
  const seen = forecasts.filter((f) => !f.unseen)
  return {
    key,
    label,
    cards: forecasts.length,
    unseen: forecasts.length - seen.length,
    baselineRecall: round3(mean(seen.map((f) => f.baseline))),
    plannedRecall: round3(mean(seen.map((f) => f.planned))),
    atTarget:
      seen.length === 0
        ? 0
        : round3(seen.filter((f) => f.planned >= targetRecall).length / seen.length),
  }
}

/** Group forecasts by a numeric key (deck id or skill id); null keys are skipped. */
export function groupBy(
  forecasts: readonly CardForecast[],
  pick: (f: CardForecast) => number | null,
  label: (key: number) => string,
  targetRecall: number,
): GroupReadiness[] {
  const buckets = new Map<number, CardForecast[]>()
  for (const f of forecasts) {
    const k = pick(f)
    if (k === null) continue
    const list = buckets.get(k)
    if (list) list.push(f)
    else buckets.set(k, [f])
  }
  return [...buckets.entries()]
    .map(([k, list]) => summarizeGroup(String(k), label(k), list, targetRecall))
    .sort((a, b) => a.plannedRecall - b.plannedRecall || a.key.localeCompare(b.key))
}

/**
 * Data sufficiency, from the number of seen cards and how many have been
 * reviewed enough times for FSRS stability to be meaningful. Thresholds are
 * plain product choices, stated in the reason text.
 */
export function assessConfidence(cards: readonly ReadinessCard[]): Confidence {
  const live = cards.filter((c) => !c.suspended)
  const seen = live.filter((c) => c.state !== 0 && c.stability > 0 && c.lastReview !== null)
  const established = seen.filter((c) => c.reps >= MIN_USEFUL_REPS).length
  const share = seen.length === 0 ? 0 : round3(established / seen.length)
  const base = { seenCards: seen.length, wellEstablished: share }
  if (seen.length < 20) {
    return {
      ...base,
      level: 'insufficient',
      reason: `Only ${seen.length} cards have been studied. Study at least 20 before trusting a forecast.`,
    }
  }
  if (share < 0.4) {
    return {
      ...base,
      level: 'low',
      reason: 'Most studied cards have fewer than 2 reviews, so their memory estimates are rough.',
    }
  }
  if (share < 0.75 || seen.length < 100) {
    return {
      ...base,
      level: 'moderate',
      reason:
        'A fair amount of history, but the estimate is still model-based, not a measured result.',
    }
  }
  return {
    ...base,
    level: 'good',
    reason:
      'Plenty of review history. The figures are still model estimates, not a validated exam prediction.',
  }
}
