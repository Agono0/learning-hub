/**
 * What to do about a pair: a plain-language fix, the words that differ, a
 * short discrimination drill, and a review-queue spreader that keeps lookalikes
 * apart (Underwood 1957: spacing the competing items reduces interference).
 */
import { jaccard, orderedPair, pairKey, tokens, type InfCard, type PairKind } from './cues'

export interface DiffWords {
  onlyA: string[]
  onlyB: string[]
  shared: string[]
}

/** Words that tell two strings apart. Capped so one long card cannot flood the page. */
export function diffWords(a: string, b: string, limit = 8): DiffWords {
  const ta = tokens(a)
  const tb = tokens(b)
  const sa = new Set(ta)
  const sb = new Set(tb)
  return {
    onlyA: ta.filter((t) => !sb.has(t)).slice(0, limit),
    onlyB: tb.filter((t) => !sa.has(t)).slice(0, limit),
    shared: ta.filter((t) => sb.has(t)).slice(0, limit),
  }
}

export interface PairAdvice {
  headline: string
  steps: string[]
}

export function adviceFor(kind: PairKind, cueDiff: DiffWords, targetDiff: DiffWords): PairAdvice {
  const cueBits =
    cueDiff.onlyA.length || cueDiff.onlyB.length
      ? ` The cues differ in "${cueDiff.onlyA.join(' ') || '(nothing)'}" versus "${cueDiff.onlyB.join(' ') || '(nothing)'}".`
      : ''
  switch (kind) {
    case 'near-duplicate':
      return {
        headline: 'These two cards ask nearly the same thing.',
        steps: ['Merge them or delete one. Reviewing both only doubles the work.'],
      }
    case 'same-cue-different-target':
      return {
        headline:
          'Almost the same question with different answers. Learning one makes the other harder.',
        steps: [
          `Rewrite each cue so it carries the detail that picks its own answer.${cueBits}`,
          'Run the discrimination drill below once, then review the two on different days.',
          'Add a one-line contrast to each answer ("not X, because ...").',
        ],
      }
    case 'same-target-different-cue':
      return {
        headline:
          'Two different cues lead to the same answer. That is usually fine, but each cue is weaker.',
        steps: [
          'Check that both cards are needed. Keep both if they test different routes to the answer.',
          'If one is a rewording of the other, merge them.',
        ],
      }
    case 'lookalike':
      return {
        headline: 'Both the question and the answer look alike, so they are easy to swap.',
        steps: [
          `Make the answers explicitly different in form (a number, a first letter, an image).${targetDiff.onlyA.length || targetDiff.onlyB.length ? ` The answers differ in "${targetDiff.onlyA.join(' ') || '(nothing)'}" versus "${targetDiff.onlyB.join(' ') || '(nothing)'}".` : ''}${cueBits}`,
          'Learn one until it is stable, then introduce the other.',
          'Run the discrimination drill below.',
        ],
      }
  }
}

export interface DrillItem {
  cardId: number
  prompt: string
  expected: string
}

export interface Drill {
  a: number
  b: number
  /** Alternates A B B A so neither card is always first, which would let the learner answer by position. */
  items: DrillItem[]
  contrast: string
}

/**
 * A short discrimination drill: both cards back and forth, then a question that
 * makes the learner state the difference. Fixed length (four items).
 */
export function buildDrill(a: InfCard, b: InfCard): Drill {
  const [x, y] = a.id <= b.id ? [a, b] : [b, a]
  const item = (c: InfCard): DrillItem => ({ cardId: c.id, prompt: c.cue, expected: c.target })
  const d = diffWords(x.cue + ' ' + x.target, y.cue + ' ' + y.target)
  const clue =
    d.onlyA.length || d.onlyB.length
      ? ` Hint: one has "${d.onlyA.join(' ') || '(nothing)'}", the other has "${d.onlyB.join(' ') || '(nothing)'}".`
      : ''
  return {
    a: x.id,
    b: y.id,
    items: [item(x), item(y), item(y), item(x)],
    contrast: `In one sentence, what tells "${x.cue}" apart from "${y.cue}"?${clue}`,
  }
}

/**
 * Reorder a review queue so that two cards of a flagged pair are at least
 * `gap` positions apart when possible. Stable otherwise: a card moves only
 * when it would land next to its lookalike. When no card can be placed without
 * breaking the gap, the next card in order is used, so every card still
 * appears exactly once.
 */
export function spreadPairs(queue: number[], pairs: Array<[number, number]>, gap = 5): number[] {
  if (gap < 1 || pairs.length === 0) return [...queue]
  const mates = new Map<number, Set<number>>()
  for (const [x, y] of pairs) {
    const [a, b] = orderedPair(x, y)
    if (a === b) continue
    if (!mates.has(a)) mates.set(a, new Set())
    if (!mates.has(b)) mates.set(b, new Set())
    mates.get(a)!.add(b)
    mates.get(b)!.add(a)
  }
  const out: number[] = []
  const rest = [...queue]
  while (rest.length) {
    const recent = new Set(out.slice(-gap))
    let idx = rest.findIndex((id) => ![...(mates.get(id) ?? [])].some((m) => recent.has(m)))
    if (idx === -1) idx = 0
    out.push(rest.splice(idx, 1)[0] as number)
  }
  return out
}

/** Pair keys an item of the queue is part of, for tests and the page. */
export const keysFor = (id: number, pairs: Array<[number, number]>): string[] =>
  pairs.filter(([x, y]) => x === id || y === id).map(([x, y]) => pairKey(x, y))

/** Token overlap of two cards, handy for ranking (re-exported to keep one import site). */
export const overlap = (a: string, b: string): number => jaccard(tokens(a), tokens(b))
