/**
 * Candidate pairs without comparing every card with every other card. An
 * inverted index over rare content words links cards that share at least one,
 * and only those pairs are scored. Words that are common in the collection, or
 * shared by too many cards, are skipped because they link everything.
 */
import { INF_DEFAULTS, orderedPair, pairKey, type InfCard, type PairKind } from './cues'
import { classifyPrepared, prepareCard, type PreparedCard } from './similarity'

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
  /** Distinct words too common to link cards. When this is high, cards that differ only in a templated slot are linked through the shared-prefix and shared-answer keys instead. */
  skippedWords: number
  /** Cards linked to no other card by any key: the audit could not compare them. */
  unlinkedCards: number
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

  const prepared = new Map<number, PreparedCard>()
  const postings = new Map<string, number[]>()
  const add = (key: string, id: number) => {
    const list = postings.get(key)
    if (list) list.push(id)
    else postings.set(key, [id])
  }
  for (const c of cards) {
    const pc = prepareCard(c)
    prepared.set(c.id, pc)
    for (const w of new Set([...pc.cue.tokens, ...pc.target.tokens])) add(`w:${w}`, c.id)
    // Keys that stay useful when every card shares the same common words:
    // the first three content words of the cue, and the whole answer.
    if (pc.cue.tokens.length >= 3) add(`p:${pc.cue.tokens.slice(0, 3).join(' ')}`, c.id)
    if (pc.target.norm) add(`t:${pc.target.norm}`, c.id)
  }
  const commonAt = Math.max(
    INF_DEFAULTS.minCommonDf,
    Math.ceil(cards.length * INF_DEFAULTS.commonShare),
  )
  const seen = new Set<string>()
  const linked = new Set<number>()
  const candidates: Candidate[] = []
  let scored = 0
  let skippedWords = 0

  const lists: number[][] = []
  for (const [key, ids] of [...postings.entries()].sort(
    (x, y) => x[1].length - y[1].length || x[0].localeCompare(y[0]),
  )) {
    if (ids.length < 2) continue
    const tooMany = ids.length > INF_DEFAULTS.maxPosting
    // Word keys that are common are skipped (and counted); prefix and answer keys only obey the posting cap.
    if (key.startsWith('w:') ? tooMany || ids.length >= commonAt : tooMany) {
      if (key.startsWith('w:')) skippedWords++
      continue
    }
    lists.push(ids)
  }

  outer: for (const ids of lists) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const [a, b] = orderedPair(ids[i] as number, ids[j] as number)
        const key = pairKey(a, b)
        if (seen.has(key)) continue
        seen.add(key)
        linked.add(a)
        linked.add(b)
        if (++scored > maxPairs) {
          truncated = true
          break outer
        }
        const pa = prepared.get(a)
        const pb = prepared.get(b)
        if (!pa || !pb) continue
        const r = classifyPrepared(pa, pb, opts.minCueSimilarity, opts.minTargetSimilarity)
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
  return {
    candidates,
    scanned: cards.length,
    truncated,
    skippedWords,
    unlinkedCards: cards.length - linked.size,
  }
}
