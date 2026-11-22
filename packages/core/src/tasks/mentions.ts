/**
 * Tasks — mention config (S3-86): the `@`-mention model for task notes.
 *
 * SP lets notes reference people/projects with `@name`. In this repo the
 * mentions are PLAIN TEXT references (no notifications, no identity
 * system) — the value is structure: a stable way to extract and render
 * them, plus a per-feature config for which prefixes are active (SP's
 * config surface). Rendering stays through the UI's `<Markdown>`; this
 * module only parses.
 *
 * Syntax: `@name` (letters/digits/._-, 1–64 chars), also `@@name` for
 * literal at-signs (escaped form, rendered as `@name` text without link
 * styling). Pure.
 */
import { z } from 'zod'

/** Which mention prefixes are active (SP's GlobalConfig-style toggles). */
export const mentionConfigSchema = z.object({
  /** `@name` mentions resolved against a known-name list. */
  people: z.boolean().default(true),
  /** `@+project` mentions (matches the short-syntax project prefix). */
  projects: z.boolean().default(false),
  /** Highlight unknown names as plain text instead of a mention. */
  onlyKnownNames: z.boolean().default(true),
})

/** The parsed {@link mentionConfigSchema} shape. */
export type MentionConfig = z.infer<typeof mentionConfigSchema>

/** SP-calm default: people mentions on, project mentions opt-in. */
export const DEFAULT_MENTION_CONFIG: MentionConfig = mentionConfigSchema.parse({})

/** One extracted mention. */
export interface Mention {
  /** Name without the prefix. */
  name: string
  /** The full raw text (`@name` / `@+project`). */
  raw: string
  /** Whether the name was in the known-names list. */
  known: boolean
  /** Character range in the source note ([start, end)). */
  start: number
  end: number
}

/**
 * Extract mentions from a note under the config. `knownNames` is the
 * caller's resolution set (the repo's people list / project titles);
 * unknown names are still returned when `onlyKnownNames` is off, marked
 * `known: false`. Escaped `@@name` is skipped (literal text).
 *
 * Project mentions (`@+name`) are STRUCTURAL (SP's `@+project` grammar, the
 * same prefix the short-syntax parser owns): the `onlyKnownNames` filter is
 * a people-resolution guard, so once the projects toggle is on, project
 * mentions always extract — unresolved ones simply carry `known: false`.
 */
export function extractMentions(
  note: string,
  config: MentionConfig,
  knownNames: Set<string>,
): Mention[] {
  const mentions: Mention[] = []
  const re = /(^|[\s(])@(\+?[A-Za-z0-9._-]{1,64})/g
  for (let m = re.exec(note); m !== null; m = re.exec(note)) {
    const raw = `@${m[2] ?? ''}`
    const start = (m.index ?? 0) + (m[1]?.length ?? 0)
    // Escaped form: '@@name' — the regex above matched the second '@'.
    if (note[start - 1] === '@') continue
    const name = m[2] ?? ''
    const isProject = name.startsWith('+')
    if (isProject && !config.projects) continue
    if (!isProject && !config.people) continue
    const bare = isProject ? name.slice(1) : name
    const known = knownNames.has(bare)
    if (!known && config.onlyKnownNames && !isProject) continue
    mentions.push({ name: bare, raw, known, start, end: start + raw.length })
  }
  return mentions
}

/**
 * Escape literal at-signs in user text so they are not parsed as mentions
 * (`@name` → `@@name`). Applied by the note editor on save; the renderer
 * folds `@@` back to `@`.
 */
export function escapeAtSigns(text: string): string {
  return text.replace(/(^|[^@])@(?=[A-Za-z0-9._+-])/g, '$1@@')
}

/** Fold escaped `@@` back to a literal `@` for display. */
export function unescapeAtSigns(text: string): string {
  return text.replace(/@@(?=[A-Za-z0-9._+-])/g, '@')
}

/** Validation result (habits.ts style). */
export interface MentionValidation {
  ok: boolean
  errors: string[]
  warnings: string[]
}

/** Validate a note's mention usage: names must fit the grammar. */
export function validateMentions(note: string): MentionValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const re = /(^|[\s(])@(\S{1,80})/g
  for (let m = re.exec(note); m !== null; m = re.exec(note)) {
    const name = m[2] ?? ''
    if (!/^@@/.test(name) && !/^\+?[A-Za-z0-9._-]{1,64}$/.test(name)) {
      errors.push(`"@${name}" is not a valid mention (letters, digits, . _ - only).`)
    }
  }
  if (note.length > 0 && note.split('@@').length - 1 > 20) {
    warnings.push('A lot of escaped at-signs — did you mean mentions?')
  }
  return { ok: errors.length === 0, errors, warnings }
}
