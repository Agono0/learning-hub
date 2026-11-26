/** The audit: cards and recent reviews in, clusters with per-card suppression risk out. */
import { buildClusters, type ClusterOptions, type RifCluster } from './clusters'
import { RIF_DEFAULTS, type RifCard, type RifReview } from './cues'
import { clusterRisk, practiceCounts, type RifClusterRisk, type RifMemberRisk } from './risk'

export interface RifAuditOptions extends ClusterOptions {
  now?: Date
  windowDays?: number
  /** Card ids the learner has dismissed from the guard (e.g. a deliberate focus on one card). */
  dismissed?: ReadonlySet<number>
}

export interface RifAuditCluster {
  id: string
  sharedCue: string[]
  trimmed: boolean
  balance: number
  maxRisk: number
  members: (RifMemberRisk & { cue: string; target: string; dismissed: boolean })[]
}

export interface RifAudit {
  asOf: string
  windowDays: number
  scanned: number
  /** Cards that were part of a competitor cluster. */
  clustered: number
  truncatedScope: boolean
  clusters: RifAuditCluster[]
  atRisk: number
  watch: number
  meanRisk: number
}

/** Run the guard over a card set. Pure: the caller supplies reviews and the clock. */
export function runAudit(
  cards: RifCard[],
  reviews: RifReview[],
  opts: RifAuditOptions = {},
): RifAudit {
  const now = opts.now ?? new Date()
  const windowDays = opts.windowDays ?? RIF_DEFAULTS.windowDays
  const truncatedScope = cards.length > RIF_DEFAULTS.maxCards
  const scoped = truncatedScope ? cards.slice(0, RIF_DEFAULTS.maxCards) : cards
  const byId = new Map(scoped.map((c) => [c.id, c]))
  const counts = practiceCounts(reviews, now, windowDays)
  const clusters: RifCluster[] = buildClusters(scoped, opts)
  const dismissed = opts.dismissed ?? new Set<number>()

  const rows: RifAuditCluster[] = clusters.map((cl) => {
    const cr: RifClusterRisk = clusterRisk(cl, byId, counts, now)
    return {
      id: cl.id,
      sharedCue: cl.sharedCue,
      trimmed: cl.trimmed,
      balance: cr.balance,
      maxRisk: cr.maxRisk,
      members: cr.members
        .map((m) => ({
          ...m,
          cue: byId.get(m.cardId)!.cue,
          target: byId.get(m.cardId)!.target,
          dismissed: dismissed.has(m.cardId),
        }))
        .sort((p, q) => q.risk - p.risk || p.cardId - q.cardId),
    }
  })
  rows.sort((p, q) => q.maxRisk - p.maxRisk || p.id.localeCompare(q.id))

  const all = rows.flatMap((r) => r.members).filter((m) => !m.dismissed)
  return {
    asOf: now.toISOString(),
    windowDays,
    scanned: scoped.length,
    clustered: rows.reduce((s, r) => s + r.members.length, 0),
    truncatedScope,
    clusters: rows,
    atRisk: all.filter((m) => m.band === 'high').length,
    watch: all.filter((m) => m.band === 'watch').length,
    meanRisk: all.length
      ? Math.round((all.reduce((s, m) => s + m.risk, 0) / all.length) * 1000) / 1000
      : 0,
  }
}
