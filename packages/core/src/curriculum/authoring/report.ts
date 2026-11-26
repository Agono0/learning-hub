/**
 * One call that runs every heuristic check and returns a single report.
 * The report is advice for authors. It never blocks saving or publishing.
 */
import type { LhcfCourse } from '../lhcf/schema'
import { lhcfStats, type LhcfStats } from '../lhcf/stats'
import { ALIGNMENT_RULES, alignCourse, alignmentFindings, type AlignmentMatrix } from './alignment'
import { ceilingHistogram, type BloomLevel } from './bloom'
import { indexCourse } from './course-index'
import { DUPLICATE_RULES, duplicateFindings } from './duplicates'
import { EXERCISE_RULES, lintExercises } from './exercise-lint'
import {
  DEFAULT_TIME_MODEL,
  TIME_RULES,
  summarizeTime,
  timeFindings,
  timeReferences,
  type LessonTimeReference,
  type TimeModel,
  type TimeSummary,
} from './time'
import {
  sortFindings,
  summarizeFindings,
  withoutIgnored,
  type Finding,
  type RuleInfo,
} from './types'

export const ALL_RULES: RuleInfo[] = [
  ...ALIGNMENT_RULES,
  ...EXERCISE_RULES,
  ...DUPLICATE_RULES,
  ...TIME_RULES,
]

export interface AnalyzeOptions {
  /** Rule ids to hide. Ignored rules are still counted in `ignoredCount`. */
  ignore?: readonly string[]
  timeModel?: TimeModel
}

export interface CourseReport {
  stats: LhcfStats
  findings: Finding[]
  ignoredCount: number
  summary: ReturnType<typeof summarizeFindings>
  alignment: AlignmentMatrix
  time: { summary: TimeSummary; lessons: LessonTimeReference[]; model: TimeModel }
  /** Exercises by the highest Bloom level their format can reach (a ceiling, not a measurement). */
  formatCeilings: Record<BloomLevel, number>
  /** Always shown with the report so nobody reads it as a quality grade. */
  disclaimer: string
}

export const REPORT_DISCLAIMER =
  'These are text heuristics. They point at places worth a second look. They do not measure how well the course teaches, and every finding can be dismissed.'

/** Run all checks on a validated course. */
export function analyzeCourse(course: LhcfCourse, options: AnalyzeOptions = {}): CourseReport {
  const index = indexCourse(course)
  const alignment = alignCourse(course, index)
  const model = options.timeModel ?? DEFAULT_TIME_MODEL
  const all = [
    ...alignmentFindings(course, alignment),
    ...lintExercises(course, index),
    ...duplicateFindings(course, index),
    ...timeFindings(course, model),
  ]
  const kept = withoutIgnored(all, options.ignore ?? [])
  const refs = timeReferences(course, model)
  return {
    stats: lhcfStats(course),
    findings: sortFindings(kept),
    ignoredCount: all.length - kept.length,
    summary: summarizeFindings(kept),
    alignment,
    time: { summary: summarizeTime(course, refs), lessons: refs, model },
    formatCeilings: ceilingHistogram(index.exercises.map((e) => e.exercise)),
    disclaimer: REPORT_DISCLAIMER,
  }
}

/** Look up a rule by id (for tooltips). */
export function ruleInfo(ruleId: string): RuleInfo | undefined {
  return ALL_RULES.find((r) => r.ruleId === ruleId)
}

/** Findings as a Markdown checklist, grouped by severity. */
export function reportToMarkdown(report: CourseReport, title = 'Course review'): string {
  const lines = [`# ${title}`, '', `> ${report.disclaimer}`, '']
  const s = report.summary
  lines.push(
    `${s.total} finding(s): ${s.bySeverity.warning} warning, ${s.bySeverity.notice} notice, ${s.bySeverity.info} info.${report.ignoredCount ? ` ${report.ignoredCount} hidden by ignored rules.` : ''}`,
    '',
  )
  for (const sev of ['warning', 'notice', 'info'] as const) {
    const items = report.findings.filter((f) => f.severity === sev)
    if (items.length === 0) continue
    lines.push(`## ${sev[0]!.toUpperCase()}${sev.slice(1)}`, '')
    for (const f of items) {
      lines.push(`- [ ] \`${f.ruleId}\` at \`${f.path}\`: ${f.message}`)
      lines.push(`  - Evidence: ${f.evidence}`)
      lines.push(`  - Could be wrong when: ${f.falsePositive}`)
      if (f.suggestion) lines.push(`  - Try: ${f.suggestion}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
