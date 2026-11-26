/**
 * Linear-time HTML element scanner used by the ingestion helpers.
 *
 * Replaces lazy regexes of the form `<tag\b[^>]*>([\s\S]*?)</tag>`, which are quadratic on
 * input with many unclosed openings: every unclosed `<tag` rescans to the end of the input
 * looking for its `>` or its close. Here a forward pass finds `<`, reads the tag name, finds
 * the next `>` (cached, so a run of openings shares one search) and the first matching close
 * (a failed close search is remembered per tag, so later openings of that tag skip at once).
 * Each character is therefore examined a bounded number of times per pass.
 *
 * Semantics kept from the regexes it replaces:
 *  - ASCII case-insensitive tag names, with a word boundary after the name;
 *  - an opening tag runs to the FIRST `>` (attributes may contain `<`);
 *  - the lazy FIRST closing `</name>` wins (no whitespace allowed before `>`), so nested
 *    same-name elements end at the first close, exactly like the regex;
 *  - matches do not overlap and scanning resumes after a match;
 *  - an element with no close is left untouched.
 * Not a sanitizer and not an HTML parser: output is only as safe as before.
 */

/** Parser size caps, in UTF-16 code units of the HTML string handed to the parser. */
export const MAX_CHAPTER_HTML_CHARS = 4 * 1024 * 1024
export const MAX_ARTICLE_HTML_CHARS = 8 * 1024 * 1024

export class HtmlTooLargeError extends Error {
  constructor(
    readonly kind: 'chapter' | 'article',
    readonly size: number,
    readonly limit: number,
  ) {
    super(
      `${kind} HTML is ${size} characters, over the ${limit} character parser limit; ` +
        'refusing instead of importing a partial result',
    )
    this.name = 'HtmlTooLargeError'
  }
}

/** Throw HtmlTooLargeError when `html` is over the cap for `kind`. */
export function assertHtmlWithinLimit(html: string, kind: 'chapter' | 'article'): void {
  const limit = kind === 'chapter' ? MAX_CHAPTER_HTML_CHARS : MAX_ARTICLE_HTML_CHARS
  if (html.length > limit) throw new HtmlTooLargeError(kind, html.length, limit)
}

/** Optional work counter: `chars` grows by the characters each search advances over. */
export interface ScanStats {
  chars: number
}

let activeStats: ScanStats | undefined

/** Test hook: run `fn` with a work counter attached to every scan it triggers. */
export function withScanStats(fn: () => void): ScanStats {
  const stats: ScanStats = { chars: 0 }
  activeStats = stats
  try {
    fn()
  } finally {
    activeStats = undefined
  }
  return stats
}

const isWordCode = (c: number): boolean =>
  (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95

/** Does `html` at `at` start with `name` (ASCII case-insensitive)? */
function matchesName(html: string, at: number, name: string): boolean {
  if (at + name.length > html.length) return false
  for (let k = 0; k < name.length; k++) {
    let c = html.charCodeAt(at + k)
    if (c >= 65 && c <= 90) c += 32
    if (c !== name.charCodeAt(k)) return false
  }
  return true
}

/** Which of `names` (lower case) opens at `at` (just after `<`), with a word boundary? */
function openingName(html: string, at: number, names: readonly string[]): string | null {
  for (const n of names) {
    if (!matchesName(html, at, n)) continue
    const after = at + n.length
    // `\b` after a word-character name: must not be followed by another word character
    if (after < html.length && isWordCode(html.charCodeAt(after))) continue
    return n
  }
  return null
}

interface Found {
  start: number
  end: number
  name: string
  attrs: string
  inner: string
}

/**
 * Core pass. Calls `emit` for each non-overlapping element in order and returns the text
 * between and around them via `onGap`. Linear in `html.length` per call.
 */
function scan(
  html: string,
  names: readonly string[],
  closeNames: (opened: string) => readonly string[],
  onGap: (text: string) => void,
  onMatch: (f: Found) => void,
  stats?: ScanStats,
): void {
  const n = html.length
  const noClose = new Set<string>()
  let gtCache = -1 // position of the first '>' at or after some earlier start, or n if none
  let noGtFrom = false
  let copied = 0 // everything before this index was already emitted
  let i = 0

  const nextGt = (from: number): number => {
    if (gtCache >= from) return gtCache
    const g = html.indexOf('>', from)
    if (stats) stats.chars += (g < 0 ? n : g) - from + 1
    gtCache = g < 0 ? n : g
    if (g < 0) noGtFrom = true
    return gtCache
  }

  while (i < n) {
    const lt = html.indexOf('<', i)
    if (stats) stats.chars += (lt < 0 ? n : lt) - i + 1
    if (lt < 0) break
    i = lt + 1
    if (noGtFrom) break // no '>' remains anywhere, so no opening tag can complete
    const name = openingName(html, i, names)
    if (!name || noClose.has(name)) continue
    const gt = nextGt(i + name.length)
    if (gt >= n) continue
    // find the first matching close after the opening tag
    let closeAt = -1
    let closeLen = 0
    const closes = closeNames(name)
    let from = gt + 1
    for (;;) {
      const c = html.indexOf('</', from)
      if (stats) stats.chars += (c < 0 ? n : c) - from + 1
      if (c < 0) break
      let hit = false
      for (const cn of closes) {
        if (matchesName(html, c + 2, cn) && html.charCodeAt(c + 2 + cn.length) === 62) {
          closeAt = c
          closeLen = 2 + cn.length + 1
          hit = true
          break
        }
      }
      if (hit) break
      from = c + 2
    }
    if (closeAt < 0) {
      noClose.add(name)
      continue
    }
    if (lt > copied) onGap(html.slice(copied, lt))
    onMatch({
      start: lt,
      end: closeAt + closeLen,
      name,
      attrs: html.slice(lt + 1 + name.length, gt),
      inner: html.slice(gt + 1, closeAt),
    })
    copied = closeAt + closeLen
    i = copied
  }
  if (copied < n) onGap(html.slice(copied))
}

/**
 * Replace every `<name ...>inner</name>` for the given tag names, like
 * `html.replace(/<(name|...)\b[^>]*>([\s\S]*?)<\/\1>/gi, ...)`. `render` receives the
 * lower-case tag name, the raw attribute text and the inner HTML.
 */
export function replaceElements(
  html: string,
  names: readonly string[],
  render: (name: string, inner: string, attrs: string) => string,
  stats?: ScanStats,
): string {
  stats = stats ?? activeStats
  const lower = names.map((x) => x.toLowerCase())
  const out: string[] = []
  scan(
    html,
    lower,
    (opened) => [opened],
    (g) => out.push(g),
    (f) => out.push(render(f.name, f.inner, f.attrs)),
    stats,
  )
  return out.join('')
}

/** First element for any of `names` (opened and closed by any of `names`), or null. */
export function firstElement(
  html: string,
  names: readonly string[],
  stats?: ScanStats,
): { attrs: string; inner: string; name: string } | null {
  const lower = names.map((x) => x.toLowerCase())
  let found: Found | null = null
  try {
    scan(
      html,
      lower,
      () => lower,
      () => {},
      (f) => {
        found = f
        throw STOP
      },
      stats,
    )
  } catch (e) {
    stats = stats ?? activeStats
    if (e !== STOP) throw e
  }
  return found as Found | null
}
const STOP = Symbol('stop')

/** All elements for `names`, in order (non-overlapping, first-close). */
export function allElements(
  html: string,
  names: readonly string[],
  stats?: ScanStats,
): { attrs: string; inner: string; name: string }[] {
  const lower = names.map((x) => x.toLowerCase())
  const out: { attrs: string; inner: string; name: string }[] = []
  scan(
    html,
    lower,
    (opened) => [opened],
    () => {},
    (f) => out.push(f),
    stats,
  )
  return out
}

/**
 * Self-contained or open tags `<name ...>` (no close needed), like
 * `/<name\b([^>]*?)\/?>/gi`: returns the attribute text without a trailing `/`.
 */
export function allOpeningTags(html: string, name: string, stats?: ScanStats): string[] {
  stats = stats ?? activeStats
  stats = stats ?? activeStats
  const lname = name.toLowerCase()
  const out: string[] = []
  const n = html.length
  let gtCache = -1
  let i = 0
  while (i < n) {
    const lt = html.indexOf('<', i)
    if (stats) stats.chars += (lt < 0 ? n : lt) - i + 1
    if (lt < 0) break
    i = lt + 1
    const found = openingName(html, i, [lname])
    if (!found) continue
    const from = i + lname.length
    let gt: number
    if (gtCache >= from) gt = gtCache
    else {
      gt = html.indexOf('>', from)
      if (stats) stats.chars += (gt < 0 ? n : gt) - from + 1
      if (gt < 0) break // no '>' remains, so no later tag can complete
      gtCache = gt
    }
    let attrs = html.slice(from, gt)
    if (attrs.endsWith('/')) attrs = attrs.slice(0, -1)
    out.push(attrs)
    i = gt + 1
  }
  return out
}

/** Remove `<!-- ... -->` comments (an unclosed comment is left as is), in linear time. */
export function replaceComments(html: string, replacement: string, stats?: ScanStats): string {
  stats = stats ?? activeStats
  const n = html.length
  const out: string[] = []
  let copied = 0
  let i = 0
  while (i < n) {
    const s = html.indexOf('<!--', i)
    if (stats) stats.chars += (s < 0 ? n : s) - i + 1
    if (s < 0) break
    const e = html.indexOf('-->', s + 4)
    if (stats) stats.chars += (e < 0 ? n : e) - s + 1
    if (e < 0) break // no close anywhere after: no later comment can close either
    out.push(html.slice(copied, s), replacement)
    copied = e + 3
    i = copied
  }
  out.push(html.slice(copied))
  return out.join('')
}

/** Replace every `<[^>]+>` run, in linear time (`<>` is not a tag, as in the regex). */
export function replaceTags(html: string, replacement: string, stats?: ScanStats): string {
  stats = stats ?? activeStats
  const n = html.length
  const out: string[] = []
  let copied = 0
  let i = 0
  let gtCache = -1
  while (i < n) {
    const lt = html.indexOf('<', i)
    if (stats) stats.chars += (lt < 0 ? n : lt) - i + 1
    if (lt < 0) break
    let gt: number
    if (gtCache >= lt + 1) gt = gtCache
    else {
      gt = html.indexOf('>', lt + 1)
      if (stats) stats.chars += (gt < 0 ? n : gt) - lt + 1
      if (gt < 0) break // no '>' remains
      gtCache = gt
    }
    if (gt === lt + 1) {
      i = lt + 1
      continue
    }
    out.push(html.slice(copied, lt), replacement)
    copied = gt + 1
    i = copied
  }
  out.push(html.slice(copied))
  return out.join('')
}
