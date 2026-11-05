/**
 * Sentence mining (M5): split text into sentences and propose cloze
 * deletions — the MANUAL fallback behind "cards from notes/highlights" and
 * the paste-text miner. The heuristic deletes the most load-bearing word
 * (longest non-stopword, per Wozniak's minimum-information rule); the AI path
 * (cloze-generator) does it with context. Pure module.
 */

/** Compact English stopword list — candidates must CARRY meaning. */
export const MINING_STOPWORDS: ReadonlySet<string> = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'but',
  'if',
  'then',
  'than',
  'that',
  'this',
  'these',
  'those',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'for',
  'with',
  'from',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'it',
  'its',
  'they',
  'them',
  'their',
  'we',
  'our',
  'you',
  'your',
  'he',
  'she',
  'his',
  'her',
  'not',
  'no',
  'can',
  'could',
  'will',
  'would',
  'should',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'into',
  'about',
  'also',
  'which',
  'when',
  'while',
  'there',
  'here',
  'what',
  'who',
  'how',
  'why',
  'all',
  'any',
  'some',
  'more',
  'most',
  'other',
])

/** One proposed cloze card. */
export interface ClozeDraft {
  /** the full sentence with the deletion applied as {{c1::answer}} */
  text: string
  answer: string
  /** the plain sentence (for display before the deletion) */
  sentence: string
}

/** Split into sentences on ., !, ? followed by whitespace/EOL. */
export function splitSentences(text: string): string[] {
  // protect common abbreviations from the splitter ("Dr." "e.g." …)
  const ABBREV = /\b(Dr|Mr|Mrs|Ms|Prof|vs|St|etc|e\.g|i\.e)\./g
  const guarded = text.replace(/\s+/g, ' ').replace(ABBREV, '$1\u0001')
  return guarded
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])|(?<=[.!?])$/u)
    .map((s) => s.replaceAll('\u0001', '.').trim())
    .filter((s) => s.length > 0)
}

/** The word a deletion should remove: longest non-stopword, ≥ 4 chars. */
export function loadBearingWord(sentence: string): string | null {
  const words = sentence.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? []
  let best: string | null = null
  for (const w of words) {
    const lower = w.toLowerCase()
    if (MINING_STOPWORDS.has(lower) || w.length < 4) continue
    if (best === null || w.length > best.length) best = w
  }
  return best
}

/**
 * Propose up to `max` cloze drafts from free text: one per sentence that has
 * a deletable word. Sentences that are too short (< 6 words) or too long
 * (> 25 words) are skipped — minimum-information cards, not paragraphs.
 */
export function clozeCandidates(text: string, max = 5): ClozeDraft[] {
  const drafts: ClozeDraft[] = []
  for (const sentence of splitSentences(text)) {
    if (drafts.length >= max) break
    const wordCount = sentence.split(/\s+/).length
    if (wordCount < 6 || wordCount > 25) continue
    const answer = loadBearingWord(sentence)
    if (!answer) continue
    const at = sentence.indexOf(answer)
    drafts.push({
      sentence,
      answer,
      text: `${sentence.slice(0, at)}{{c1::${answer}}}${sentence.slice(at + answer.length)}`,
    })
  }
  return drafts
}
