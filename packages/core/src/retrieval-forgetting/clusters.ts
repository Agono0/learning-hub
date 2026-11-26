/**
 * Competitor clusters: groups of cards that share a retrieval cue but have
 * different answers. These are the cards that can suppress each other.
 */
import { RIF_DEFAULTS, clamp01, jaccard, tokens, type RifCard } from './cues'

export interface RifEdge {
  a: number
  b: number
  /** Cue overlap, 0 to 1 (tags add a little). */
  similarity: number
  /** 1 minus target overlap: 1 means completely different answers. */
  distinct: number
  /** similarity x distinct: how strongly the two compete. */
  strength: number
}

export interface RifCluster {
  id: string
  cardIds: number[]
  edges: RifEdge[]
  /** Shared cue words, most common first. */
  sharedCue: string[]
  /** True when the group was larger than the cap and had to be trimmed to its best-connected cards. */
  trimmed: boolean
}

export interface ClusterOptions {
  minSimilarity?: number
  minTargetDistinct?: number
  maxClusterSize?: number
  /** Tokens appearing in more than this many cards are too common to link by. Default 60. */
  maxDocFreq?: number
}

/** Edge between two cards, or null when they do not compete. */
export function competitorEdge(x: RifCard, y: RifCard, opts: ClusterOptions = {}): RifEdge | null {
  const minSim = opts.minSimilarity ?? RIF_DEFAULTS.minSimilarity
  const minDistinct = opts.minTargetDistinct ?? RIF_DEFAULTS.minTargetDistinct
  if (x.id === y.id) return null
  const sharedTags = x.tags.filter((t) => y.tags.includes(t)).length
  const tagBonus = Math.min(0.15, sharedTags * 0.05)
  const similarity = clamp01(jaccard(tokens(x.cue), tokens(y.cue)) + tagBonus)
  if (similarity < minSim) return null
  const distinct = 1 - jaccard(tokens(x.target), tokens(y.target))
  if (distinct < minDistinct) return null
  return {
    a: Math.min(x.id, y.id),
    b: Math.max(x.id, y.id),
    similarity,
    distinct,
    strength: similarity * distinct,
  }
}

/**
 * Build competitor clusters. Candidate pairs come from an inverted index over
 * cue tokens (skipping tokens shared by very many cards), so the work stays
 * well below n squared. Components over the cap are split by raising the
 * similarity bar, and trimmed to their best-connected cards as a last resort.
 */
export function buildClusters(cards: RifCard[], opts: ClusterOptions = {}): RifCluster[] {
  const maxSize = opts.maxClusterSize ?? RIF_DEFAULTS.maxClusterSize
  const maxDf = opts.maxDocFreq ?? 60
  const byId = new Map(cards.map((c) => [c.id, c]))
  const cueTokens = new Map(cards.map((c) => [c.id, tokens(c.cue)]))

  const index = new Map<string, number[]>()
  for (const c of cards) {
    for (const t of cueTokens.get(c.id) ?? []) {
      const list = index.get(t)
      if (list) list.push(c.id)
      else index.set(t, [c.id])
    }
  }
  const seen = new Set<string>()
  const edges: RifEdge[] = []
  for (const ids of index.values()) {
    if (ids.length < 2 || ids.length > maxDf) continue
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const lo = Math.min(ids[i]!, ids[j]!)
        const hi = Math.max(ids[i]!, ids[j]!)
        const key = `${lo}:${hi}`
        if (seen.has(key)) continue
        seen.add(key)
        const e = competitorEdge(byId.get(lo)!, byId.get(hi)!, opts)
        if (e) edges.push(e)
      }
    }
  }
  edges.sort((p, q) => q.strength - p.strength || p.a - q.a || p.b - q.b)

  const components = (es: RifEdge[]): { ids: number[]; edges: RifEdge[] }[] => {
    const parent = new Map<number, number>()
    const find = (x: number): number => {
      let r = x
      while ((parent.get(r) ?? r) !== r) r = parent.get(r) ?? r
      parent.set(x, r)
      return r
    }
    for (const e of es) {
      if (!parent.has(e.a)) parent.set(e.a, e.a)
      if (!parent.has(e.b)) parent.set(e.b, e.b)
      const ra = find(e.a)
      const rb = find(e.b)
      if (ra !== rb) parent.set(Math.max(ra, rb), Math.min(ra, rb))
    }
    const groups = new Map<number, { ids: Set<number>; edges: RifEdge[] }>()
    for (const e of es) {
      const r = find(e.a)
      const g = groups.get(r) ?? { ids: new Set<number>(), edges: [] }
      g.ids.add(e.a)
      g.ids.add(e.b)
      g.edges.push(e)
      groups.set(r, g)
    }
    return [...groups.values()].map((g) => ({
      ids: [...g.ids].sort((x, y) => x - y),
      edges: g.edges,
    }))
  }

  const out: RifCluster[] = []
  const settle = (comp: { ids: number[]; edges: RifEdge[] }, bar: number) => {
    if (comp.ids.length <= maxSize) {
      out.push(makeCluster(comp.ids, comp.edges, cueTokens, false))
      return
    }
    const tighter = comp.edges.filter((e) => e.similarity >= bar + 0.1)
    if (bar < 0.9 && tighter.length > 0 && tighter.length < comp.edges.length) {
      for (const sub of components(tighter)) settle(sub, bar + 0.1)
      return
    }
    const degree = new Map<number, number>()
    for (const e of comp.edges) {
      degree.set(e.a, (degree.get(e.a) ?? 0) + e.strength)
      degree.set(e.b, (degree.get(e.b) ?? 0) + e.strength)
    }
    const keep = new Set(
      [...degree.entries()]
        .sort((p, q) => q[1] - p[1] || p[0] - q[0])
        .slice(0, maxSize)
        .map(([id]) => id),
    )
    const kept = comp.edges.filter((e) => keep.has(e.a) && keep.has(e.b))
    out.push(
      makeCluster(
        [...keep].sort((x, y) => x - y),
        kept,
        cueTokens,
        true,
      ),
    )
  }
  for (const comp of components(edges))
    settle(comp, opts.minSimilarity ?? RIF_DEFAULTS.minSimilarity)

  out.sort((p, q) => q.cardIds.length - p.cardIds.length || p.cardIds[0]! - q.cardIds[0]!)
  return out.map((c, i) => ({ ...c, id: `c${i + 1}` }))
}

function makeCluster(
  ids: number[],
  edges: RifEdge[],
  cueTokens: Map<number, string[]>,
  trimmed: boolean,
): RifCluster {
  const counts = new Map<string, number>()
  for (const id of ids)
    for (const t of cueTokens.get(id) ?? []) counts.set(t, (counts.get(t) ?? 0) + 1)
  const sharedCue = [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((p, q) => q[1] - p[1] || p[0].localeCompare(q[0]))
    .slice(0, 5)
    .map(([t]) => t)
  return { id: '', cardIds: ids, edges, sharedCue, trimmed }
}
