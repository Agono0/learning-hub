'use client'

/**
 * Task summary table (S3-46) — per-task tracked totals plus the per-project
 * rollup, fed by the S3-88 core math (`rollupByTask` keeps SP's leaf-only
 * rule so parent rows are never double counted). Presentation only: the
 * caller supplies the window's logs and the id→name maps.
 */
import React from 'react'
import { rollupByTask, totalTracked, type TimeLog, type WorklogTaskTotal } from '@learning-hub/core'
import { humanMs } from './TaskIndicators'

/** Minimal task shape the table needs (id → title / project mapping). */
export interface SummaryTask {
  id: number
  title: string
  projectId: number | null
  /** Parent id for the leaf-only rollup (null = leaf itself). */
  parentId: number | null
}

/** Per-project rollup: sum the per-task totals by `projectId` (null bucket). */
export function sumByProject(
  taskTotals: WorklogTaskTotal[],
  tasks: Pick<SummaryTask, 'id' | 'projectId'>[],
): Array<{ projectId: number | null; totalMs: number; tasks: number }> {
  const projectOf = new Map(tasks.map((t) => [t.id, t.projectId]))
  const byProject = new Map<
    number | null,
    { projectId: number | null; totalMs: number; tasks: number }
  >()
  for (const total of taskTotals) {
    const projectId = projectOf.get(total.taskId) ?? null
    const bucket = byProject.get(projectId) ?? { projectId, totalMs: 0, tasks: 0 }
    bucket.totalMs += total.totalMs
    bucket.tasks += 1
    byProject.set(projectId, bucket)
  }
  return [...byProject.values()].sort((a, b) => b.totalMs - a.totalMs)
}

/** Parent ids that HAVE children (the leaf-only rollup input). */
export function parentIdsOf(tasks: Pick<SummaryTask, 'id' | 'parentId'>[]): Set<number> {
  return new Set(tasks.filter((t) => t.parentId !== null).map((t) => t.parentId as number))
}

export interface TaskSummaryTableProps {
  tasks: SummaryTask[]
  /** The window's time-log rows (core `TimeLog` shape = task_time_logs). */
  logs: TimeLog[]
  /** Project id → display name (page-resolved; null bucket labeled). */
  projectNames: Map<number, string>
}

/**
 * Two stacked tables: per-task totals (leaf-only, largest first, with each
 * row's share of the window total) and the per-project rollup over them.
 * Honest empty state when the window has no tracked sessions.
 */
export function TaskSummaryTable({ tasks, logs, projectNames }: TaskSummaryTableProps) {
  const parentIds = parentIdsOf(tasks)
  const taskTotals = rollupByTask(logs, parentIds)
  const projectTotals = sumByProject(taskTotals, tasks)
  const windowTotal = totalTracked(logs)

  return (
    <div className="space-y-4">
      <div className="scroll-x">
        <table className="w-full min-w-[320px] text-sm">
          <caption className="sr-only">Tracked time per task</caption>
          <thead>
            <tr className="text-left text-xs text-tertiary">
              <th scope="col" className="pb-1 pr-3 font-medium">
                Task
              </th>
              <th scope="col" className="pb-1 pr-3 font-medium">
                Sessions
              </th>
              <th scope="col" className="pb-1 pr-3 font-medium">
                Tracked
              </th>
              <th scope="col" className="pb-1 font-medium">
                Share
              </th>
            </tr>
          </thead>
          <tbody>
            {taskTotals.map((t) => {
              const task = tasks.find((x) => x.id === t.taskId)
              const share = windowTotal > 0 ? Math.round((t.totalMs / windowTotal) * 100) : 0
              return (
                <tr
                  key={t.taskId}
                  className="border-t border-neutral-200 dark:border-(--hub-border)"
                >
                  <td className="py-1.5 pr-3 text-neutral-700 dark:text-neutral-200">
                    {task?.title ?? `Task #${t.taskId}`}
                  </td>
                  <td className="py-1.5 pr-3 text-tertiary">{t.sessions}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{humanMs(t.totalMs)}</td>
                  <td className="py-1.5 tabular-nums text-tertiary">{share}%</td>
                </tr>
              )
            })}
            {taskTotals.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-xs text-tertiary">
                  No tracked sessions in this window yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="scroll-x">
        <table className="w-full min-w-[280px] text-sm">
          <caption className="sr-only">Tracked time per project</caption>
          <thead>
            <tr className="text-left text-xs text-tertiary">
              <th scope="col" className="pb-1 pr-3 font-medium">
                Project
              </th>
              <th scope="col" className="pb-1 pr-3 font-medium">
                Tasks
              </th>
              <th scope="col" className="pb-1 font-medium">
                Tracked
              </th>
            </tr>
          </thead>
          <tbody>
            {projectTotals.map((p) => (
              <tr
                key={String(p.projectId)}
                className="border-t border-neutral-200 dark:border-(--hub-border)"
              >
                <td className="py-1.5 pr-3 text-neutral-700 dark:text-neutral-200">
                  {p.projectId !== null
                    ? (projectNames.get(p.projectId) ?? `Project #${p.projectId}`)
                    : 'No project'}
                </td>
                <td className="py-1.5 pr-3 text-tertiary">{p.tasks}</td>
                <td className="py-1.5 tabular-nums">{humanMs(p.totalMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default TaskSummaryTable
