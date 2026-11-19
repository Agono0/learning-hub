/**
 * Terminal display helpers shared by the built-in CLI commands: Unicode
 * panels, progress bars, and the card renderer used by review sessions.
 * Moved verbatim from the former monolithic src/index.ts.
 */
import { clozeSegments, type CardContent } from '@learning-hub/core'

/** Render one card as a terminal prompt/reveal pair (mirrors the web review page). */
export function renderCard(type: string, content: CardContent): { prompt: string; reveal: string } {
  switch (type) {
    case 'basic':
      if (content.basic) return { prompt: content.basic.front, reveal: content.basic.back }
      break
    case 'cloze':
      if (content.cloze) {
        // mirror the web review page: split the text into text/blank segments and
        // render every blank as an answer-length placeholder (capped at 8 chars)
        const hidden = clozeSegments(content.cloze.text)
          .map((seg) =>
            seg.kind === 'text' ? seg.text : '␣'.repeat(Math.min(seg.answer.length, 8)),
          )
          .join('')
        return { prompt: hidden, reveal: content.cloze.answers.join(' · ') }
      }
      break
    case 'typein':
      if (content.typein)
        return {
          prompt: `${content.typein.question}\n  (type your answer, then compare)`,
          reveal: content.typein.acceptedAnswers.join(' · '),
        }
      break
    case 'mcq':
      if (content.mcq) {
        const opts = content.mcq.options
          .map((o, i) => `   ${String.fromCharCode(97 + i)}) ${o}`)
          .join('\n')
        return {
          prompt: `${content.mcq.question}\n${opts}`,
          reveal: `${String.fromCharCode(97 + content.mcq.correctIndex)}) ${content.mcq.options[content.mcq.correctIndex] ?? ''}${content.mcq.rationale ? `\n  why: ${content.mcq.rationale}` : ''}`,
        }
      }
      break
    default:
      return { prompt: JSON.stringify(content).slice(0, 300), reveal: '(see card in app)' }
  }
  return { prompt: JSON.stringify(content).slice(0, 300), reveal: '(see card in app)' }
}

/** Filled/empty progress bar (`████░░░░`). */
export function bar(value: number, max: number, width = 20): string {
  const filled = Math.max(0, Math.min(width, Math.round((value / Math.max(1, max)) * width)))
  return '█'.repeat(filled) + '░'.repeat(width - filled)
}

/** Unicode box around a title and its lines (help panels, stats, forecasts). */
export function panel(title: string, lines: string[]): string {
  const content = [` ${title}`, ''.padEnd(title.length + 2, '─'), ...lines]
  const width = Math.max(...content.map((l) => l.length)) + 2
  const top = '╭' + '─'.repeat(width) + '╮'
  const bottom = '╰' + '─'.repeat(width) + '╯'
  const body = content.map((l) => `│ ${l.padEnd(width - 2)} │`).join('\n')
  return `${top}\n${body}\n${bottom}`
}
