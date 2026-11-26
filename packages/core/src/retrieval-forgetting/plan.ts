/**
 * Acting on the audit: a rescue queue for suppressed cards, session expansion
 * (balanced practice) and cluster-aware interleaving.
 *
 * Anderson et al. found suppression disappears when the neglected items are
 * tested with an independent cue and when practice covers the whole category,
 * so the plan offers both: bring neglected siblings into the session, and
 * probe them from the answer side.
 */
import type { RifAudit, RifAuditCluster } from './audit'
import type { RifCard } from './cues'

export interface RescueItem {
  cardId: number
  clusterId: string
  risk: number
  band: 'watch' | 'high'
  /** The practised sibling most likely to be crowding this card out. */
  crowdedBy: number | null
  /** Independent-cue probe: show the answer, ask for the cue. */
  reverseProbe: string
  reason: string
}

export interface RescueOptions {
  limit?: number
  /** Include 'watch' as well as 'high'. Default true. */
  includeWatch?: boolean
}

/** Most suppressed cards first, with one reason each. Dismissed cards are skipped. */
export function rescueQueue(audit: RifAudit, opts: RescueOptions = {}): RescueItem[] {
  const limit = Math.max(1, Math.min(200, opts.limit ?? 20))
  const includeWatch = opts.includeWatch ?? true
  const out: RescueItem[] = []
  for (const cl of audit.clusters) {
    for (const m of cl.members) {
      if (m.dismissed || m.band === 'low') continue
      if (m.band === 'watch' && !includeWatch) continue
      out.push({
        cardId: m.cardId,
        clusterId: cl.id,
        risk: m.risk,
        band: m.band,
        crowdedBy: m.topCompetitorId,
        reverseProbe: `Here is an answer: "${clip(m.target)}". What was the question or cue?`,
        reason: reasonFor(cl, m),
      })
    }
  }
  out.sort((p, q) => q.risk - p.risk || p.cardId - q.cardId)
  return out.slice(0, limit)
}

function reasonFor(cl: RifAuditCluster, m: RifAuditCluster['members'][number]): string {
  const cue = cl.sharedCue.length ? ` around "${cl.sharedCue.slice(0, 3).join(' ')}"` : ''
  const own =
    m.successes === 0
      ? 'you have not retrieved it lately'
      : `only ${m.successes} recent retrieval${m.successes === 1 ? '' : 's'}`
  return `Siblings${cue} were practised more than this card (${own}); its predicted recall is ${Math.round(m.retrievability * 100)}%.`
}

const clip = (s: string) => (s.length > 80 ? `${s.slice(0, 79)}…` : s)

export interface ExpandedSession {
  ids: number[]
  added: { cardId: number; becauseOf: number; clusterId: string }[]
}

/**
 * Balanced practice: when a due card belongs to a cluster, bring its suppressed
 * siblings along (up to `budget`), so the category is practised as a whole.
 */
export function expandSession(dueIds: number[], audit: RifAudit, budget = 5): ExpandedSession {
  const inSession = new Set(dueIds)
  const added: ExpandedSession['added'] = []
  const cap = Math.max(0, Math.min(50, budget))
  const candidates: { cardId: number; becauseOf: number; clusterId: string; risk: number }[] = []
  for (const cl of audit.clusters) {
    const trigger = cl.members.find((m) => inSession.has(m.cardId))
    if (!trigger) continue
    for (const m of cl.members) {
      if (inSession.has(m.cardId) || m.dismissed || m.band === 'low') continue
      candidates.push({
        cardId: m.cardId,
        becauseOf: trigger.cardId,
        clusterId: cl.id,
        risk: m.risk,
      })
    }
  }
  candidates.sort((p, q) => q.risk - p.risk || p.cardId - q.cardId)
  for (const c of candidates) {
    if (added.length >= cap) break
    if (inSession.has(c.cardId)) continue
    inSession.add(c.cardId)
    added.push({ cardId: c.cardId, becauseOf: c.becauseOf, clusterId: c.clusterId })
  }
  return { ids: [...dueIds, ...added.map((a) => a.cardId)], added }
}

/**
 * Order a session so cards from the same cluster are not retrieved back to
 * back: round-robin across clusters keeps competitors apart (spacing) while
 * still covering them all. Cards outside any cluster keep their relative order.
 */
export function interleaveByCluster(ids: number[], audit: RifAudit): number[] {
  const clusterOf = new Map<number, string>()
  for (const cl of audit.clusters) for (const m of cl.members) clusterOf.set(m.cardId, cl.id)
  const lanes = new Map<string, number[]>()
  const order: string[] = []
  for (const id of ids) {
    const lane = clusterOf.get(id) ?? `solo:${id}`
    if (!lanes.has(lane)) {
      lanes.set(lane, [])
      order.push(lane)
    }
    lanes.get(lane)!.push(id)
  }
  const out: number[] = []
  let progressed = true
  while (progressed) {
    progressed = false
    for (const lane of order) {
      const next = lanes.get(lane)!.shift()
      if (next !== undefined) {
        out.push(next)
        progressed = true
      }
    }
  }
  return out
}

/** Convenience: a stable label for a card in plain text. */
export function describeCard(card: Pick<RifCard, 'cue' | 'target'>): string {
  return `${clip(card.cue)} -> ${clip(card.target)}`
}
