/**
 * Suppression risk per card.
 *
 * For a card X in a cluster, the risk of having been suppressed grows with how
 * much its competitors were successfully retrieved in the recent window (each
 * competitor counts up to a saturation point, weighted by how strongly it
 * competes), is cushioned by X's own recent practice, and matters more when X
 * is already fragile (low predicted retrievability).
 */
import { calculateRetrievability } from '../fsrs'
import { RIF_DEFAULTS, clamp01, type RifBand, type RifCard, type RifReview } from './cues'
import type { RifCluster } from './clusters'

export interface RifMemberRisk {
  cardId: number
  risk: number
  band: RifBand
  /** Successful (Good/Easy) retrievals in the window. */
  successes: number
  /** All reviews in the window. */
  reviews: number
  /** Weighted, saturated count of competitor retrievals. */
  competitorLoad: number
  /** Predicted retrievability now, 0 to 1. */
  retrievability: number
  /** The competitor contributing most to the load, or null. */
  topCompetitorId: number | null
  /** Practised (at least one success in the window) vs neglected. */
  practiced: boolean
}

export interface RifClusterRisk {
  clusterId: string
  members: RifMemberRisk[]
  /** 1 means practice is spread evenly across the cluster, 0 means one card takes all of it. */
  balance: number
  maxRisk: number
}

export function bandFor(risk: number): RifBand {
  if (risk >= RIF_DEFAULTS.highAt) return 'high'
  if (risk >= RIF_DEFAULTS.watchAt) return 'watch'
  return 'low'
}

const DAY = 86_400_000

/** Per-card review counts inside the window. */
export function practiceCounts(
  reviews: RifReview[],
  now: Date,
  windowDays: number,
): Map<number, { successes: number; reviews: number }> {
  const since = now.getTime() - windowDays * DAY
  const out = new Map<number, { successes: number; reviews: number }>()
  for (const r of reviews) {
    const t = Date.parse(r.reviewedAt)
    if (!Number.isFinite(t) || t < since || t > now.getTime()) continue
    const cur = out.get(r.cardId) ?? { successes: 0, reviews: 0 }
    cur.reviews += 1
    if (r.rating >= 3) cur.successes += 1
    out.set(r.cardId, cur)
  }
  return out
}

/** Predicted retrievability from stability and time since last review (1 for unreviewed cards: nothing to lose yet). */
export function retrievabilityOf(card: RifCard, now: Date): number {
  if (!card.lastReview || card.stability <= 0) return card.state === 0 ? 1 : 0.5
  const elapsed = (now.getTime() - Date.parse(card.lastReview)) / DAY
  return calculateRetrievability(card.stability, Math.max(0, elapsed))
}

/** Risk for every member of a cluster. */
export function clusterRisk(
  cluster: RifCluster,
  cards: Map<number, RifCard>,
  counts: Map<number, { successes: number; reviews: number }>,
  now: Date,
  saturation: number = RIF_DEFAULTS.saturation,
): RifClusterRisk {
  const sat = (n: number) => Math.min(n, saturation) / saturation
  const members: RifMemberRisk[] = []
  for (const id of cluster.cardIds) {
    const card = cards.get(id)
    if (!card) continue
    const own = counts.get(id) ?? { successes: 0, reviews: 0 }
    let load = 0
    let top: { id: number; v: number } | null = null
    for (const e of cluster.edges) {
      if (e.a !== id && e.b !== id) continue
      const other = e.a === id ? e.b : e.a
      const oc = counts.get(other)
      if (!oc) continue
      const v = e.strength * sat(oc.successes)
      load += v
      if (v > 0 && (!top || v > top.v)) top = { id: other, v }
    }
    const retrievability = retrievabilityOf(card, now)
    const exposure = 1 - Math.exp(-1.6 * load)
    const fragile = 0.4 + 0.6 * (1 - retrievability)
    const cushion = 1 - 0.7 * sat(own.successes)
    const risk = clamp01(exposure * fragile * cushion)
    members.push({
      cardId: id,
      risk: Math.round(risk * 1000) / 1000,
      band: bandFor(risk),
      successes: own.successes,
      reviews: own.reviews,
      competitorLoad: Math.round(load * 1000) / 1000,
      retrievability: Math.round(retrievability * 1000) / 1000,
      topCompetitorId: top?.id ?? null,
      practiced: own.successes > 0,
    })
  }
  return {
    clusterId: cluster.id,
    members,
    balance: balanceOf(members.map((m) => m.successes)),
    maxRisk: members.reduce((m, x) => Math.max(m, x.risk), 0),
  }
}

/** 1 minus the normalised mean absolute deviation: even practice scores near 1. */
export function balanceOf(values: number[]): number {
  if (values.length < 2) return 1
  const total = values.reduce((s, v) => s + v, 0)
  if (total === 0) return 1
  const mean = total / values.length
  const mad = values.reduce((s, v) => s + Math.abs(v - mean), 0) / values.length
  const worst = (2 * mean * (values.length - 1)) / values.length
  return Math.round(clamp01(1 - mad / worst) * 1000) / 1000
}
