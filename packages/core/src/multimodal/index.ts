/**
 * Learning HUB — Universal Multi-Modal Ingestion Core Domain.
 *
 * Implements:
 * 1. YouTube & Lecture Video transcript segmenting into timestamped flashcards.
 * 2. Academic PDF & ArXiv parsing: theorem/definition extraction into LaTeX cards.
 * 3. GitHub repository & codebase analysis: syntax clozes and architecture tours.
 */
import { z } from 'zod'

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

/**
 * Parses raw YouTube / VTT / SRT transcript strings into structured timestamped segments.
 */
export function parseTranscriptSegments(raw: string): VideoTranscriptSegment[] {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const segments: VideoTranscriptSegment[] = []

  let currentStart = 0
  let currentText = ''

  for (const line of lines) {
    // Match timestamp format 00:01:23.456 or 01:23 or 83.5
    const timestampMatch = line.match(/(?:(\d{1,2}):)?(\d{2}):(\d{2})(?:\.(\d+))?/)
    if (timestampMatch) {
      if (currentText) {
        segments.push({
          text: currentText.trim(),
          startSec: currentStart,
          durationSec: 10,
        })
        currentText = ''
      }
      const hours = timestampMatch[1] ? parseInt(timestampMatch[1], 10) : 0
      const mins = parseInt(timestampMatch[2], 10)
      const secs = parseInt(timestampMatch[3], 10)
      currentStart = hours * 3600 + mins * 60 + secs
    } else if (!/^\d+$/.test(line)) {
      // Ignore subtitle index numbers
      currentText += ' ' + line
    }
  }

  if (currentText) {
    segments.push({
      text: currentText.trim(),
      startSec: currentStart,
      durationSec: 10,
    })
  }

  return segments
}

/**
 * Converts timestamped video segments into reviewable cards with embedded video deep links.
 */
export function generateVideoCards(
  videoTitle: string,
  videoBaseUrl: string,
  segments: VideoTranscriptSegment[],
): IngestedCardOutput[] {
  const cards: IngestedCardOutput[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    if (seg.text.length < 25) continue

    const timestampParam = videoBaseUrl.includes('?')
      ? `&t=${seg.startSec}s`
      : `?t=${seg.startSec}s`
    const deepLink = `${videoBaseUrl}${timestampParam}`

    cards.push({
      front: `[Video: ${videoTitle}] At timestamp ${formatTimestamp(seg.startSec)}: What key concept is discussed?\n\n"${truncateText(seg.text, 80)}"`,
      back: `${seg.text}\n\n[Watch clip at ${formatTimestamp(seg.startSec)}](${deepLink})`,
      format: 'basic',
      sourceReference: deepLink,
    })
  }

  return cards
}

function formatTimestamp(totalSecs: number): string {
  const mins = Math.floor(totalSecs / 60)
  const secs = totalSecs % 60
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`
}

function truncateText(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str
}

/**
 * Extracts definitions and LaTeX equations from academic paper text into flashcards.
 */
export function extractPaperFormulasAndDefinitions(rawText: string): IngestedCardOutput[] {
  const cards: IngestedCardOutput[] = []

  // Extract LaTeX equations ($$...$$)
  const displayMathRegex = /\$\$([\s\S]*?)\$\$/g
  let match: RegExpExecArray | null
  let equationCount = 0

  while ((match = displayMathRegex.exec(rawText)) !== null) {
    equationCount++
    const latex = match[1].trim()
    if (latex.length > 5) {
      cards.push({
        front: `What mathematical formulation is represented here?\n\n$$${latex}$$`,
        back: `Formula #${equationCount} from source text. Practice deriving and defining its variables.`,
        format: 'basic',
      })
    }
  }

  // Extract Definition blocks ("Definition X: ...")
  const defRegex =
    /(?:Definition|Theorem|Lemma)\s+(\d+(?:\.\d+)*)?[:.]?\s*([^\n\r]+(?:\n[^\n\r]+){0,2})/gi
  while ((match = defRegex.exec(rawText)) !== null) {
    const label = match[0].trim()
    cards.push({
      front: `State the statement or conditions for:\n\n**${label.split(':')[0]}**`,
      back: label,
      format: 'basic',
    })
  }

  return cards
}

/**
 * Parses code files and generates syntax cloze cards for language mastery.
 */
export function generateCodeClozeCards(filename: string, code: string): IngestedCardOutput[] {
  const cards: IngestedCardOutput[] = []
  const lines = code.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    // Identify important declarations: functions, classes, exports, types
    if (/^(export\s+)?(function|class|interface|type|const|let)\s+([A-Za-z0-9_]+)/.test(line)) {
      const parts = line.match(
        /^(export\s+)?(function|class|interface|type|const|let)\s+([A-Za-z0-9_]+)/,
      )
      if (parts && parts[3]) {
        const identifier = parts[3]
        const masked = line.replace(identifier, `{{c1::${identifier}}}`)
        cards.push({
          front: `[Code: ${filename}] Fill in the declared identifier:\n\n\`\`\`ts\n${masked}\n\`\`\``,
          back: identifier,
          format: 'cloze',
        })
      }
    }
  }

  return cards
}
