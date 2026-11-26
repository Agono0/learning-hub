/**
 * Small text toolkit for the authoring heuristics: tokenizing, light stemming,
 * stop words and set overlap. Deliberately simple and deterministic.
 *
 * Limits: the stop list and the stemmer are English. For other languages the
 * tokens still work (any Unicode letters or digits), but common words are not
 * removed, so overlap scores run higher. Rules that rely on overlap say so in
 * their `falsePositive` text.
 */
import { diceSimilarity, normalizeForCompare } from '../../linter'

const STOP = new Set(
  (
    'a an and are as at be been being but by can could do does did for from had has have how i if in into is it its ' +
    'may might more most must no not of on or our out over should so some such than that the their them then there ' +
    'these they this those to too under up use used using was we were what when where which while who why will with ' +
    'would you your about after again all also any because before between both each few here just like make many ' +
    'much only other own same then very via per'
  ).split(' '),
)

/** Lowercase letter/digit runs. Keeps `c++`-style names apart from plain `c` only by length rules below. */
export function tokenize(text: string): string[] {
  return (
    text
      .normalize('NFKC')
      .toLowerCase()
      // Strip fenced and inline code delimiters but keep the code words.
      .replace(/```[a-z0-9_-]*/g, ' ')
      .match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu) ?? []
  )
}

/** Very light English stemmer: plural, -ing, -ed, -ly. Never shortens below 3 letters. */
export function stem(word: string): string {
  let w = word.replace(/['’]s$/, '')
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3)
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2)
  else if (w.length > 4 && w.endsWith('es') && /(?:s|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2)
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1)
  if (w.length > 4 && w.endsWith('ly')) w = w.slice(0, -2)
  return w
}

export function isStopWord(word: string): boolean {
  return STOP.has(word)
}

/** Content terms of a text: stemmed, stop words and 1-letter tokens removed. */
export function contentTerms(text: string): string[] {
  const out: string[] = []
  for (const t of tokenize(text)) {
    if (STOP.has(t)) continue
    // Keep single digits out, keep single letters out (they are mostly noise or variable names).
    if (Array.from(t).length < 2) continue
    out.push(stem(t))
  }
  return out
}

/** Distinct content terms as a set. */
export function termSet(text: string): Set<string> {
  return new Set(contentTerms(text))
}

/** Union of several texts' term sets. */
export function termSetOf(texts: readonly (string | undefined)[]): Set<string> {
  const out = new Set<string>()
  for (const t of texts) if (t) for (const w of contentTerms(t)) out.add(w)
  return out
}

/** Share of `needle` found in `haystack` (0..1). An empty needle yields 0. */
export function containment(needle: ReadonlySet<string>, haystack: ReadonlySet<string>): number {
  if (needle.size === 0) return 0
  let hit = 0
  for (const t of needle) if (haystack.has(t)) hit += 1
  return hit / needle.size
}

/** Jaccard similarity of two sets (0..1). Two empty sets yield 0. */
export function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter += 1
  return inter / (a.size + b.size - inter)
}

/** Terms present in both sets, sorted. */
export function sharedTerms(a: ReadonlySet<string>, b: ReadonlySet<string>): string[] {
  const out: string[] = []
  for (const t of a) if (b.has(t)) out.push(t)
  return out.sort()
}

/** Word shingles of size `n` over content-free tokens (stop words kept: they carry phrasing). */
export function shingles(text: string, n = 3): Set<string> {
  const toks = tokenize(text)
  const out = new Set<string>()
  if (toks.length === 0) return out
  if (toks.length < n) {
    out.add(toks.join(' '))
    return out
  }
  for (let i = 0; i + n <= toks.length; i++) out.add(toks.slice(i, i + n).join(' '))
  return out
}

/** Blend of word-shingle Jaccard and the core linter's bigram Dice score. */
export function textSimilarity(a: string, b: string): number {
  if (normalizeForCompare(a) === normalizeForCompare(b)) return 1
  const sh = jaccard(shingles(a), shingles(b))
  const dice = diceSimilarity(a, b)
  return Math.max(sh, dice * 0.9)
}

/** Count words (Unicode letters/digits runs). */
export function wordCount(text: string): number {
  return tokenize(text).length
}

/** Strip Markdown syntax to roughly what a learner reads. Used for lengths and previews. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*+\d.)\s]+/gm, '')
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, '$1')
    .replace(/\$\$?[^$]*\$\$?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
