/**
 * Plain-language rewrites of blueprint validation issues, for people rather
 * than for logs. `validateBlueprint` keeps its precise, machine-friendly
 * messages; UIs call {@link explainIssue} when they show them to a learner.
 */
import type { BlueprintIssue } from './validate'

const FIELD_NAMES: Record<string, string> = {
  id: 'an id',
  name: 'a name',
  version: 'a version',
  summary: 'a short summary',
  phases: 'at least one phase',
  title: 'a title',
  kind: 'a kind',
  minutes: 'a duration in minutes',
  instructions: 'instructions',
  schemaVersion: 'schemaVersion: 1',
}

/** Last non-numeric segment of a dotted path, e.g. `phases.2.title` -> `title`. */
function lastKey(path: string): string {
  const parts = path.split('.').filter((p) => !/^\d+$/.test(p))
  return parts[parts.length - 1] ?? path
}

/** Human location for a path: `phases.1.title` -> `Phase 2, title`. */
function where(path: string): string {
  const m = /^phases\.(\d+)(?:\.(.+))?$/.exec(path)
  if (m)
    return m[2]
      ? `Phase ${Number(m[1]) + 1}, ${m[2].replace(/\./g, ' > ')}`
      : `Phase ${Number(m[1]) + 1}`
  const t = /^triggers\.(\d+)(?:\.(.+))?$/.exec(path)
  if (t) return t[2] ? `Trigger ${Number(t[1]) + 1}, ${t[2]}` : `Trigger ${Number(t[1]) + 1}`
  return path === 'blueprint' ? 'The blueprint' : path
}

/** Turn one issue into a short, actionable sentence. Unknown shapes fall back to the original text. */
export function explainIssue(issue: BlueprintIssue): string {
  const { path, message } = issue
  const at = where(path)
  const key = lastKey(path)

  if (path === 'json')
    return `That is not valid JSON (${message}). Check commas, quotes and brackets.`
  if (
    /expected string, received undefined|expected number, received undefined|expected .* received undefined|Required/i.test(
      message,
    )
  ) {
    return `Add ${FIELD_NAMES[key] ?? `a value for "${key}"`}${at !== key ? ` (${at})` : ''}.`
  }
  if (/expected array to have >=1/i.test(message)) return 'Add at least one phase.'
  if (/expected array to have <=/i.test(message)) return `${at} has too many items. Remove some.`
  if (/lowercase letters, digits and single dashes/.test(message))
    return `${at}: use only lowercase letters, numbers and single dashes (for example "my-method").`
  if (/semver/.test(message)) return `${at}: write the version like 1.0.0.`
  if (/Unrecognized key/i.test(message)) {
    const names = /"([^"]+)"/g
    const found = [...message.matchAll(names)].map((x) => x[1])
    return `${at === 'The blueprint' ? 'Remove' : `${at}: remove`} the unknown field${found.length === 1 ? '' : 's'} ${found.map((f) => `"${f}"`).join(', ') || ''}.`.replace(
      ' .',
      '.',
    )
  }
  if (/Invalid option|expected one of/i.test(message)) {
    const opts = [...message.matchAll(/"([^"]+)"/g)].map((x) => x[1])
    return `${at}: pick one of ${opts.join(', ')}.`
  }
  if (/Too small: expected string to have >=1/i.test(message)) return `${at}: this cannot be empty.`
  if (/Too big: expected string to have <=(\d+)/i.test(message)) {
    const n = /<=(\d+)/.exec(message)?.[1]
    return `${at}: shorten this to ${n} characters or fewer.`
  }
  if (
    /Invalid input: expected literal|Invalid input: expected 1/i.test(message) &&
    key === 'schemaVersion'
  )
    return 'Set "schemaVersion" to 1.'
  const dup = /^duplicate phase id "(.+)"$/.exec(message)
  if (dup) return `${at}: two phases share the id "${dup[1]}". Give each phase its own id.`
  const unknownPhase = /^unknown phase "(.+)"$/.exec(message)
  if (unknownPhase)
    return `${at}: there is no phase with id "${unknownPhase[1]}". Check the spelling.`
  const unknownParam = /^unknown param "(.+)"$/.exec(message)
  if (unknownParam) return `${at}: the setting "${unknownParam[1]}" is not defined under "params".`
  if (/a score branch needs/.test(message))
    return `${at}: set "scored": true on this phase, or branch on confidence instead.`
  if (/can leave the allowed range/.test(message))
    return `${at}: ${message.replace('; set its min and max', '. Give that param a min and max inside the allowed range.')}`
  return `${at}: ${message}`
}
