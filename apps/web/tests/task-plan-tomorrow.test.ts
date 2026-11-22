/**
 * Plan-for-tomorrow panel (S3-49) — SSR rendering: SSR-safe pre-mount state,
 * the planned list, the calm empty state, and the honest preview. The due
 * math itself is core-tested (tasks-plan-tomorrow.test.ts).
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { taskItemSchema, type TaskItem } from '@learning-hub/core'
import { PlanTomorrow } from '../src/components/tasks/PlanTomorrow'

const TODAY = '2026-11-22'

function item(over: Partial<TaskItem> = {}): TaskItem {
  return taskItemSchema.parse({
    id: 1,
    parentId: null,
    projectId: null,
    tagIds: [],
    title: 'Ship it',
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
    createdAt: '2026-11-22T00:00:00.000Z',
    updatedAt: '2026-11-22T00:00:00.000Z',
    ...over,
  })
}

const panel = (tasks: TaskItem[], today: string | null = TODAY): string =>
  renderToString(
    React.createElement(
      QueryClientProvider,
      { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
      React.createElement(PlanTomorrow, {
        today,
        tasks,
        tagNames: new Map([[3, 'work']]),
        onAdded: () => {},
      }),
    ),
  ).replace(/<!-- -->/g, '')

describe('PlanTomorrow rendering', () => {
  it('renders the capture surface with the tomorrow key', () => {
    const html = panel([], TODAY)
    expect(html).toContain('Plan for tomorrow')
    expect(html).toContain('2026-11-23')
    expect(html).toContain('Task for tomorrow')
  })

  it('waits honestly until the client clock mounted (today null)', () => {
    const html = panel([], null)
    expect(html).not.toContain('2026-11-23')
    expect(html).toContain('Plan for tomorrow')
  })

  it('lists tomorrow-planned tasks with a pull-back-to-today affordance', () => {
    const html = panel([
      item({ id: 1, title: 'Review PRs', due: '2026-11-23', tagIds: [3] }),
      item({ id: 2, title: 'Today thing', due: TODAY }),
    ])
    expect(html).toContain('Review PRs')
    expect(html).toContain('#work')
    expect(html).toContain('Move Review PRs back to today')
    expect(html).not.toContain('Today thing') // exclusivity: not tomorrow's list
  })

  it('stays calm and honest when tomorrow is empty', () => {
    expect(panel([], TODAY)).toContain('tomorrow stays calm by default')
  })
})
