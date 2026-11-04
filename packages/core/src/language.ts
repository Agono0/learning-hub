/**
 * Language learning utilities (Agent A) — i+1 comprehensible-input checking,
 * grammar card building and digit chunking for number practice.
 * Pure module — safe for client bundles.
 */
import type { CardContent } from './types'

// ─── i+1 check (Krashen's comprehensible input) ─────────────────────────────

export interface OneTResult {
  /** true when the sentence introduces at most ONE unknown word (i+1) */
  ok: boolean
  unknownWords: string[]
  knownCount: number
  totalWords: number
}

const WORD_RE = /[\p{L}\p{M}']+/gu

function normalizeWord(w: string): string {
  return w.toLowerCase()
}

/**
 * Check a sentence against the learner's known vocabulary: comprehensible
 * input should add at most one new word ("one new thing" / i+1). Numbers and
 * punctuation are ignored; comparison is case-insensitive.
 */
export function checkOneT(sentence: string, knownWords: Iterable<string>): OneTResult {
  const known = new Set(Array.from(knownWords, normalizeWord))
  const tokens = Array.from(sentence.matchAll(WORD_RE), (m) => normalizeWord(m[0]))
  const unknownWords: string[] = []
  let knownCount = 0
  for (const token of tokens) {
    if (known.has(token)) knownCount++
    else if (!unknownWords.includes(token)) unknownWords.push(token)
  }
  return { ok: unknownWords.length <= 1, unknownWords, knownCount, totalWords: tokens.length }
}

// ─── Grammar card building ──────────────────────────────────────────────────

export interface GrammarCardInput {
  sentence: string
  pattern: string
  /** the word/phrase the learner must produce (must occur in the sentence) */
  target: string
  translation?: string
}

/**
 * Build a grammar card content (example-sentence cloze of a pattern). The
 * review UI blanks `target` inside `sentence`. Throws when the target does
 * not occur in the sentence — a grammar card with a missing target is broken.
 */
export function buildGrammarCard(input: GrammarCardInput): {
  type: 'grammar'
  content: CardContent
} {
  if (!input.sentence.toLowerCase().includes(input.target.toLowerCase())) {
    throw new Error(`buildGrammarCard: target "${input.target}" not found in sentence`)
  }
  const content: CardContent = {
    grammar: {
      sentence: input.sentence,
      pattern: input.pattern,
      target: input.target,
      ...(input.translation ? { translation: input.translation } : {}),
    },
  }
  return { type: 'grammar', content }
}

// ─── Digit chunking (number comprehension / Major-system prep) ──────────────

/**
 * Split a number into 1–2 digit chunks read from the left (odd lengths put
 * the leading digit alone): 4125 → [41, 25]; 352 → [3, 52]; 7 → [7].
 */
export function chunkDigits(n: number | string): number[] {
  const digits = String(n).replace(/\D/g, '')
  if (!digits) return []
  const chunks: number[] = []
  const first = digits.length % 2
  if (first === 1) chunks.push(Number(digits.slice(0, 1)))
  for (let i = first; i < digits.length; i += 2) {
    chunks.push(Number(digits.slice(i, i + 2)))
  }
  return chunks
}
