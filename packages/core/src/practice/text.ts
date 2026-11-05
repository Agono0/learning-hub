/**
 * Answer-comparison utilities shared by the text-based graders (type-in,
 * cloze, numeric units). Lenient on form, strict on substance: case, accents,
 * surrounding punctuation and whitespace never cost a learner a correct
 * answer; a one-letter typo on a long word is forgiven, a different word is not.
 */

/**
 * Canonical form for comparison: NFKD-decomposed with diacritics removed,
 * lower-cased, punctuation at the edges stripped, inner whitespace collapsed.
 */
export function normalizeAnswer(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s"'`.,;:!?()[\]{}]+|[\s"'`.,;:!?()[\]{}]+$/g, '')
}

/** Levenshtein edit distance (insert/delete/substitute = 1), O(n·m) time, O(m) memory. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const curr = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(prev[j]! + 1, curr[j - 1]! + 1, prev[j - 1]! + cost)
    }
    prev = curr
  }
  return prev[b.length]!
}

/**
 * Typos tolerated for an expected answer of this length: none for short
 * answers (a 1-letter slip on "cat" may be a different word), 1 from 5
 * characters, 2 from 12. Numbers-only answers never get typo tolerance.
 */
export function typoBudget(expected: string): number {
  if (/^[\d\s.,+-]+$/.test(expected)) return 0
  if (expected.length >= 12) return 2
  if (expected.length >= 5) return 1
  return 0
}

/** How a learner answer matched an accepted answer. */
export type TextMatch = 'exact' | 'typo' | 'none'

/**
 * Compare a learner answer against accepted answers.
 * `exact` after normalization; `typo` within {@link typoBudget} when `fuzzy`.
 */
export function matchText(answer: string, accepted: readonly string[], fuzzy = true): TextMatch {
  const given = normalizeAnswer(answer)
  if (!given) return 'none'
  let best: TextMatch = 'none'
  for (const candidate of accepted) {
    const want = normalizeAnswer(candidate)
    if (given === want) return 'exact'
    if (fuzzy && editDistance(given, want) <= typoBudget(want)) best = 'typo'
  }
  return best
}
