/**
 * Dependency-free JSON extraction from model/human text. Lives on its own so
 * any module (curriculum import, AI transport, plugins) can use it without
 * import cycles.
 */

/**
 * Extract a JSON value from arbitrary model text:
 * 1. strips markdown fences (```json … ``` / ``` … ```),
 * 2. tries the whole trimmed text,
 * 3. falls back to the first balanced {...} or [...] block (prose-wrapped JSON).
 * Throws a descriptive Error when no parseable JSON is present.
 */
export function extractJson(raw: string): unknown {
  const text = (raw ?? '').trim()
  if (!text) throw new Error('No content to parse: the result was empty.')

  // 1. markdown fences — handles ```json\n…\n``` and ```\n…\n```
  const fenced = text.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\s*```$/)
  const unfenced = fenced ? fenced[1] : text

  // 2. whole text
  try {
    return JSON.parse(unfenced)
  } catch {
    /* fall through to the balanced scan */
  }

  // 3. balanced {…} or […] blocks (string/escape aware) — try every opener
  // position, earliest first, so prose with stray braces can't block the real JSON
  const closers = matchBalancedClosers(unfenced)
  for (let start = 0; start < unfenced.length; start++) {
    const end = closers[start]!
    if (end < 0) continue // not an opener, or its block never closes
    try {
      return JSON.parse(unfenced.slice(start, end + 1))
    } catch {
      /* malformed candidate — continue with the next opener */
    }
  }

  throw new Error(
    'No JSON found in the result. Expected JSON (optionally inside markdown fences) — got: ' +
      text.slice(0, 200),
  )
}

/** Operation counter for tests: table cells filled by the last {@link matchBalancedClosers}. */
export const matchStats = { steps: 0 }

/**
 * For every `{` or `[` in `text`, the index of the character that closes the block it opens, or -1
 * when it never closes (and for every other character). A block is read the way a scan started at
 * that opener reads it: string and escape aware, counting only its own bracket type, ending where
 * the depth returns to 0.
 *
 * Linear. Scanning each opener to the end of the text is quadratic on text with many unclosed
 * openers, and the string state (a quote flips it) differs per start, so scans cannot simply be
 * shared. Instead one right-to-left pass per bracket type fills two tables over every position:
 * `outside[i]` and `inside[i]` hold the index of the first closer that lowers the depth below its
 * value at `i`, when reading on from `i` outside or inside a string. An opener's closer is then
 * `outside[i + 1]`, and a nested opener is stepped over by jumping to just past its own closer.
 */
export function matchBalancedClosers(text: string): Int32Array {
  const len = text.length
  const closers = new Int32Array(len).fill(-1)
  const outside = new Int32Array(len + 2)
  const inside = new Int32Array(len + 2)
  let steps = 0
  for (const [opener, closer] of [
    ['{', '}'],
    ['[', ']'],
  ] as const) {
    if (!text.includes(opener)) continue
    outside[len] = outside[len + 1] = inside[len] = inside[len + 1] = -1
    for (let i = len - 1; i >= 0; i--) {
      steps++
      const ch = text[i]!
      // Inside a string: a backslash also swallows the next character; a quote ends the string.
      inside[i] = ch === '\\' ? inside[i + 2]! : ch === '"' ? outside[i + 1]! : inside[i + 1]!
      if (ch === '"') {
        outside[i] = inside[i + 1]!
      } else if (ch === opener) {
        const end = outside[i + 1]!
        closers[i] = end
        outside[i] = end < 0 ? -1 : outside[end + 1]!
      } else if (ch === closer) {
        outside[i] = i
      } else {
        outside[i] = outside[i + 1]!
      }
    }
  }
  matchStats.steps = steps
  return closers
}
