/** Text similarity for cues and targets, plus the kind of pair they make. */
import { INF_DEFAULTS, clamp01, jaccard, round3, tokens, type PairKind } from './cues'

/** Lower-cased text with punctuation and spacing collapsed. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function trigramsOfNormalized(norm: string): Map<string, number> {
  const s = `  ${norm} `
  const m = new Map<string, number>()
  const chars = [...s]
  for (let i = 0; i + 3 <= chars.length; i++) {
    const g = chars.slice(i, i + 3).join('')
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return m
}

/** Features of one string, computed once so a card is not re-tokenised for every pair it is in. */
export interface Prepared {
  norm: string
  tokens: string[]
  tri: Map<string, number>
  triTotal: number
}

export function prepareText(text: string): Prepared {
  const norm = normalize(text)
  const tri = trigramsOfNormalized(norm)
  let triTotal = 0
  for (const v of tri.values()) triTotal += v
  return { norm, tokens: tokens(text), tri, triTotal }
}

/** Dice coefficient over character trigrams (catches typos, plurals, near-wording). */
export function trigramDicePrepared(a: Prepared, b: Prepared): number {
  if (a.triTotal === 0 || b.triTotal === 0) return 0
  let inter = 0
  const [small, big] = a.tri.size <= b.tri.size ? [a.tri, b.tri] : [b.tri, a.tri]
  for (const [g, v] of small) inter += Math.min(v, big.get(g) ?? 0)
  return (2 * inter) / (a.triTotal + b.triTotal)
}

export function trigramDice(a: string, b: string): number {
  return trigramDicePrepared(prepareText(a), prepareText(b))
}

/** Similarity of two prepared strings in [0, 1]: the larger of word overlap and trigram overlap. */
export function similarityPrepared(a: Prepared, b: Prepared): number {
  if (a.norm === b.norm) return a.norm === '' ? 0 : 1
  return round3(clamp01(Math.max(jaccard(a.tokens, b.tokens), trigramDicePrepared(a, b))))
}

/** Similarity of two strings in [0, 1]. */
export function textSimilarity(a: string, b: string): number {
  return similarityPrepared(prepareText(a), prepareText(b))
}

export interface PreparedCard {
  cue: Prepared
  target: Prepared
}

export const prepareCard = (c: { cue: string; target: string }): PreparedCard => ({
  cue: prepareText(c.cue),
  target: prepareText(c.target),
})

export interface Classified {
  kind: PairKind | null
  cueSimilarity: number
  targetSimilarity: number
  /** 0 to 1 before review evidence is added. */
  base: number
}

/**
 * Decide what kind of pair two cards make. A pair far apart on both sides is
 * null. Similar cues with different targets are the classic interference case,
 * so they score highest.
 */
export function classifyPair(
  a: { cue: string; target: string },
  b: { cue: string; target: string },
  minCue: number = INF_DEFAULTS.minCueSimilarity,
  minTarget: number = INF_DEFAULTS.minTargetSimilarity,
): Classified {
  return classifyPrepared(prepareCard(a), prepareCard(b), minCue, minTarget)
}

/** Same as classifyPair on features that were computed once per card. */
export function classifyPrepared(
  a: PreparedCard,
  b: PreparedCard,
  minCue: number = INF_DEFAULTS.minCueSimilarity,
  minTarget: number = INF_DEFAULTS.minTargetSimilarity,
): Classified {
  const cueSimilarity = similarityPrepared(a.cue, b.cue)
  const targetSimilarity = similarityPrepared(a.target, b.target)
  const out = (kind: PairKind | null, base: number): Classified => ({
    kind,
    cueSimilarity,
    targetSimilarity,
    base: round3(clamp01(base)),
  })
  if (cueSimilarity >= INF_DEFAULTS.duplicateAt && targetSimilarity >= INF_DEFAULTS.duplicateAt)
    return out('near-duplicate', 0.2)
  if (cueSimilarity >= minCue && targetSimilarity < minTarget)
    return out('same-cue-different-target', 0.35 + 0.65 * cueSimilarity * (1 - targetSimilarity))
  if (targetSimilarity >= minTarget && cueSimilarity < minCue)
    return out('same-target-different-cue', 0.25 + 0.55 * targetSimilarity * (1 - cueSimilarity))
  if (cueSimilarity >= minCue && targetSimilarity >= minTarget)
    return out('lookalike', 0.2 + 0.5 * Math.min(cueSimilarity, targetSimilarity))
  return out(null, 0)
}
