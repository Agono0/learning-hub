/**
 * Read-side task rollups shared by the CLI and MCP (the web handlers /api/tasks-worklog and
 * /api/tasks-finish-day compute the same shapes inline).
 */
import { getTaskItem, listTaskItems, listTimeLogs, runArchivePass, sumTimeLogs } from './tasks'

export interface WorklogRollup {
  from: string
  to: string
  totalMs: number
  perDay: { day: string; totalMs: number }[]
  perTask: { taskId: number; title: string | null; totalMs: number }[]
  logCount: number
}

/** Per-day and per-task tracked time between two YYYY-MM-DD days, inclusive. */
export function worklogRollup(from: string, to: string): WorklogRollup {
  const logs = listTimeLogs({ from, to })
  const perDay = new Map<string, number>()
  const perTask = new Map<number, number>()
  for (const log of logs) {
    perDay.set(log.day, (perDay.get(log.day) ?? 0) + log.sessionMs)
    perTask.set(log.taskId, (perTask.get(log.taskId) ?? 0) + log.sessionMs)
  }
  return {
    from,
    to,
    totalMs: logs.reduce((sum, l) => sum + l.sessionMs, 0),
    perDay: [...perDay.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, totalMs]) => ({ day, totalMs })),
    perTask: [...perTask.entries()]
      .map(([taskId, totalMs]) => ({ taskId, title: getTaskItem(taskId)?.title ?? null, totalMs }))
      .sort((a, b) => b.totalMs - a.totalMs),
    logCount: logs.length,
  }
}

export interface FinishDayResult {
  day: string
  completedThatDay: { id: number; title: string }[]
  trackedMs: number
  stillOpenForDay: { id: number; title: string; due: string | null }[]
  archive: { archived: number[]; promoted: number[]; restored: number[] }
}

/** The end-of-day pass: what got done, time tracked, what is still due, then the archive pass. */
export function finishDay(day: string, now: string = new Date().toISOString()): FinishDayResult {
  const completedThatDay = listTaskItems({
    projectId: 'any',
    parentId: 'any',
    includeDone: true,
    includeWontdo: true,
  }).filter((t) => t.isDone && t.doneAt?.startsWith(day) === true)
  const stillOpenForDay = listTaskItems({ projectId: 'any', parentId: 'any' }).filter(
    (t) => t.due?.startsWith(day) === true && !t.dueWithTime,
  )
  return {
    day,
    completedThatDay: completedThatDay.map((t) => ({ id: t.id, title: t.title })),
    trackedMs: sumTimeLogs({ from: day, to: day }),
    stillOpenForDay: stillOpenForDay.map((t) => ({ id: t.id, title: t.title, due: t.due })),
    archive: runArchivePass(undefined, now),
  }
}
