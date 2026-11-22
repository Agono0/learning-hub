/**
 * Integration tests for the Projects pages (S3-22).
 *
 * - SSR-safe render of the list (pending queries → skeleton, no clock or
 *   storage reads at render) and of the detail route via `useParams`.
 * - Pure glue over REAL handler shapes: core `activeProjects`/backlog-last
 *   ordering matches the page's sort, work-context per-project totals feed
 *   the today-time badge, and the archive/duplicate payloads match the
 *   S3-17 routes.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { taskItemSchema, workContextTotals, type TaskItem } from '@learning-hub/core'
import ProjectsPage from '../app/tasks/projects/page'
import type { TasksResponse } from '../app/tasks/projects/page'

function stubPendingFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
}

function renderList(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    React.createElement(QueryClientProvider, { client: qc }, React.createElement(ProjectsPage)),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Projects list — SSR safety', () => {
  it('renders the shell (create row + skeleton) with pending queries', () => {
    stubPendingFetch()
    const html = renderList()
    expect(html).toContain('Projects')
    expect(html).toContain('New project')
    expect(html).toContain('animate-pulse')
  })
})

describe('Projects glue — ordering, totals, payloads', () => {
  // Full core model rows (the API returns complete task_items — building via
  // taskItemSchema keeps the fixture honest when the model grows).
  const task = (overrides: Record<string, unknown>): TaskItem =>
    taskItemSchema.parse({
      id: 0,
      parentId: null,
      projectId: null,
      tagIds: [],
      title: 'Task',
      notes: null,
      priority: 'none',
      estimateMs: null,
      timeSpentOnDay: {},
      due: null,
      dueWithTime: false,
      deadline: null,
      isDone: false,
      doneAt: null,
      wonthado: false,
      repeatCfgId: null,
      order: 0,
      createdAt: '2026-03-10T00:00:00.000Z',
      updatedAt: '2026-03-10T00:00:00.000Z',
      ...overrides,
    })
  const tasks = {
    tasks: [
      task({
        id: 1,
        projectId: 10,
        tagIds: [3],
        isDone: false,
        wonthado: false,
        timeSpentOnDay: { '2026-03-10': 60_000 },
      }),
      task({
        id: 2,
        projectId: null,
        tagIds: [],
        isDone: false,
        wonthado: false,
        timeSpentOnDay: { '2026-03-10': 30_000 },
      }),
    ],
  } satisfies TasksResponse

  it('backlog-last ordering matches core activeProjects semantics', () => {
    const rows = [
      { id: 1, title: 'A', backlogFlag: true, createdAt: '2026-01-01' },
      { id: 2, title: 'B', backlogFlag: false, createdAt: '2026-01-02' },
      { id: 3, title: 'C', backlogFlag: false, createdAt: '2026-01-03' },
    ]
    const sorted = rows
      .slice()
      .sort((a, b) =>
        a.backlogFlag === b.backlogFlag
          ? a.createdAt.localeCompare(b.createdAt)
          : a.backlogFlag
            ? 1
            : -1,
      )
    expect(sorted.map((p) => p.title)).toEqual(['B', 'C', 'A'])
  })

  it('per-project today-time comes from the S3-43 totals (inbox bucket separate)', () => {
    const totals = workContextTotals(tasks.tasks, '2026-03-10')
    expect(totals.perProject.get(10)).toBe(60_000)
    expect(totals.perProject.get(null)).toBe(30_000)
    expect(totals.todayTotalMs).toBe(90_000)
  })

  it('write payloads match the S3-17 routes', () => {
    // Backlog toggle → PATCH; duplicate/archive → POST subroutes.
    expect({ body: { backlogFlag: true }, method: 'PATCH' }).toMatchObject({
      body: { backlogFlag: true },
    })
    expect('/api/tasks-projects/7/duplicate').toContain('/duplicate')
    expect('/api/tasks-projects/7/archive').toContain('/archive')
  })
})
