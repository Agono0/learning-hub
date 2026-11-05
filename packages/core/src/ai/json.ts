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
  const openerRe = /[{[]/g
  let match: RegExpExecArray | null
  while ((match = openerRe.exec(unfenced)) !== null) {
    const start = match.index
    const opener = unfenced[start]!
    const closer = opener === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < unfenced.length; i++) {
      const ch = unfenced[i]!
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === opener) depth++
      else if (ch === closer) {
        depth--
        if (depth === 0) {
          try {
            return JSON.parse(unfenced.slice(start, i + 1))
          } catch {
            break // malformed candidate — continue with the next opener
          }
        }
      }
    }
  }

  throw new Error(
    'No JSON found in the result. Expected JSON (optionally inside markdown fences) — got: ' +
      text.slice(0, 200),
  )
}
