/**
 * Learning HUB — Universal Multi-Modal Ingestion Core Domain.
 *
 * Implements:
 * 1. YouTube & Lecture Video transcript segmenting into timestamped flashcards.
 * 2. Academic PDF & ArXiv parsing: theorem/definition extraction into LaTeX cards.
 * 3. GitHub repository & codebase analysis: syntax clozes and architecture tours.
 *
 * Pure and deterministic (no I/O): the ingest route previews these cards and the
 * learner saves them through the normal validated bulk card path
 * ({@link ingestedCardToCardItem} → `PUT /api/cards?bulk=1`).
 */
import { parseCloze } from '../cards'
import type { CardContent } from '../types'

export interface VideoTranscriptSegment {
  text: string
  startSec: number
  durationSec: number
}

export interface IngestedCardOutput {
  front: string
  back: string
  format: 'basic' | 'cloze' | 'mcq'
  sourceReference?: string
}

export interface IngestedCurriculumOutput {
  title: string
  description: string
  slug: string
  lessons: Array<{
    title: string
    content: string
    cards: IngestedCardOutput[]
  }>
}

// ─── Video transcripts ──────────────────────────────────────────────────────

/** Default length (s) of the last segment when no end time is known. */
const DEFAULT_SEGMENT_SEC = 10

/**
 * A cue/timestamp line: `00:01:23.456`, `01:23`, `1:23`, SRT `00:00:01,000 --> 00:00:04,000`
 * or VTT `00:01.000 --> 00:04.000 align:start`. Anchored to the whole line so a time
 * mentioned inside spoken text ("we meet at 10:30 today") is never read as a cue.
 */
const CUE_LINE =
  /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,]\d+)?(?:\s*-->\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,]\d+)?)?(?:\s+[a-z-]+:\S+)*$/i

/** WebVTT / YouTube-export header and metadata lines that are not spoken text. */
const HEADER_LINE = /^(WEBVTT\b|NOTE\b|STYLE\b|REGION\b|Kind:|Language:)/

function toSeconds(h: string | undefined, m: string, s: string): number {
  return (h ? parseInt(h, 10) : 0) * 3600 + parseInt(m, 10) * 60 + parseInt(s, 10)
}

/**
 * Parses raw YouTube / VTT / SRT transcript strings into structured timestamped segments.
 *
 * Duration comes from the cue's own end time (`-->`) when present, else from the gap to
 * the next cue, else {@link DEFAULT_SEGMENT_SEC}. Subtitle index numbers and VTT headers
 * are skipped; text before the first cue starts at 0s.
 */
export function parseTranscriptSegments(raw: string): VideoTranscriptSegment[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const pending: Array<{ text: string; startSec: number; endSec: number | null }> = []

  let currentStart = 0
  let currentEnd: number | null = null
  let currentText = ''

  const flush = () => {
    if (currentText.trim()) {
      pending.push({ text: currentText.trim(), startSec: currentStart, endSec: currentEnd })
    }
    currentText = ''
  }

  for (const line of lines) {
    if (HEADER_LINE.test(line)) continue
    const cue = line.match(CUE_LINE)
    if (cue) {
      flush()
      currentStart = toSeconds(cue[1], cue[2]!, cue[3]!)
      currentEnd = cue[5] !== undefined ? toSeconds(cue[4], cue[5], cue[6]!) : null
    } else if (!/^\d+$/.test(line)) {
      // Bare integers are SRT/VTT cue index numbers, not speech.
      currentText += ' ' + line
    }
  }
  flush()

  return pending.map((seg, i) => {
    const next = pending[i + 1]
    const end = seg.endSec ?? next?.startSec ?? seg.startSec + DEFAULT_SEGMENT_SEC
    const durationSec = end > seg.startSec ? end - seg.startSec : DEFAULT_SEGMENT_SEC
    return { text: seg.text, startSec: seg.startSec, durationSec }
  })
}

/**
 * Append a `t=<sec>s` deep-link parameter to a video URL (replacing any existing `t`,
 * keeping a `#fragment` last). Only http(s) URLs are linked — anything else (e.g.
 * `javascript:`) yields `null`, so untrusted input never becomes a live link.
 */
export function videoDeepLink(videoBaseUrl: string, startSec: number): string | null {
  let url: URL
  try {
    url = new URL(videoBaseUrl)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  url.searchParams.set('t', `${Math.max(0, Math.floor(startSec))}s`)
  return url.toString()
}

/**
 * Converts timestamped video segments into reviewable cards with embedded video deep
 * links. Segments shorter than 25 characters carry too little content to test and are
 * skipped. An invalid or non-http(s) `videoBaseUrl` produces cards without a link.
 */
export function generateVideoCards(
  videoTitle: string,
  videoBaseUrl: string,
  segments: VideoTranscriptSegment[],
): IngestedCardOutput[] {
  const cards: IngestedCardOutput[] = []

  for (const seg of segments) {
    if (seg.text.length < 25) continue

    const deepLink = videoDeepLink(videoBaseUrl, seg.startSec)
    const stamp = formatTimestamp(seg.startSec)

    cards.push({
      front: `[Video: ${videoTitle}] At timestamp ${stamp}: What key concept is discussed?\n\n"${truncateText(seg.text, 80)}"`,
      back: deepLink ? `${seg.text}\n\n[Watch clip at ${stamp}](${deepLink})` : seg.text,
      format: 'basic',
      ...(deepLink ? { sourceReference: deepLink } : {}),
    })
  }

  return cards
}

/** `m:ss`, or `h:mm:ss` from one hour on (YouTube's own display format). */
export function formatTimestamp(totalSecs: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(totalSecs) ? totalSecs : 0))
  const hours = Math.floor(total / 3600)
  const mins = Math.floor((total % 3600) / 60)
  const ss = String(total % 60).padStart(2, '0')
  return hours > 0 ? `${hours}:${String(mins).padStart(2, '0')}:${ss}` : `${mins}:${ss}`
}

function truncateText(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str
}

// ─── Academic papers ────────────────────────────────────────────────────────

/**
 * Extracts display equations and Definition / Theorem / Lemma / Proposition /
 * Corollary statements from academic paper text into flashcards.
 *
 * Statements must START a line ("Definition 2.1: …", "Theorem (Bayes). …") — prose
 * such as "by the theorem of Pythagoras" is ignored. The front names the statement;
 * the back holds the statement itself (up to three lines, whitespace-collapsed), so
 * the card never shows its own answer.
 */
export function extractPaperFormulasAndDefinitions(rawText: string): IngestedCardOutput[] {
  const cards: IngestedCardOutput[] = []

  // Extract LaTeX display equations ($$...$$)
  const displayMathRegex = /\$\$([\s\S]*?)\$\$/g
  let match: RegExpExecArray | null
  let equationCount = 0

  while ((match = displayMathRegex.exec(rawText)) !== null) {
    const latex = match[1]!.trim()
    if (latex.length > 5) {
      equationCount++
      cards.push({
        front: `What mathematical formulation is represented here?\n\n$$${latex}$$`,
        back: `Formula #${equationCount} from source text. Practice deriving and defining its variables.`,
        format: 'basic',
      })
    }
  }

  const defRegex =
    /^[ \t]*((?:Definition|Theorem|Lemma|Proposition|Corollary)(?:[ \t]+\d+(?:\.\d+)*)?)[ \t]*(?:\(([^)\n]*)\))?[ \t]*[:.][ \t]*([^\r\n]+(?:\r?\n[ \t]*\S[^\r\n]*){0,2})/gim
  while ((match = defRegex.exec(rawText)) !== null) {
    const heading = match[2] ? `${match[1]} (${match[2].trim()})` : match[1]!
    const statement = match[3]!.replace(/\s+/g, ' ').trim()
    if (statement.length < 10) continue
    cards.push({
      front: `State the statement or conditions for:\n\n**${heading}**`,
      back: statement,
      format: 'basic',
    })
  }

  return cards
}

// ─── Code ───────────────────────────────────────────────────────────────────

/** Declarations worth memorising: functions, classes, types, top-level bindings, Python defs. */
const DECLARATION =
  /^((?:export\s+(?:default\s+)?)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?)(function\*?|class|interface|type|enum|const|let|def)\s+([A-Za-z_$][\w$]*)/

/** Fenced-code language tag from a filename extension (falls back to plain text). */
export function codeFenceLanguage(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
    jsx: 'jsx',
    mjs: 'js',
    cjs: 'js',
    py: 'python',
  }
  return map[ext] ?? 'text'
}

/**
 * Parses code files and generates syntax cloze cards for language mastery: one card per
 * declaration line, with exactly the declared identifier masked as `{{c1::name}}` (the
 * cloze syntax `CardContent.cloze.text` uses). Repeated identifiers yield one card.
 */
export function generateCodeClozeCards(filename: string, code: string): IngestedCardOutput[] {
  const cards: IngestedCardOutput[] = []
  const seen = new Set<string>()
  const lang = codeFenceLanguage(filename)

  for (const rawLine of code.split(/\r?\n/)) {
    const line = rawLine.trim()
    const parts = line.match(DECLARATION)
    if (!parts) continue
    const identifier = parts[3]!
    if (seen.has(identifier)) continue
    seen.add(identifier)
    // Rebuild from the match so only the identifier is masked — `line.replace(id)`
    // would hit the first substring occurrence (e.g. the "c" inside "const").
    const masked = `${parts[1]}${parts[2]} {{c1::${identifier}}}${line.slice(parts[0].length)}`
    cards.push({
      front: `[Code: ${filename}] Fill in the declared identifier:\n\n\`\`\`${lang}\n${masked}\n\`\`\``,
      back: identifier,
      format: 'cloze',
    })
  }

  return cards
}

// ─── Saving ─────────────────────────────────────────────────────────────────

/**
 * Converts an ingested card into the `{ type, content }` item `PUT /api/cards?bulk=1`
 * accepts, so a preview is saved through the normal validated card path. Cloze cards
 * keep their `{{c1::…}}` text (answers parsed by {@link parseCloze}); a cloze without
 * markers degrades to a basic front/back card rather than failing validation.
 */
export function ingestedCardToCardItem(card: IngestedCardOutput): {
  type: 'basic' | 'cloze'
  content: CardContent
} {
  if (card.format === 'cloze') {
    const parsed = parseCloze(card.front)
    if (parsed.answers.length > 0) return { type: 'cloze', content: { cloze: parsed } }
  }
  return { type: 'basic', content: { basic: { front: card.front, back: card.back } } }
}
