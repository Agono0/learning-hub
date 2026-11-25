'use client'

import React, { useState } from 'react'
import type { Issue } from '@learning-hub/core/curriculum'
import {
  ruleInfo,
  type AlignmentMatrix,
  type CourseReport,
  type Finding,
  type FindingSeverity,
} from '@learning-hub/core/curriculum/authoring'
import { Badge, Button, Callout, EmptyState } from '@/ui'

export const FINDINGS_SHOWN = 25

const SEVERITY_TONE: Record<FindingSeverity, 'warning' | 'accent' | 'neutral'> = {
  warning: 'warning',
  notice: 'accent',
  info: 'neutral',
}

export function ParseIssues({ errors }: { errors: Issue[] }) {
  return (
    <Callout tone="danger" title="This course could not be read">
      <ul className="list-disc pl-5" data-testid="course-issues">
        {errors.slice(0, 8).map((e, i) => (
          <li key={i}>
            {e.path ? `${e.path}: ` : ''}
            {e.message}
            {e.hint ? ` ${e.hint}` : ''}
          </li>
        ))}
      </ul>
      {errors.length > 8 && <p>{`${errors.length - 8} more problems not shown.`}</p>}
    </Callout>
  )
}

export function Disclaimer({ text }: { text: string }) {
  return (
    <p className="text-xs opacity-80" data-testid="disclaimer">
      {text}
    </p>
  )
}

export function FindingCard({
  finding,
  onIgnore,
}: {
  finding: Finding
  onIgnore?: (ruleId: string) => void
}) {
  const title = ruleInfo(finding.ruleId)?.title ?? finding.ruleId
  return (
    <li className="rounded-[16px] border border-border-subtle p-3" data-testid="finding">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={SEVERITY_TONE[finding.severity]}>{finding.severity}</Badge>
        <code className="text-xs">{finding.ruleId}</code>
      </div>
      <p className="mt-1 text-sm font-medium">{finding.message}</p>
      <p className="mt-1 text-xs opacity-80">
        <span className="font-medium">Where:</span> <code>{finding.path}</code>
      </p>
      <p className="text-xs opacity-80">
        <span className="font-medium">What it saw:</span> {finding.evidence}
      </p>
      <p className="text-xs opacity-80">
        <span className="font-medium">Could be wrong when:</span> {finding.falsePositive}
      </p>
      {finding.suggestion && (
        <p className="text-xs opacity-80">
          <span className="font-medium">Try:</span> {finding.suggestion}
        </p>
      )}
      {onIgnore && (
        <div className="mt-2">
          <Button
            variant="ghost"
            onClick={() => onIgnore(finding.ruleId)}
            aria-label={`Hide rule ${title}`}
          >
            Hide this rule
          </Button>
        </div>
      )}
    </li>
  )
}

export function FindingList({
  findings,
  onIgnore,
  limit = FINDINGS_SHOWN,
}: {
  findings: Finding[]
  onIgnore?: (ruleId: string) => void
  limit?: number
}) {
  const [all, setAll] = useState(false)
  if (findings.length === 0)
    return (
      <EmptyState title="Nothing flagged">
        The checks found nothing to look at. That does not prove the course is good.
      </EmptyState>
    )
  const shown = all ? findings : findings.slice(0, limit)
  return (
    <div>
      <ul className="space-y-2" data-testid="findings">
        {shown.map((f, i) => (
          <FindingCard key={`${f.ruleId}-${f.path}-${i}`} finding={f} onIgnore={onIgnore} />
        ))}
      </ul>
      {!all && findings.length > limit && (
        <div className="mt-2">
          <Button variant="secondary" onClick={() => setAll(true)}>
            {`Show all ${findings.length}`}
          </Button>
        </div>
      )}
    </div>
  )
}

export function SummaryBadges({ report }: { report: CourseReport }) {
  const s = report.summary
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="summary">
      <Badge tone="warning">{`${s.bySeverity.warning} warning`}</Badge>
      <Badge tone="accent">{`${s.bySeverity.notice} notice`}</Badge>
      <Badge>{`${s.bySeverity.info} info`}</Badge>
      {report.ignoredCount > 0 && (
        <span className="text-xs opacity-80">{`${report.ignoredCount} hidden by ignored rules`}</span>
      )}
    </div>
  )
}

export function IgnoredRules({
  ignored,
  onRestore,
}: {
  ignored: readonly string[]
  onRestore: (ruleId: string) => void
}) {
  if (ignored.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="ignored-rules">
      <span className="text-xs opacity-80">Hidden rules:</span>
      {ignored.map((id) => (
        <Button
          key={id}
          variant="ghost"
          onClick={() => onRestore(id)}
          aria-label={`Show rule ${id} again`}
        >
          {`${id} (show)`}
        </Button>
      ))}
    </div>
  )
}

export function StatsLine({ report }: { report: CourseReport }) {
  const s = report.stats
  return (
    <p className="text-sm" data-testid="stats">
      {`${s.modules} modules, ${s.lessons} lessons, ${s.exercises} exercises, ${s.skills} skills, ${s.projects} projects.`}
    </p>
  )
}

const cellTone = (score: number, matched: boolean) =>
  matched ? (score >= 0.6 ? 'bg-success-bg' : 'bg-accent-bg') : 'bg-warning-bg'

export function AlignmentTable({ matrix }: { matrix: AlignmentMatrix }) {
  if (matrix.rows.length === 0) return <EmptyState title="No lessons" />
  return (
    <div className="overflow-x-auto" data-testid="alignment-table">
      <table className="w-full min-w-[480px] text-left text-xs">
        <caption className="sr-only">
          Lesson objectives and how much each exercise overlaps them
        </caption>
        <thead>
          <tr>
            <th scope="col" className="p-1">
              Lesson objective
            </th>
            <th scope="col" className="p-1">
              Level
            </th>
            <th scope="col" className="p-1">
              Exercises (overlap)
            </th>
            <th scope="col" className="p-1">
              Exam
            </th>
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((r) => (
            <tr key={r.lessonSlug} className="border-t border-border-subtle align-top">
              <th scope="row" className="p-1 font-normal">
                <span className="block font-medium">{r.lessonSlug}</span>
                <span className="opacity-80">{r.objective}</span>
              </th>
              <td className="p-1">{r.level ?? 'no verb'}</td>
              <td className="p-1">
                {r.cells.length === 0 ? (
                  <span className="opacity-80">none</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {r.cells.map((c, i) => (
                      <span
                        key={c.exercisePath}
                        className={`rounded px-1 ${cellTone(c.score, c.matched)}`}
                        title={c.matched ? `matched by ${c.basis}` : 'no match'}
                        data-testid={c.matched ? 'cell-matched' : 'cell-unmatched'}
                      >
                        {`#${i + 1} ${Math.round(c.score * 100)}%${c.matched ? '' : ' no match'}`}
                      </span>
                    ))}
                  </span>
                )}
              </td>
              <td className="p-1">{r.examMatches.length}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function OutcomeTable({ matrix }: { matrix: AlignmentMatrix }) {
  if (matrix.outcomes.length === 0)
    return <p className="text-sm opacity-80">This course lists no outcomes.</p>
  return (
    <ul className="space-y-2 text-sm" data-testid="outcomes">
      {matrix.outcomes.map((o) => (
        <li key={o.path} className="rounded-[16px] border border-border-subtle p-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={o.covered ? 'success' : 'warning'}>
              {o.covered ? 'matched' : 'no lesson'}
            </Badge>
            <span>{o.outcome}</span>
          </div>
          <p className="text-xs opacity-80">
            {o.lessons.length > 0 ? `Lessons: ${o.lessons.map((l) => l.slug).join(', ')}. ` : ''}
            {`Exam items: ${o.examMatches.length}.`}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function LevelBars({ matrix }: { matrix: AlignmentMatrix }) {
  const entries = Object.entries(matrix.levelCounts)
  const max = Math.max(1, ...entries.map(([, n]) => n))
  return (
    <ul className="space-y-1 text-xs" data-testid="level-bars">
      {entries.map(([level, n]) => (
        <li key={level} className="flex items-center gap-2">
          <span className="w-24 shrink-0">{level}</span>
          <span
            className="h-2 rounded bg-accent-bg"
            style={{ width: `${(n / max) * 100}%`, minWidth: n > 0 ? 6 : 0 }}
            aria-hidden="true"
          />
          <span>{n}</span>
        </li>
      ))}
    </ul>
  )
}

export function TimeTable({ report }: { report: CourseReport }) {
  const { lessons, summary } = report.time
  return (
    <div data-testid="time-table">
      <p className="text-xs opacity-80">
        Minutes are numbers the author typed. The reference is a content-size budget (reading speed
        plus answering time). It is not measured learner time.
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[360px] text-left text-xs">
          <thead>
            <tr>
              <th scope="col" className="p-1">
                Lesson
              </th>
              <th scope="col" className="p-1">
                Author
              </th>
              <th scope="col" className="p-1">
                Reference
              </th>
              <th scope="col" className="p-1">
                Ratio
              </th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((l) => (
              <tr key={l.lessonSlug} className="border-t border-border-subtle">
                <th scope="row" className="p-1 font-normal">
                  {l.lessonSlug}
                </th>
                <td className="p-1">
                  {l.authorMinutes === undefined ? 'not set' : `${l.authorMinutes} min`}
                </td>
                <td className="p-1">{`${Math.round(l.referenceMinutes)} min`}</td>
                <td className="p-1">{l.ratio === undefined ? '' : `${l.ratio}x`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs">
        {`Author total ${summary.authorMinutesTotal} min across ${summary.lessonsWithAuthorMinutes} of ${summary.lessonCount} lessons, reference total ${summary.referenceMinutesTotal} min.`}
      </p>
    </div>
  )
}
