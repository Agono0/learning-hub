/**
 * Tasks — short-syntax parser (S3-09): SP's add-task-bar grammar.
 *
 * One input line parses into a task draft: `#tag`, `+project`, time
 * estimates (`10m`, `1h`, `1h30m`), due dates (`@today`, `@tom`,
 * `@2026-12-24`, `@+3`), repeats (`@every 1w`, `@every d`), priorities
 * (`p1`..`p3`), deadlines (`!2026-12-31`), all mixed with free title text.
 * Quoting with `"…"` protects text from tokenization.
 *
 * Two consumers:
 * - `parseShortSyntax(input, now)` → the {@link ShortSyntaxResult} draft
 *   (S3-20's add-task-bar applies it through `createTask`);
 * - the token model (`tokenizeShortSyntax` / `suggestAt`) powers S3-68's
 *   live autocomplete highlighting.
 *
 * Pure: date words (`@today`, `@tom`) resolve against the injected `now`.
 * Unknown `@…`/`!…` tokens stay OUT of the title but land in
 * `warnings` (honest feedback beats silent drops).
 */
import { parseEstimateMs } from './estimates'
import { addCycle, repeatCycleSchema, type RepeatCycle } from './repeat'
import type { TaskPriority } from './shared'

// ── Result shapes ───────────────────────────────────────────────────────────

/** A resolved due/deadline value (all `YYYY-MM-DD`, clamped to real days). */
export interface ShortSyntaxDate {
  /** The resolved calendar day. */
  day: string
  /** How the user expressed it (for autocomplete echo). */
  source: string
}

/** A parsed repeat spec from `@every n<cycle>` / `@every <cycle>`. */
export interface ShortSyntaxRepeat {
  cycle: RepeatCycle
  /** 1 = every cycle. */
  interval: number
}

/** The parsed draft: everything the add-task-bar needs. */
export interface ShortSyntaxResult {
  /** Title text with all tokens stripped (quotes resolved, whitespace collapsed). */
  title: string
  /** Tag names from `#tag` tokens (normalized, case preserved, deduped). */
  tags: string[]
  /** Project name from the `+project` token (last one wins, SP behavior). */
  project: string | null
  /** Estimate in ms from `10m` / `1h` / `1h30m` chains. */
  estimateMs: number | null
  /** Due date from `@…` tokens (last one wins). */
  due: ShortSyntaxDate | null
  /** Deadline from `!…` tokens (last one wins). */
  deadline: ShortSyntaxDate | null
  /** Priority from `p1..p3` (p1 = high, SP ladder). */
  priority: TaskPriority | null
  /** Repeat spec from `@every …`. */
  repeat: ShortSyntaxRepeat | null
  /** Non-fatal token problems (unknown dates, bad estimates) — surfaced in the UI. */
  warnings: string[]
}

// ── Date grammar ────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000

/** `YYYY-MM-DD` formatter over an epoch-ms value (UTC). */
function formatDay(ms: number): string {
  const d = new Date(ms)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Resolve a date word/shape to a calendar day. Supported: `today`, `tom` /
 * `tomorrow`, `+N` (in N days), `YYYY-MM-DD`. Returns null for anything
 * else (month/day forms like `12/24` are NOT supported — locale soup).
 */
export function resolveDateWord(word: string, now: string): string | null {
  const w = word.toLowerCase()
  const todayMs = new Date(now).setUTCHours(0, 0, 0, 0)
  if (w === 'today') return formatDay(todayMs)
  if (w === 'tom' || w === 'tomorrow') return formatDay(todayMs + DAY_MS)
  const rel = /^\+(\d{1,3})$/.exec(w)
  if (rel) return formatDay(todayMs + Number(rel[1]) * DAY_MS)
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) {
    const ms = Date.parse(`${w}T00:00:00.000Z`)
    return Number.isNaN(ms) ? null : w
  }
  return null
}

/** Priority map: SP's p1 (most urgent) → high … p3 → low. */
const PRIORITY_BY_TOKEN: Record<string, TaskPriority> = {
  p1: 'high',
  p2: 'medium',
  p3: 'low',
}

// ── Tokenizer (autocomplete model) ──────────────────────────────────────────

/** Token kinds the bar highlights (S3-68). */
export type ShortSyntaxTokenKind =
  | 'text'
  | 'quoted'
  | 'tag'
  | 'project'
  | 'estimate'
  | 'due'
  | 'deadline'
  | 'repeat'
  | 'priority'
  | 'unknown'

/** One parsed segment of the input. */
export interface ShortSyntaxToken {
  kind: ShortSyntaxTokenKind
  /** Raw slice of the input (without surrounding whitespace). */
  raw: string
  /** [start, end) offsets into the original input. */
  start: number
  end: number
}

/** Classification tests, tried in order against a whitespace-delimited chunk. */
const TOKEN_TESTS: Array<{ kind: ShortSyntaxTokenKind; test: (chunk: string) => boolean }> = [
  // Estimate SHAPE (10m / 1h / 1h30m / 51h) — the parser then validates the
  // value, so over-cap chains warn instead of silently becoming title text.
  { kind: 'estimate', test: (c) => /^\d{1,3}h(\d{1,3})?m?$|^\d{1,3}m$/i.test(c) },
  { kind: 'priority', test: (c) => c.toLowerCase() in PRIORITY_BY_TOKEN },
  { kind: 'tag', test: (c) => /^#[^\s#]+$/.test(c) },
  { kind: 'project', test: (c) => /^\+[^\s+]+$/.test(c) },
  { kind: 'repeat', test: (c) => /^@every$/i.test(c) },
  { kind: 'due', test: (c) => /^@[^\s@]+$/.test(c) },
  { kind: 'deadline', test: (c) => /^![^\s!]+$/.test(c) },
]

/**
 * Split the input into tokens: `"…"` spans protect content (rendered as
 * `quoted` and kept verbatim in the title), everything else splits on
 * whitespace and classifies by {@link TOKEN_TESTS}. A bare `@`/`!`/`#`/`+`
 * (still being typed) classifies as `unknown` so autocomplete can offer
 * suggestions instead of treating it as title text.
 */
export function tokenizeShortSyntax(input: string): ShortSyntaxToken[] {
  const tokens: ShortSyntaxToken[] = []
  const quoteRe = /"([^"]*)"/g
  let lastEnd = 0

  // Walk the string, emitting quoted spans and the plain runs between them.
  type Segment = { text: string; start: number; quoted: boolean }
  const segments: Segment[] = []
  for (let m = quoteRe.exec(input); m !== null; m = quoteRe.exec(input)) {
    if (m.index > lastEnd) {
      segments.push({ text: input.slice(lastEnd, m.index), start: lastEnd, quoted: false })
    }
    segments.push({ text: m[0], start: m.index, quoted: true })
    lastEnd = m.index + m[0].length
  }
  if (lastEnd < input.length) {
    segments.push({ text: input.slice(lastEnd), start: lastEnd, quoted: false })
  }

  for (const seg of segments) {
    if (seg.quoted) {
      tokens.push({
        kind: 'quoted',
        raw: seg.text,
        start: seg.start,
        end: seg.start + seg.text.length,
      })
      continue
    }
    const chunkRe = /\S+/g
    for (let m = chunkRe.exec(seg.text); m !== null; m = chunkRe.exec(seg.text)) {
      const start = seg.start + m.index
      const raw = m[0]
      const kind = TOKEN_TESTS.find((t) => t.test(raw))?.kind ?? 'unknown'
      tokens.push({ kind, raw, start, end: start + raw.length })
    }
  }
  return tokens
}

/** Suggestion context the autocomplete offers at a caret position. */
export interface ShortSyntaxSuggestion {
  kind: ShortSyntaxTokenKind
  /** Prefix that triggered the suggestion (`@`, `#`, `+`, `!` or estimate text). */
  trigger: string
  /** Partial text after the prefix, for live filtering (may be empty). */
  query: string
}

/**
 * What the autocomplete should offer at a caret position:
 * - a bare `@`/`#`/`+`/`!` at the caret (just typed, nothing after) offers
 *   that kind with an empty query;
 * - `@tom`, `#dee`, `+par`, `!2026-01` offer the kind with the partial query;
 * - text that looks like a partial estimate (`1h3`, `45`) offers estimates;
 * - plain prose offers nothing (null).
 */
export function suggestAt(input: string, caret: number): ShortSyntaxSuggestion | null {
  const before = input.slice(0, caret)
  const lastChunk = /(?:^|\s)(\S+)$/.exec(before)?.[1] ?? ''
  const due = /^(@)(\S*)$/.exec(lastChunk)
  if (due) return { kind: 'due', trigger: due[1], query: due[2] ?? '' }
  const tag = /^(#)(\S*)$/.exec(lastChunk)
  if (tag) return { kind: 'tag', trigger: tag[1], query: tag[2] ?? '' }
  const project = /^(\+)(\S*)$/.exec(lastChunk)
  if (project) return { kind: 'project', trigger: project[1], query: project[2] ?? '' }
  const deadline = /^(!)(\S*)$/.exec(lastChunk)
  if (deadline) return { kind: 'deadline', trigger: deadline[1], query: deadline[2] ?? '' }
  const repeat = /^(@every\s?)(\S*)$/i.exec(before)
  if (repeat) return { kind: 'repeat', trigger: '@every', query: repeat[2] ?? '' }
  // Partial estimate chains: `45`, `1h`, `1h3` (mid-`1h30m`)…
  if (/^\d{1,3}(h\d{0,3})?$/i.test(lastChunk)) {
    return { kind: 'estimate', trigger: lastChunk, query: '' }
  }
  return null
}

// ── Parser ──────────────────────────────────────────────────────────────────

/** `1w` / `3d` / `w` / `d` / `1m` / `2y` → repeat spec (or null). */
function parseRepeatArg(raw: string): ShortSyntaxRepeat | null {
  const m = /^(\d{1,3})?([dwm])$/i.exec(raw.trim())
  if (!m) return null
  const cycle = repeatCycleSchema.safeParse(m[2]?.toLowerCase())
  if (!cycle.success) return null
  return { cycle: cycle.data, interval: m[1] ? Number(m[1]) : 1 }
}

/**
 * Parse the add-task-bar input into a draft. Invalid date tokens and
 * unparseable repeats do NOT abort the parse: they are dropped from the
 * title and reported in `warnings` (the user sees what was ignored).
 * `@every`'s cadence argument (`1w`, `3d`, `d` …) is a two-token lookahead.
 */
export function parseShortSyntax(input: string, now: string): ShortSyntaxResult {
  const result: ShortSyntaxResult = {
    title: '',
    tags: [],
    project: null,
    estimateMs: null,
    due: null,
    deadline: null,
    priority: null,
    repeat: null,
    warnings: [],
  }
  const tokens = tokenizeShortSyntax(input)

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue
    const raw = token.raw
    switch (token.kind) {
      case 'quoted': {
        // Quoted spans are title text, verbatim, without the quotes.
        result.title += `${raw.slice(1, -1)} `
        break
      }
      case 'unknown': {
        // A bare prefix the user is still typing — drop from the title.
        if (/^[@#!+]$/.test(raw)) break
        result.title += `${raw} `
        break
      }
      case 'tag': {
        const name = raw.slice(1)
        if (!result.tags.includes(name)) result.tags.push(name)
        break
      }
      case 'project': {
        result.project = raw.slice(1) // last one wins (SP behavior)
        break
      }
      case 'estimate': {
        const ms = parseEstimateMs(raw)
        if (ms === null) {
          result.warnings.push(`"${raw}" is not a usable estimate (max 50h).`)
        } else {
          result.estimateMs = ms
        }
        break
      }
      case 'priority': {
        result.priority = PRIORITY_BY_TOKEN[raw.toLowerCase()] ?? null
        break
      }
      case 'due': {
        const word = raw.slice(1)
        const day = resolveDateWord(word, now)
        if (day === null) {
          result.warnings.push(
            `"@${word}" is not a date I understood (today, tom, +3, YYYY-MM-DD).`,
          )
        } else {
          result.due = { day, source: raw }
        }
        break
      }
      case 'deadline': {
        const word = raw.slice(1)
        const day = resolveDateWord(word, now)
        if (day === null) {
          result.warnings.push(
            `"!${word}" is not a date I understood (today, tom, +3, YYYY-MM-DD).`,
          )
        } else {
          result.deadline = { day, source: raw }
        }
        break
      }
      case 'repeat': {
        // Two-token lookahead: @every is immediately followed by its cadence.
        const arg = tokens[i + 1]
        const parsed = arg ? parseRepeatArg(arg.raw) : null
        if (parsed) {
          result.repeat = parsed
          i += 1 // the cadence token is consumed
        } else {
          result.warnings.push('"@every" needs a cadence like 1w, 3d, w or d.')
        }
        break
      }
      case 'text':
        break // unreachable (classifier never emits 'text'); kept for exhaustiveness
    }
  }

  // Repeat dates also resolve as due — SP shows the first occurrence as the
  // task's due date. Anchor: today, or an explicit @date in the same input.
  if (result.repeat && result.due === null) {
    const day = resolveDateWord('today', now)
    if (day) {
      result.due = {
        day: addCycle(day, result.repeat.cycle, result.repeat.interval),
        source: '@every',
      }
    }
  }

  result.title = result.title.replace(/\s+/g, ' ').trim()
  return result
}

// Estimate grammar lives in ./estimates (S3-62) — re-exported so the bar's
// consumers keep one import path.
export { parseEstimateMs, ESTIMATE_MAX_MS } from './estimates'
