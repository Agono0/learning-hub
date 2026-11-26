import { describe, expect, it } from 'vitest'
import { extractJson, matchBalancedClosers, matchStats } from '../src/ai/json'

/** The step-3 scan extractJson used before: each opener scanned to the end of the text. */
function referenceExtract(raw: string): unknown {
  const text = (raw ?? '').trim()
  if (!text) throw new Error('No content to parse: the result was empty.')
  const fenced = text.match(/^```[a-zA-Z0-9_-]*\s*\n([\s\S]*?)\s*```$/)
  const unfenced = fenced ? fenced[1] : text
  try {
    return JSON.parse(unfenced)
  } catch {
    /* balanced scan */
  }
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
            break
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

const outcome = (fn: (s: string) => unknown, s: string) => {
  try {
    return { ok: true as const, value: fn(s) }
  } catch (e) {
    return { ok: false as const, message: (e as Error).message }
  }
}

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

/** The closer of every opener by the old rule: scan from the opener to the end of the text. */
function referenceClosers(text: string): number[] {
  const out = new Array<number>(text.length).fill(-1)
  for (let start = 0; start < text.length; start++) {
    const opener = text[start]!
    if (opener !== '{' && opener !== '[') continue
    const closer = opener === '{' ? '}' : ']'
    let depth = 0
    let inString = false
    let escaped = false
    for (let i = start; i < text.length; i++) {
      const ch = text[i]!
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === opener) depth++
      else if (ch === closer && --depth === 0) {
        out[start] = i
        break
      }
    }
  }
  return out
}

describe('matchBalancedClosers', () => {
  it('finds the same closer for every opener as the old scan, on random soup', () => {
    const chars = ['{', '}', '[', ']', '"', '\\', 'a', ' ', ':']
    const rand = rng(31337)
    for (let n = 0; n < 12000; n++) {
      const len = Math.floor(rand() * 24)
      let s = ''
      for (let i = 0; i < len; i++) s += chars[Math.floor(rand() * chars.length)]
      expect([...matchBalancedClosers(s)], JSON.stringify(s)).toEqual(referenceClosers(s))
    }
  })
})

describe('extractJson', () => {
  it('returns what the old scan returned on random bracket, quote and escape soup', () => {
    const chars = ['{', '}', '[', ']', '"', '\\', 'a', ' ', ':', ',', '1', '\n']
    const rand = rng(2024)
    for (let n = 0; n < 8000; n++) {
      const len = Math.floor(rand() * 30)
      let s = ''
      for (let i = 0; i < len; i++) s += chars[Math.floor(rand() * chars.length)]
      expect(outcome(extractJson, s), JSON.stringify(s)).toEqual(outcome(referenceExtract, s))
    }
  })

  it('returns what the old scan returned on prose around real JSON pieces', () => {
    const tokens = [
      '{"a":1}',
      '[1,2]',
      '{"k":"v}"}',
      '{',
      '}',
      '[',
      ']',
      '"',
      '\\"',
      'text ',
      '{"a":',
      '"x"',
      '\n',
      '```json\n',
      '```',
    ]
    const rand = rng(99)
    for (let n = 0; n < 8000; n++) {
      const len = Math.floor(rand() * 10)
      let s = ''
      for (let i = 0; i < len; i++) s += tokens[Math.floor(rand() * tokens.length)]
      expect(outcome(extractJson, s), JSON.stringify(s)).toEqual(outcome(referenceExtract, s))
    }
  })

  it('keeps the documented behavior', () => {
    expect(extractJson('Here you go: {"a": [1, 2]} thanks')).toEqual({ a: [1, 2] })
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 })
    expect(extractJson('stray { brace then [1,2]')).toEqual([1, 2])
    expect(() => extractJson('   ')).toThrow(/empty/)
    expect(() => extractJson('no json here')).toThrow(/No JSON found/)
  })
})

describe('matchBalancedClosers does work proportional to the text', () => {
  const n = 20_000
  const shapes: Record<string, string> = {
    openers: '{'.repeat(n),
    brackets: '['.repeat(n),
    'openers then one closer': `${'{'.repeat(n)}}`,
    alternating: '{['.repeat(n / 2),
    'alternating, closer last': `${'{['.repeat(n / 2)}]}`,
    'opener and quote': '{"'.repeat(n / 2),
    'keys without values': '{"a":'.repeat(n / 5),
    'escaped quotes': '{"\\"'.repeat(n / 4),
    'braces in strings': '{"{"'.repeat(n / 4),
    'nested pairs': `${'['.repeat(n / 2)}${']'.repeat(n / 2)}`,
  }
  it.each(Object.entries(shapes))('%s', (_name, text) => {
    matchBalancedClosers(text)
    // 4 steps per character is generous for a linear pass; a quadratic scan needs ~n^2/2.
    expect(matchStats.steps).toBeLessThanOrEqual(4 * text.length)
  })
})
