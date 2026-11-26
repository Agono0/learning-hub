/**
 * Does recall travel? For each card, its "home" context is where its first
 * reviews happened. Compare the success rate of later reviews at home with
 * later reviews elsewhere. A clearly lower success rate away from home is
 * evidence of context-bound memory. Because the comparison is within cards,
 * it is not confused by some cards simply being harder than others, but it is
 * still observational.
 */
import { CTX_DEFAULTS, round3, type ReviewContext } from './cues'
import { contextLabel, normalizedEntropy, wilson } from './stats'

export interface TransferResult {
  cardsCompared: number
  homeReviews: number
  awayReviews: number
  homeRate: number | null
  awayRate: number | null
  /** homeRate minus awayRate. Positive means worse away from home. */
  gap: number | null
  /** 95% interval on the gap (normal approximation on Wilson-centred rates). */
  gapLow: number | null
  gapHigh: number | null
  verdict: 'context-bound' | 'transfers' | 'insufficient'
}

export interface CardContextProfile {
  cardId: number
  reviews: number
  distinct: number
  entropy: number
  /** Share of reviews in the most common context. */
  topShare: number
  home: string
  bound: boolean
}

function byCard(rows: ReviewContext[]): Map<number, ReviewContext[]> {
  const m = new Map<number, ReviewContext[]>()
  for (const r of rows) {
    const list = m.get(r.cardId)
    if (list) list.push(r)
    else m.set(r.cardId, [r])
  }
  for (const list of m.values()) list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return m
}

/** Context spread per card (only cards with enough reviews). */
export function cardProfiles(
  rows: ReviewContext[],
  minReviews: number = CTX_DEFAULTS.minCardReviews,
  boundShare: number = CTX_DEFAULTS.boundShare,
): CardContextProfile[] {
  const out: CardContextProfile[] = []
  for (const [cardId, list] of byCard(rows)) {
    if (list.length < minReviews) continue
    const counts = new Map<string, number>()
    for (const r of list) counts.set(contextLabel(r), (counts.get(contextLabel(r)) ?? 0) + 1)
    const [home, top] = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]!
    const topShare = top / list.length
    out.push({
      cardId,
      reviews: list.length,
      distinct: counts.size,
      entropy: normalizedEntropy([...counts.values()]),
      topShare: round3(topShare),
      home,
      bound: topShare >= boundShare,
    })
  }
  return out.sort((a, b) => b.topShare - a.topShare || b.reviews - a.reviews || a.cardId - b.cardId)
}

/** Within-card home vs away comparison. The first two reviews of a card define its home and are not counted. */
export function transferGap(rows: ReviewContext[], minCardReviews = 4): TransferResult {
  let homeN = 0
  let homeS = 0
  let awayN = 0
  let awayS = 0
  let cards = 0
  for (const list of byCard(rows).values()) {
    if (list.length < minCardReviews) continue
    const setup = list.slice(0, 2)
    const counts = new Map<string, number>()
    for (const r of setup) counts.set(contextLabel(r), (counts.get(contextLabel(r)) ?? 0) + 1)
    const home = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]![0]
    let usedHome = false
    let usedAway = false
    for (const r of list.slice(2)) {
      if (contextLabel(r) === home) {
        homeN++
        if (r.success) homeS++
        usedHome = true
      } else {
        awayN++
        if (r.success) awayS++
        usedAway = true
      }
    }
    if (usedHome && usedAway) cards++
  }
  const empty: TransferResult = {
    cardsCompared: cards,
    homeReviews: homeN,
    awayReviews: awayN,
    homeRate: null,
    awayRate: null,
    gap: null,
    gapLow: null,
    gapHigh: null,
    verdict: 'insufficient',
  }
  if (homeN < 10 || awayN < 10 || cards < 3) return empty
  const h = homeS / homeN
  const a = awayS / awayN
  const wh = wilson(homeS, homeN)
  const wa = wilson(awayS, awayN)
  const gap = h - a
  const se = Math.sqrt(((wh.high - wh.low) / 3.92) ** 2 + ((wa.high - wa.low) / 3.92) ** 2)
  const low = gap - 1.96 * se
  const high = gap + 1.96 * se
  return {
    cardsCompared: cards,
    homeReviews: homeN,
    awayReviews: awayN,
    homeRate: round3(h),
    awayRate: round3(a),
    gap: round3(gap),
    gapLow: round3(low),
    gapHigh: round3(high),
    verdict: low > 0.03 ? 'context-bound' : 'transfers',
  }
}
