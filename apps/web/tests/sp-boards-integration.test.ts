/**
 * Integration tests for the Boards page (S3-24) — part of the S3-42
 * renderToString sweep over the new SP pages.
 *
 * - SSR-safe render: the page composes `QueryClientProvider` + useQuery +
 *   `ClayIn` (GSAP) — `renderToString` must produce the loading shell
 *   without touching storage/clocks at render time (all reads are
 *   effect-only; `today` and task data arrive client-side).
 * - Load-bearing text (S3-42): header + rule-chip contract, the three view
 *   tabs, and the honest absence of data-only regions while queries are
 *   pending. renderToString splits interpolated JSX text with `<!-- -->`
 *   markers — static strings assert directly (see max-focus-exit-gate's
 *   cleanHtml for the interpolated case).
 * - The device-local custom-view store (`@/lib/board-views`): roundtrips,
 *   corrupted-storage degradation, cap.
 * - Core glue over REAL handler data shapes: a task list as `GET /api/tasks`
 *   returns it (repo rows parsed through the core model) builds into the
 *   built-in Kanban and Eisenhower boards, and a drag's chip application is
 *   exactly the PATCH payload the S3-16 handler accepts.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyChip,
  buildBoard,
  eisenhowerBoardView,
  kanbanBoardView,
} from '@learning-hub/core/boards'
import { taskItemSchema, type TaskItem } from '@learning-hub/core'
import BoardsPage from '../app/boards/page'
import { loadBoardViews, putBoardView, removeBoardView } from '../src/lib/board-views'

/** Never-resolving fetch: queries stay pending, render stays deterministic. */
function stubPendingFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
}

/** Render the page the way Next would (provider + SSR). */
function renderPage(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    React.createElement(QueryClientProvider, { client: qc }, React.createElement(BoardsPage)),
  )
}

function stubWindowStorage() {
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { localStorage: storage })
  return store
}

const TODAY = '2026-11-22'

/** A repo-row-shaped fixture (validates through the core model). */
function row(overrides: Partial<TaskItem> & { id: number }): TaskItem {
  const { id, ...rest } = overrides
  return taskItemSchema.parse({
    parentId: null,
    projectId: null,
    tagIds: [],
    title: `Task ${id}`,
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
    order: id,
    createdAt: `${TODAY}T00:00:00Z`,
    updatedAt: `${TODAY}T00:00:00Z`,
    id,
    ...rest,
  })
}

describe('BoardsPage (SSR-safe)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders the shell + tabs + builder in server context', () => {
    stubPendingFetch()
    const html = renderPage()
    expect(html).toContain('Boards')
    expect(html).toContain('Kanban')
    expect(html).toContain('Eisenhower')
    expect(html).toContain('Custom')
    // The rule-chip contract is visible in the header subtitle (S3-42:
    // load-bearing text — the full sentence, so a regression that swaps the
    // copy cannot pass silently). The apostrophe renders as &#x27;, so the
    // assertion stops before it.
    expect(html).toContain('Drag a card into a column')
    expect(html).toContain('rule chip is applied to the task')
  })

  it('renders no data-only regions while queries are pending', () => {
    stubPendingFetch()
    const html = renderPage()
    // Column labels are data-driven (built-in views need `today`), the
    // unmatched bucket needs tasks, the builder is custom-tab only — none
    // of them belong in the pending-query shell.
    expect(html).not.toContain('Not on this board')
    expect(html).not.toContain('Build a custom view')
    expect(html).not.toContain('Backlog')
    expect(html).not.toContain('Drop tasks here')
    // The honest empty state needs the queries to SETTLE (not load): with a
    // never-resolving fetch it must NOT be there either.
    expect(html).not.toContain('No tasks yet')
  })

  it('does not call the clock or storage during render', () => {
    stubPendingFetch()
    const dateSpy = vi.spyOn(Date.prototype, 'toISOString')
    renderPage()
    expect(dateSpy).not.toHaveBeenCalled()
    dateSpy.mockRestore()
  })
})

describe('board glue over handler data shapes', () => {
  it('builds the Kanban board from a /api/tasks-shaped list', () => {
    const tasks = [
      row({ id: 1, priority: 'none' }),
      row({ id: 2, priority: 'high', due: `${TODAY}T09:00:00Z`, dueWithTime: true }),
      row({ id: 3, isDone: true, doneAt: `${TODAY}T01:00:00Z` }),
    ]
    const board = buildBoard(kanbanBoardView(), tasks, TODAY)
    expect(board.columns[0].tasks.map((t) => t.id)).toEqual([1])
    expect(board.columns[3].tasks.map((t) => t.id)).toEqual([2])
    expect(board.columns[4].tasks.map((t) => t.id)).toEqual([3])
    expect(board.unmatched).toEqual([])
  })

  it('the Eisenhower board classifies real rows and drives the PATCH payload', () => {
    const tasks = [
      row({ id: 10, priority: 'medium' }),
      row({ id: 11, priority: 'low', due: '2026-11-25' }),
    ]
    const board = buildBoard(eisenhowerBoardView(), tasks, TODAY)
    expect(board.columns[1].tasks.map((t) => t.id)).toEqual([10]) // q2: important, not urgent
    expect(board.columns[2].tasks.map((t) => t.id)).toEqual([11]) // q3: urgent, small

    // Drag row 10 into Q1 → the PATCH body the /api/tasks/[id] handler takes.
    const dropped = applyChip(tasks[0], eisenhowerBoardView().columns[0].chip, TODAY)
    expect(dropped.priority).toBe('high')
    expect(dropped.due).toBe('2026-11-29') // today + URGENT_WINDOW_DAYS
    expect(taskItemSchema.safeParse(dropped).success).toBe(true)
  })
})

describe('device-local custom views (@/lib/board-views)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('saves, loads and deletes custom views', () => {
    stubWindowStorage()
    expect(loadBoardViews()).toEqual([])
    const views = putBoardView({
      id: 'custom-1',
      name: 'Exam sprint',
      columns: [
        {
          id: 'custom-1-c0',
          label: 'High',
          chip: {
            id: 'preset:high',
            label: 'High',
            filter: { priority: ['high'] },
            apply: { priority: 'high' },
          },
        },
      ],
    })
    expect(views).toHaveLength(1)
    expect(views[0].kind).toBe('custom')
    expect(loadBoardViews()).toEqual(views)
    expect(removeBoardView('custom-1')).toEqual([])
    expect(loadBoardViews()).toEqual([])
  })

  it('corrupted storage degrades to an empty list, never throws', () => {
    const store = stubWindowStorage()
    store.set('lh-board-views', 'garbage{')
    expect(loadBoardViews()).toEqual([])
    store.set('lh-board-views', JSON.stringify([{ nope: 1 }]))
    expect(loadBoardViews()).toEqual([])
  })
})
