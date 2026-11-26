/**
 * Candidate pairs without comparing every card with every other card. An
 * inverted index over rare content words links cards that share at least one,
 * and only those pairs are scored. Words that are common in the collection, or
 * shared by too many cards, are skipped because they link everything.
 */
import { INF_DEFAULTS, orderedPair, pairKey, tokens, type InfCard, type PairKind } from './cues'
import { classifyPair } from './similarity'

export interface Candidate {
  /** Smaller card id. */
  a: number
  b: number
  kind: PairKind
  cueSimilarity: number
  targetSimilarity: number
  base: number
}

export interface DetectResult {
  candidates: Candidate[]
  scanned: number
  /** True when the card list or the pair budget was cut. */
  truncated: boolean
}

export interface DetectOptions {
  maxCards?: number
  maxCandidatePairs?: number
  minCueSimilarity?: number
  minTargetSimilarity?: number
}

export function findCandidates(allCards: InfCard[], opts: DetectOptions = {}): DetectResult {
  const maxCards = opts.maxCards ?? INF_DEFAULTS.maxCards
  const maxPairs = opts.maxCandidatePairs ?? INF_DEFAULTS.maxCandidatePairs
  let truncated = allCards.length > maxCards
  const cards = allCards.slice(0, maxCards)
  const byId = new Map(cards.map((c) => [c.id, c]))

  const postings = new Map<string, number[]>()
  for (const c of cards) {
    const words = new Set([...tokens(c.cue), ...tokens(c.target)])
    for (const w of words) {
      const list = postings.get(w)
      if (list) list.push(c.id)
      else postings.set(w, [c.id])
    }
  }
  const commonAt = Math.max(
    INF_DEFAULTS.minCommonDf,
    Math.ceil(cards.length * INF_DEFAULTS.commonShare),
  )
  const seen = new Set<string>()
  const candidates: Candidate[] = []
  let scored = 0

  outer: for (const ids of [...postings.entries()]
    .sort((x, y) => x[1].length - y[1].length || x[0].localeCompare(y[0]))
    .map((e) => e[1])) {
    if (ids.length < 2 || ids.length > INF_DEFAULTS.maxPosting || ids.length >= commonAt) continue
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = orderedPair(ids[i] as number, ids[j] as number)
        const key = pairKey(a, b)
        if (seen.has(key)) continue
        seen.add(key)
        if (++scored > maxPairs) {
          truncated = true
          break outer
        }
        const ca = byId.get(a)
        const cb = byId.get(b)
        if (!ca || !cb) continue
        const r = classifyPair(ca, cb, opts.minCueSimilarity, opts.minTargetSimilarity)
        if (!r.kind) continue
        candidates.push({
          a,
          b,
          kind: r.kind,
          cueSimilarity: r.cueSimilarity,
          targetSimilarity: r.targetSimilarity,
          base: r.base,
        })
      }
    }
  }
  candidates.sort((x, y) => y.base - x.base || x.a - y.a || x.b - y.b)
  return { candidates, scanned: cards.length, truncated }
}
