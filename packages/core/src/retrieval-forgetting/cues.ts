/**
 * Retrieval-induced forgetting (RIF) guard: shared types and cue extraction.
 *
 * Basis: Anderson, Bjork & Bjork (1994). Practising some items under a shared
 * category cue (e.g. "Fruit: ap___") makes related, unpractised items under the
 * same cue harder to recall later, because the competitors were suppressed to
 * let the practised item win. The effect grows with how often the competitor
 * is retrieved, but saturates after a few retrievals, and it fades when the
 * items are integrated (the targets overlap) or are tested with an independent
 * cue. Everything here is a transparent heuristic over card text; it never
 * claims to measure memory.
 *
 * This file is a leaf: it imports nothing else from core, so the other
 * retrieval-forgetting files can share its types without import cycles.
 */

export interface RifCard {
  id: number
  deckId: number
  /** What the learner sees (the retrieval cue). */
  cue: string
  /** What the learner must produce. */
  target: string
  tags: string[]
  /** FSRS stability in days (0 for new cards). */
  stability: number
  /** ISO time of the last review, or null for a never-reviewed card. */
  lastReview: string | null
  /** FSRS state: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number
}

export interface RifReview {
  cardId: number
  /** 1 Again, 2 Hard, 3 Good, 4 Easy. */
  rating: number
  /** ISO time. */
  reviewedAt: string
}

export type RifBand = 'low' | 'watch' | 'high'

export const RIF_DEFAULTS = {
  windowDays: 21,
  /** Cue similarity needed to call two cards competitors. */
  minSimilarity: 0.34,
  /** Targets must differ at least this much, otherwise the cards support each other. */
  minTargetDistinct: 0.6,
  maxClusterSize: 12,
  /** Hard bound on cards examined; larger scopes must be narrowed by deck. */
  maxCards: 1500,
  /** Retrievals beyond this add no extra suppression (Anderson 1994: effect saturates). */
  saturation: 3,
  watchAt: 0.25,
  highAt: 0.5,
} as const

const STOP = new Set(
  (
    'a an the of to in on at for from by with and or but is are was were be been being it its this that ' +
    'these those as into than then so such not no do does did has have had which what who whom whose how ' +
    'when where why can could should would may might will shall you your we our they their he she his her'
  ).split(' '),
)

/** Light stemmer: enough to match plurals and common endings, never meant to be linguistic. */
export function stem(word: string): string {
  let w = word
  if (w.length > 5 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`
  else if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  else if (/(ch|sh|x|ss|z)es$/.test(w)) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  return w
}

/** Lower-case content tokens, stop words removed, stemmed, deduplicated. */
export function tokens(text: string): string[] {
  const out = new Set<string>()
  for (const raw of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
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
 * Pull a cue and a target out of a stored card payload. Formats without a clear
 * "cue to answer" shape (occlusion, sketch, matching) return null and are not audited.
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

/** Jaccard similarity of two token sets, 0 when either is empty. */
export function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const sb = new Set(b)
  let inter = 0
  for (const t of a) if (sb.has(t)) inter++
  return inter / (a.length + b.length - inter)
}

/** Clamp to [0, 1]; NaN becomes 0. */
export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0)
