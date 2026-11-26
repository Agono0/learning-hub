/**
 * Does recall travel? For each card, its "home" context is where its first
 * reviews happened. Compare the success rate of later reviews at home with
 * later reviews elsewhere. A clearly lower success rate away from home is
 * evidence of context-bound memory. Because the comparison is within cards,
 * it is not confused by some cards simply being harder than others, but it is
 * still observational.
 */
import { CTX_DEFAULTS, UNLOGGED, round3, type ReviewContext } from './cues'
import { contextLabel, normalizedEntropy } from './stats'

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
  verdict: 'context-bound' | 'transfers' | 'inconclusive' | 'insufficient'
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

/** Cards seen both at home and away needed before the card-level resampling means anything. */
export const MIN_CARDS = 6
/** Smallest gap worth acting on. The interval must clear it for "context-bound" and sit under it for "transfers". */
export const GAP_THRESHOLD = 0.03
const BOOTSTRAP_RESAMPLES = 500

/** Small deterministic PRNG so the same data always gives the same interval. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface CardTally {
  homeN: number
  homeS: number
  awayN: number
  awayS: number
}

/**
 * Within-card home vs away comparison.
 *
 * Home is the place and time-of-day bucket held by a card's first two reviews
 * (ties go to the alphabetically first label); those two reviews define home
 * and are not counted. Reviews outside any logged session carry no place, so
 * they are left out: counting them as "away" would invent a gap.
 *
 * Reviews of one card are not independent, so the interval resamples whole
 * cards (a percentile bootstrap, 500 draws, fixed seed) instead of treating
 * every review as its own observation. It is still an observational comparison.
 */
export function transferGap(rows: ReviewContext[], minCardReviews = 4): TransferResult {
  const tallies: CardTally[] = []
  let homeN = 0
  let homeS = 0
  let awayN = 0
  let awayS = 0
  let cards = 0
  for (const list of byCard(rows.filter((r) => r.place !== UNLOGGED)).values()) {
    if (list.length < minCardReviews) continue
    const setup = list.slice(0, 2)
    const counts = new Map<string, number>()
    for (const r of setup) counts.set(contextLabel(r), (counts.get(contextLabel(r)) ?? 0) + 1)
    const home = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )[0]![0]
    const t: CardTally = { homeN: 0, homeS: 0, awayN: 0, awayS: 0 }
    for (const r of list.slice(2)) {
      if (contextLabel(r) === home) {
        t.homeN++
        if (r.success) t.homeS++
      } else {
        t.awayN++
        if (r.success) t.awayS++
      }
    }
    homeN += t.homeN
    homeS += t.homeS
    awayN += t.awayN
    awayS += t.awayS
    if (t.homeN > 0 && t.awayN > 0) {
      cards++
      tallies.push(t)
    }
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
  if (homeN < 10 || awayN < 10 || cards < MIN_CARDS) return empty
  const gapOf = (list: CardTally[]): number | null => {
    let hn = 0
    let hs = 0
    let an = 0
    let as = 0
    for (const t of list) {
      hn += t.homeN
      hs += t.homeS
      an += t.awayN
      as += t.awayS
    }
    return hn > 0 && an > 0 ? hs / hn - as / an : null
  }
  const gap = homeS / homeN - awayS / awayN
  // Only cards seen both at home and away carry the comparison, so only they are resampled.
  const rand = mulberry32(0x5eed + cards * 31 + homeN)
  const draws: number[] = []
  for (let i = 0; i < BOOTSTRAP_RESAMPLES; i++) {
    const pick: CardTally[] = []
    for (let k = 0; k < tallies.length; k++)
      pick.push(tallies[Math.floor(rand() * tallies.length)]!)
    const g = gapOf(pick)
    if (g !== null) draws.push(g)
  }
  draws.sort((x, y) => x - y)
  const q = (p: number) =>
    draws[Math.min(draws.length - 1, Math.max(0, Math.floor(p * draws.length)))] ?? gap
  const low = Math.min(q(0.025), gap)
  const high = Math.max(q(0.975), gap)
  return {
    cardsCompared: cards,
    homeReviews: homeN,
    awayReviews: awayN,
    homeRate: round3(homeS / homeN),
    awayRate: round3(awayS / awayN),
    gap: round3(gap),
    gapLow: round3(low),
    gapHigh: round3(high),
    verdict:
      low > GAP_THRESHOLD ? 'context-bound' : high < GAP_THRESHOLD ? 'transfers' : 'inconclusive',
  }
}
