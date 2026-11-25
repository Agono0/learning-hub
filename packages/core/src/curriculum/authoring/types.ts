/**
 * Shared vocabulary of the course authoring workbench.
 *
 * Every check in this folder is a HEURISTIC over the text of a course. A
 * finding says what was observed (`evidence`), which rule saw it (`ruleId`)
 * and when the rule is probably wrong (`falsePositive`). Nothing here judges
 * how well a course teaches, and no finding blocks publishing.
 */

/** How loudly the UI should show a finding. `info` is a suggestion only. */
export type FindingSeverity = 'info' | 'notice' | 'warning'

export const SEVERITY_ORDER: Record<FindingSeverity, number> = { info: 0, notice: 1, warning: 2 }

/** One heuristic observation about a course. */
export interface Finding {
  /** Stable rule id, e.g. `align.objective-uncovered`. Safe to use as an ignore key. */
  ruleId: string
  severity: FindingSeverity
  /** Location in the course document, e.g. `modules[0].lessons[2].exercises[1]`. */
  path: string
  /** One sentence for the author. */
  message: string
  /** The concrete text or numbers the rule looked at. */
  evidence: string
  /** When this finding is likely wrong, so authors can dismiss it quickly. */
  falsePositive: string
  /** Optional next step the author could try. */
  suggestion?: string
}

/** Rule metadata for documentation and for the ignore list in the UI. */
export interface RuleInfo {
  ruleId: string
  title: string
  severity: FindingSeverity
  /** What the rule measures, in plain words. */
  measures: string
  /** Known ways the rule can be wrong. */
  falsePositive: string
}

/** Build a finding while keeping the shape uniform. */
export function finding(f: Finding): Finding {
  return f
}

/** Sort findings by severity (loudest first), then path, then rule id. */
export function sortFindings(findings: readonly Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
      a.path.localeCompare(b.path, 'en', { numeric: true }) ||
      a.ruleId.localeCompare(b.ruleId),
  )
}

/** Drop findings whose rule id the author chose to ignore. */
export function withoutIgnored(
  findings: readonly Finding[],
  ignoredRuleIds: ReadonlySet<string> | readonly string[],
): Finding[] {
  const ignored = ignoredRuleIds instanceof Set ? ignoredRuleIds : new Set(ignoredRuleIds)
  return findings.filter((f) => !ignored.has(f.ruleId))
}

/** Count findings per severity and per rule. */
export function summarizeFindings(findings: readonly Finding[]): {
  total: number
  bySeverity: Record<FindingSeverity, number>
  byRule: Record<string, number>
} {
  const bySeverity: Record<FindingSeverity, number> = { info: 0, notice: 0, warning: 0 }
  const byRule: Record<string, number> = {}
  for (const f of findings) {
    bySeverity[f.severity] += 1
    byRule[f.ruleId] = (byRule[f.ruleId] ?? 0) + 1
  }
  return { total: findings.length, bySeverity, byRule }
}

/** Shorten text for evidence strings without cutting a surrogate pair. */
export function clip(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat)
  return chars.length <= max ? flat : `${chars.slice(0, max - 1).join('')}…`
}

/** Format a ratio as a whole percent. */
export function pct(n: number, d: number): string {
  return d === 0 ? '0%' : `${Math.round((n / d) * 100)}%`
}
