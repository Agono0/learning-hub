/**
 * Interference and confusability: shared types, defaults and text cues.
 *
 * Basis: similar items compete at retrieval. When two cards share a cue but
 * have different answers, learning one makes the other harder to recall
 * (proactive and retroactive interference: McGeoch 1942; Underwood 1957), and
 * the more answers a cue has the slower and less accurate recall is (the fan
 * effect: Anderson 1974). Learners fix it by attending to what differs
 * (discrimination practice) and by not learning the lookalikes at the same
 * moment (Underwood 1957 found distributed practice reduced interference).
 * Everything here is a transparent heuristic over card text and review
 * history. It finds suspects, it does not prove a confusion.
 *
 * This file is a leaf: it imports nothing else from core, so the other
 * interference files share its types without import cycles.
 */

export interface InfCard {
  id: number
  deckId: number
  /** What the learner sees. */
  cue: string
  /** What the learner must produce. */
  target: string
}

export interface InfReview {
  cardId: number
  /** 1 Again, 2 Hard, 3 Good, 4 Easy. */
  rating: number
  /** ISO time. */
  reviewedAt: string
}

export type PairKind =
  'same-cue-different-target' | 'same-target-different-cue' | 'lookalike' | 'near-duplicate'

export type Band = 'low' | 'watch' | 'high'

/** The learner's decision about a pair. Absent means undecided. */
export type PairStatus = 'confirmed' | 'dismissed'

export const INF_DEFAULTS = {
  windowDays: 90,
  /** Hard bound on cards examined. Larger scopes must be narrowed by deck. */
  maxCards: 1500,
  /** A word in more than this share of cards (and at least minCommonDf cards) is too common to link cards. */
  commonShare: 0.05,
  minCommonDf: 30,
  /** Most cards that may share one rare word before the word stops linking them. */
  maxPosting: 60,
  /** Most pairs scored in one audit. */
  maxCandidatePairs: 200_000,
  /** Most pairs kept and shown. */
  maxPairs: 200,
  minCueSimilarity: 0.45,
  minTargetSimilarity: 0.5,
  /** Both similarities at or above this make a near-duplicate. */
  duplicateAt: 0.85,
  /** A reviewed exposure to the other card counts if it was within this many hours before the review. */
  lagHours: 24,
  /** Minimum reviews in each exposure group before a lift is reported. */
  minGroup: 5,
  watchAt: 0.3,
  highAt: 0.55,
} as const

const STOP = new Set(
  (
    'a an the of to in on at for from by with and or but is are was were be been being it its this that ' +
    'these those as into than then so such not no do does did has have had which what who whom whose how ' +
    'when where why can could should would may might will shall you your we our they their he she his her ' +
    'في من على إلى عن مع هذا هذه ذلك تلك التي الذي ما ماذا هو هي هل أن إن كان كل او أو و'
  ).split(' '),
)

/** Light stemmer for Latin words only; other scripts match as whole words. */
export function stem(word: string): string {
  if (!/^[a-z]+$/.test(word)) return word
  let w = word
  if (w.length > 5 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  else if (/(ch|sh|x|ss|z)es$/.test(w)) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  return w
}

const CJK = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u

/**
 * Lower-case content tokens, stop words removed, stemmed, deduplicated. Runs
 * of Chinese, Japanese or Korean characters are not split by spaces, so they
 * are tokenised as character bigrams (a single character stays as is).
 */
export function tokens(text: string): string[] {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    if (CJK.test(raw)) {
      const chars = [...raw]
      if (chars.length === 1) out.add(raw)
      for (let i = 0; i + 1 < chars.length; i++) out.add(`${chars[i]}${chars[i + 1]}`)
      continue
    }
    if (raw.length < 2 || STOP.has(raw)) continue
    out.add(stem(raw))
  }
  return [...out]
}

const strip = (s: string) =>
  s
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Pull a cue and a target out of a stored card payload. Formats with no clear
 * "cue to answer" shape (occlusion, sketch, matching) return null.
 */
export function cardCueTarget(content: unknown): { cue: string; target: string } | null {
  if (!content || typeof content !== 'object') return null
  // Card payloads are untyped JSON here; every field is checked before use.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = content as Record<string, any>
  if (c['basic'] && typeof c['basic'].front === 'string') {
    const cue = strip(c['basic'].front)
    const target = strip(String(c['basic'].back ?? ''))
    return cue && target ? { cue, target } : null
  }
  if (c['cloze'] && typeof c['cloze'].text === 'string') {
    const answers: string[] = Array.isArray(c['cloze'].answers)
      ? c['cloze'].answers.map(String)
      : []
    const cue = strip(String(c['cloze'].text).replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, ' ___ '))
    const target = strip(answers.join(' '))
    return cue && target ? { cue, target } : null
  }
  if (c['typein'] && typeof c['typein'].question === 'string') {
    const accepted: string[] = Array.isArray(c['typein'].acceptedAnswers)
      ? c['typein'].acceptedAnswers.map(String)
      : []
    const cue = strip(c['typein'].question)
    const target = strip(accepted[0] ?? '')
    return cue && target ? { cue, target } : null
  }
  if (c['mcq'] && typeof c['mcq'].question === 'string') {
    const options: string[] = Array.isArray(c['mcq'].options) ? c['mcq'].options.map(String) : []
    const target = strip(options[Number(c['mcq'].correctIndex)] ?? '')
    const cue = strip(c['mcq'].question)
    return cue && target ? { cue, target } : null
  }
  return null
}

/** Jaccard similarity of two token lists, 0 when either is empty. */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const sb = new Set(b)
  let inter = 0
  for (const t of a) if (sb.has(t)) inter++
  return inter / (a.length + b.length - inter)
}

export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
export const round3 = (n: number) => Math.round(n * 1000) / 1000

/** A pair is stored with the smaller id first. */
export function orderedPair(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a]
}

export const pairKey = (a: number, b: number): string => {
  const [x, y] = orderedPair(a, b)
  return `${x}:${y}`
}
