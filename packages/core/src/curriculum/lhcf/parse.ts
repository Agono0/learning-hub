/**
 * One entry point for every curriculum source: pasted AI reply or uploaded
 * file, in JSON, YAML or Markdown. Detects the format, parses, then runs the
 * shared lenient-repair + validation pipeline.
 */
import { extractJson } from '../../ai/json'
import { parseLhcfMarkdown, parseYamlSafe } from './markdown'
import { validateLhcf, type Issue, type LhcfValidation } from './validate'

export type LhcfSourceFormat = 'json' | 'yaml' | 'markdown'

/** Max accepted source size (characters) — a course this big should be split. */
export const LHCF_MAX_SOURCE_CHARS = 5_000_000

/**
 * Guess the format from the filename extension, else from the content:
 * `{`/`[` or a ```json fence → JSON; front-matter or `##`/`###` headings →
 * Markdown; otherwise YAML.
 */
export function detectLhcfFormat(text: string, filename?: string): LhcfSourceFormat {
  const ext = filename?.toLowerCase().match(/\.([a-z]+)$/)?.[1]
  if (ext === 'json') return 'json'
  if (ext === 'yaml' || ext === 'yml') return 'yaml'
  if (ext === 'md' || ext === 'markdown') return 'markdown'
  const t = text.trimStart()
  if (t.startsWith('{') || t.startsWith('[') || /^```json\b/i.test(t)) return 'json'
  if (/^```ya?ml\b/i.test(t)) return 'yaml'
  // Module/lesson headings (## / ###) or front-matter mean Markdown. A lone
  // "# …" line is NOT enough — that's also how YAML comments look.
  if (t.startsWith('---') || /^#{2,3}\s+\S/m.test(t)) return 'markdown'
  return 'yaml'
}

/** Result of parsing + validating a source text. */
export type LhcfParseResult = { format: LhcfSourceFormat } & LhcfValidation

const failure = (format: LhcfSourceFormat, message: string, hint?: string): LhcfParseResult => ({
  format,
  ok: false,
  errors: [{ path: '', message, hint } satisfies Issue],
  warnings: [],
  fixes: [],
})

/**
 * Parse and validate a curriculum from text. Never throws: syntax errors come
 * back as `ok: false` with a readable message.
 */
export function parseCurriculum(
  text: string,
  opts: { format?: LhcfSourceFormat; filename?: string } = {},
): LhcfParseResult {
  const format = opts.format ?? detectLhcfFormat(text, opts.filename)
  if (!text.trim())
    return failure(
      format,
      'The curriculum is empty.',
      'Paste the AI reply or choose a .json, .yaml or .md file.',
    )
  if (text.length > LHCF_MAX_SOURCE_CHARS)
    return failure(
      format,
      'The curriculum is too large.',
      'Split it into several courses on the same track.',
    )

  let raw: unknown
  try {
    if (format === 'json') raw = extractJson(text)
    else if (format === 'yaml')
      raw = parseYamlSafe(text.trim().replace(/^```ya?ml\s*\n([\s\S]*?)\n```$/i, '$1'))
    else raw = parseLhcfMarkdown(text)
  } catch (err) {
    const message = err instanceof Error ? err.message.split('\n')[0]! : String(err)
    return failure(
      format,
      `Could not read the ${format.toUpperCase()}: ${message}`,
      format === 'json'
        ? 'Make sure the AI returned only the JSON (no trailing text cut off).'
        : undefined,
    )
  }
  return { format, ...validateLhcf(raw) }
}
