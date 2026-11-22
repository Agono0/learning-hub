/**
 * Daily work summary (S3-79) — the shareable "how the day went" text block
 * built from data the caller already has (tasks + the day's logs + the
 * evaluation row). Pure, deterministic, plain text: one call, one string —
 * the UI renders it through `<Markdown>` (rule 11) and offers copy/share.
 *
 * SP parity: total tracked, completed count, the day's top tasks by tracked
 * time (leaf-aware via {@link rollupByTask}), and the evaluation line when
 * present. Honest zero state ("No tracked time yet") — never fabricated.
 */
import type { TimeLog } from './time-tracking'
import { rollupByTask } from './worklog'

/** A task as the summary needs it. */
export interface SummaryTask {
  id: number
  title: string
  parentId: number | null
  isDone: boolean
}

/** The evaluation line's inputs (all optional). */
export interface SummaryEvaluation {
  impact: number | null
  energy: number | null
  reflection: string | null
}

/** How many top tasks the summary lists. */
export const SUMMARY_TOP_TASKS = 5

/**
 * Build the day's shareable summary. Deterministic: same input → same text
 * (stable for tests and for the share sheet's preview).
 */
export function dailySummaryText(
  day: string,
  tasks: readonly SummaryTask[],
  logs: readonly TimeLog[],
  evaluation?: SummaryEvaluation,
): string {
  const dayLogs = logs.filter((l) => l.day === day)
  const totalMs = dayLogs.reduce((sum, l) => sum + l.sessionMs, 0)
  const doneIds = new Set(tasks.filter((t) => t.isDone).map((t) => t.id))
  const doneToday = tasks.filter((t) => t.isDone && dayLogs.some((l) => l.taskId === t.id)).length

  const lines: string[] = [`Work summary — ${day}`, '']
  const hours = Math.floor(totalMs / 3_600_000)
  const minutes = Math.round((totalMs % 3_600_000) / 60_000)
  lines.push(
    totalMs === 0
      ? 'No tracked time yet.'
      : `Tracked: ${hours > 0 ? `${hours}h ` : ''}${minutes}m across ${doneIds.size > 0 ? `${doneToday} completed` : 'open work'}`,
  )

  if (totalMs > 0) {
    const parentIds = new Set(
      tasks.filter((t) => t.parentId !== null).map((t) => t.parentId as number),
    )
    const totals = rollupByTask(dayLogs, parentIds)
      .slice(0, SUMMARY_TOP_TASKS)
      .map((t) => {
        const task = tasks.find((x) => x.id === t.taskId)
        const minutes = Math.max(1, Math.round(t.totalMs / 60_000))
        return `- ${task?.title ?? `Task #${t.taskId}`} — ${minutes}m`
      })
    if (totals.length > 0) {
      lines.push('', 'Top tasks:')
      lines.push(...totals)
    }
  }

  if (evaluation && (evaluation.impact !== null || evaluation.energy !== null)) {
    const parts: string[] = []
    if (evaluation.impact !== null) parts.push(`impact ${evaluation.impact}/4`)
    if (evaluation.energy !== null) parts.push(`energy ${evaluation.energy}/3`)
    lines.push('', `Evaluation: ${parts.join(', ')}.`)
    if (evaluation.reflection !== null && evaluation.reflection.trim() !== '') {
      lines.push(evaluation.reflection.trim())
    }
  }

  return lines.join('\n')
}
