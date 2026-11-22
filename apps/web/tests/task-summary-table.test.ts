/**
 * Task summary table (S3-46) — the per-project rollup math over the S3-88
 * leaf-only per-task totals, plus SSR rendering of both tables and the
 * honest empty state.
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import {
  TaskSummaryTable,
  parentIdsOf,
  sumByProject,
  type SummaryTask,
} from '../src/components/tasks/TaskSummaryTable'

const task = (over: Partial<SummaryTask> = {}): SummaryTask => ({
  id: 1,
  title: 'Write docs',
  projectId: null,
  parentId: null,
  ...over,
})

const log = (taskId: number, sessionMs: number, day = '2026-11-21') => ({
  id: taskId * 100,
  taskId,
  day,
  sessionMs,
  startedAt: null,
  source: 'manual' as const,
  createdAt: '2026-11-21T00:00:00.000Z',
})

describe('sumByProject', () => {
  it('aggregates task totals per project and sorts largest first', () => {
    const tasks = [
      task({ id: 1, projectId: 7 }),
      task({ id: 2, projectId: 7 }),
      task({ id: 3, projectId: null }),
    ]
    const totals = [
      { taskId: 1, sessions: 2, totalMs: 60_000, perDay: {} },
      { taskId: 2, sessions: 1, totalMs: 30_000, perDay: {} },
      { taskId: 3, sessions: 1, totalMs: 95_000, perDay: {} },
    ]
    expect(sumByProject(totals, tasks)).toEqual([
      { projectId: null, totalMs: 95_000, tasks: 1 },
      { projectId: 7, totalMs: 90_000, tasks: 2 },
    ])
  })

  it('unknown task ids land in the null bucket (deleted rows linger)', () => {
    expect(sumByProject([{ taskId: 99, sessions: 1, totalMs: 5_000, perDay: {} }], [])).toEqual([
      { projectId: null, totalMs: 5_000, tasks: 1 },
    ])
  })
})

describe('parentIdsOf', () => {
  it('collects ids that have children', () => {
    expect(parentIdsOf([task({ id: 1 }), task({ id: 2, parentId: 1 })])).toEqual(new Set([1]))
  })
})

describe('TaskSummaryTable rendering', () => {
  it('renders per-task rows leaf-only with share of the window total', () => {
    const tasks = [
      task({ id: 1, title: 'Parent with kids' }),
      task({ id: 2, title: 'Actual work', projectId: 7, parentId: 1 }),
    ]
    const logs = [
      log(1, 60_000), // parent row: dropped from the leaf-only totals
      log(2, 5_400_000),
    ]
    const html = renderToString(
      React.createElement(TaskSummaryTable, {
        tasks,
        logs,
        projectNames: new Map([[7, 'Docs project']]),
      }),
    ).replace(/<!-- -->/g, '')
    // The window headline counts ALL rows (S3-88: leaf-only applies to the
    // per-task table, not the headline), so the kept row's share is 99%.
    expect(html).toContain('Actual work')
    expect(html).toContain('1h 30m')
    expect(html).toContain('99%')
    expect(html).not.toContain('Parent with kids') // leaf-only rule hides it
    expect(html).toContain('Docs project')
  })

  it('renders the honest empty state without tracked sessions', () => {
    const html = renderToString(
      React.createElement(TaskSummaryTable, { tasks: [task()], logs: [], projectNames: new Map() }),
    )
    expect(html).toContain('No tracked sessions in this window yet.')
  })
})
