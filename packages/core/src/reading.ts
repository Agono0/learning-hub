/**
 * Learning HUB — reading pipeline (Agent C).
 * SuperMemo-style incremental reading: daily fragment chunker, Readwise-style
 * highlight resurfacing, triage transitions, and the Ghostreader-style cloze
 * prompt (guardrailed to the provided text only).
 * Pure logic — DB layer persists positions/results.
 */

const DAY_MS = 86_400_000

// ─── Incremental reading position ───────────────────────────────────────────

export interface ReadingSource {
  id?: number
  title?: string
  content: string
  /** reading position, 0-100 (% of words already read) */
  position?: number
}

/** One day's incremental-reading chunk with position bookkeeping. */
export interface ReadingFragment {
  text: string
  fromWord: number
  toWord: number
  words: number
  /** position BEFORE this fragment */
  position: number
  /** position to persist after reading this fragment */
  nextPosition: number
  done: boolean
}

/**
 * The next daily fragment: `wordsPerDay` words starting at the source's
 * current position (position is stored as a % — survives long documents).
 */
export function nextFragment(source: ReadingSource, wordsPerDay = 800): ReadingFragment {
  const words = source.content.split(/\s+/).filter(Boolean)
  const total = words.length
  if (total === 0) {
    return { text: '', fromWord: 0, toWord: 0, words: 0, position: 100, nextPosition: 100, done: true }
  }
  const position = clampPct(source.position ?? 0)
  const fromWord = Math.min(total, Math.floor((position / 100) * total))
  const toWord = Math.min(total, fromWord + Math.max(1, Math.floor(wordsPerDay)))
  const nextPosition = Math.min(100, (toWord / total) * 100)
  return {
    text: words.slice(fromWord, toWord).join(' '),
    fromWord,
    toWord,
    words: toWord - fromWord,
    position,
    nextPosition,
    done: toWord >= total,
  }
}

function clampPct(p: number): number {
  return Math.min(100, Math.max(0, p))
}

// ─── Highlight resurfacing (Readwise-style) ─────────────────────────────────

export type HighlightTriageState = 0 | 1 | 2 // 0 new, 1 kept, 2 discarded

/** Highlight row the resurfacing queue needs. */
export interface HighlightRow {
  id: number
  sourceId: number
  text: string
  /** 0..1 memory strength (Readwise-like weight accumulator) */
  strength: number
  lastReviewedAt?: string | null
  triaged: HighlightTriageState
}

const RESURFACE_HALF_LIFE_DAYS = 14
const DAY_DECAY = Math.LN2 / RESURFACE_HALF_LIFE_DAYS

/**
 * Weight = strength × exp(-daysSinceLastReview × ln2 / 14) × triage factor.
 * Discarded highlights are excluded; kept ones get a 1.25× boost.
 * Most weighty first, `limit` (default 10) items — the daily resurface queue.
 */
export function resurfaceHighlights(
  highlights: HighlightRow[],
  today: Date,
  limit = 10,
): (HighlightRow & { weight: number })[] {
  return highlights
    .filter((h) => h.triaged !== 2)
    .map((h) => {
      const days = h.lastReviewedAt
        ? Math.max(0, (today.getTime() - Date.parse(h.lastReviewedAt)) / DAY_MS)
        : Infinity // never reviewed → top of the queue
      const decay = days === Infinity ? 0.5 : Math.exp(-days * DAY_DECAY)
      const triageFactor = h.triaged === 1 ? 1.25 : 1
      const weight = clamp01(h.strength * decay * triageFactor + (days === Infinity ? 0.5 : 0))
      return { ...h, weight }
    })
    .sort((a, b) => b.weight - a.weight || a.id - b.id)
    .slice(0, limit)
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

/** Persistable result of a keep/discard triage decision. */
export interface TriageUpdate {
  triaged: HighlightTriageState
  strength: number
  lastReviewedAt: string
}

/**
 * Apply a keep/discard triage decision → the fields to persist.
 * keep: triaged=1, strength up (capped at 1), reviewed today.
 * discard: triaged=2, strength collapses (excluded from resurfacing).
 */
export function triageUpdate(
  h: HighlightRow,
  action: 'keep' | 'discard',
  today: Date,
): TriageUpdate {
  const lastReviewedAt = today.toISOString()
  if (action === 'discard') {
    return { triaged: 2, strength: Math.max(0, h.strength * 0.25), lastReviewedAt }
  }
  return { triaged: 1, strength: Math.min(1, h.strength + 0.15), lastReviewedAt }
}

/**
 * Merely seeing a resurfaced highlight ("promote-if-known") nudges strength up
 * without triage — Readwise's passive resurfacing effect.
 */
export function resurfaceSeen(h: HighlightRow, today: Date): TriageUpdate {
  return { triaged: h.triaged, strength: Math.min(1, h.strength + 0.05), lastReviewedAt: today.toISOString() }
}

// ─── Highlight extraction (heuristic, no AI needed) ─────────────────────────

/**
 * Pull the most highlight-worthy sentences from a text — cue-phrase scoring
 * (definitions, numbers, causal words) with a length window. Deterministic
 * alternative to AI extraction; used by POST /api/reading/highlights.
 */
export function extractHighlightCandidates(text: string, max = 10): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30 && s.length <= 400)
  const CUES = [
    'is defined as', 'means that', 'because', 'therefore', 'the key', 'in other words',
    'the most', 'it turns out', 'research shows', 'we found', 'conclude', 'principle',
    'important', 'never', 'always', 'first', 'discovered', 'proves', 'rule', 'percent', '%',
  ]
  const scored = sentences.map((s, i) => {
    const lower = s.toLowerCase()
    let score = 0
    for (const c of CUES) if (lower.includes(c)) score += 2
    if (/\d/.test(s)) score += 1.5
    // slight preference for early sentences (authors front-load the point)
    score += Math.max(0, 1 - i / Math.max(1, sentences.length))
    return { s, score, i }
  })
  return scored
    .filter(({ score }) => score >= 2)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .sort((a, b) => a.i - b.i)
    .map(({ s }) => s)
}

// ─── Ghostreader-style cloze prompt (guardrailed to the source text) ────────

/** Prompt pair for turning reading text into cloze cards (see ai.ts CLOZE_GENERATOR_SYSTEM). */
export function sourceToClozePrompt(text: string): { system: string; prompt: string } {
  return {
    system: `You create cloze deletion flashcards from reading material. Only delete words/phrases that appear VERBATIM in the provided text — never invent or paraphrase answers. One deletion per card, on the conceptually load-bearing term. Return ONLY JSON: { "cards": [{ "text", "answers": [string], "hint" }] }.`,
    prompt: `Make cloze cards from this reading excerpt:\n"""\n${text.slice(0, 12000)}\n"""`,
  }
}
