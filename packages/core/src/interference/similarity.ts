/** Text similarity for cues and targets, plus the kind of pair they make. */
import { INF_DEFAULTS, clamp01, jaccard, round3, tokens, type PairKind } from './cues'

/** Lower-cased text with punctuation and spacing collapsed. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

function trigrams(text: string): Map<string, number> {
  const s = `  ${normalize(text)} `
  const m = new Map<string, number>()
  const chars = [...s]
  for (let i = 0; i + 3 <= chars.length; i++) {
    const g = chars.slice(i, i + 3).join('')
    m.set(g, (m.get(g) ?? 0) + 1)
  }
  return m
}

/** Dice coefficient over character trigrams (catches typos, plurals, near-wording). */
export function trigramDice(a: string, b: string): number {
  const ta = trigrams(a)
  const tb = trigrams(b)
  let na = 0
  let nb = 0
  let inter = 0
  for (const v of ta.values()) na += v
  for (const v of tb.values()) nb += v
  if (na === 0 || nb === 0) return 0
  for (const [g, v] of ta) inter += Math.min(v, tb.get(g) ?? 0)
  return (2 * inter) / (na + nb)
}

/** Similarity of two strings in [0, 1]: the larger of word overlap and trigram overlap. */
export function textSimilarity(a: string, b: string): number {
  if (normalize(a) === normalize(b)) return normalize(a) === '' ? 0 : 1
  return round3(clamp01(Math.max(jaccard(tokens(a), tokens(b)), trigramDice(a, b))))
}

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
  const cueSimilarity = textSimilarity(a.cue, b.cue)
  const targetSimilarity = textSimilarity(a.target, b.target)
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
