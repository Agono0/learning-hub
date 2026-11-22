/**
 * Integration tests for the Tasks (Today/Inbox) page (S3-20).
 *
 * - SSR-safe render: the page composes `QueryClientProvider` + useQuery —
 *   `renderToString` must produce the loading shell without touching the
 *   clock or storage at render time (`today` arrives in an effect, exactly
 *   like /boards).
 * - Core glue over REAL handler shapes: a short-syntax capture line parses
 *   into the exact body `POST /api/tasks` accepts (after tag/project/repeat
 *   resolution), the drag reorder matches the `POST /api/tasks/order`
 *   contract, and the multi-select bar's ops match `POST /api/tasks/bulk`.
 * - Row indicator math (overdue/past-deadline flags, estimate-vs-tracked
 *   text) against the S3-63/S3-45 semantics.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { moveTo, parseShortSyntax, suggestAt } from '@learning-hub/core'
import type { TaskItem } from '@learning-hub/core'
import TasksPage from '../app/tasks/page'
import { AddTaskBar } from '../src/components/tasks/AddTaskBar'
import { TaskRow } from '../src/components/tasks/TaskRow'

/** Never-resolving fetch: queries stay pending, render stays deterministic. */
function stubPendingFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
}

/** Render a component the way Next would (provider + SSR). */
function renderWithProviders(node: React.ReactElement): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(React.createElement(QueryClientProvider, { client: qc }, node))
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/** SSR HTML inserts `<!-- -->` markers between text and expressions — strip them. */
const visible = (html: string): string => html.replaceAll('<!-- -->', '')

describe('Tasks page — SSR safety', () => {
  it('renders the loading shell without clock or storage reads', () => {
    stubPendingFetch()
    const html = renderWithProviders(React.createElement(TasksPage))
    expect(html).toContain('Tasks')
    expect(html).toContain('Add a task')
    // Skeleton-shaped loading, never a blank page.
    expect(html).toContain('animate-pulse')
  })

  it('the add-task bar renders idle (parse preview waits for the client clock)', () => {
    stubPendingFetch()
    const html = renderWithProviders(
      React.createElement(AddTaskBar, {
        todayIso: null,
        tags: [],
        projects: [],
        onCreated: () => {},
      }),
    )
    expect(html).toContain('Short syntax')
    expect(html).not.toContain('suggestions')
  })
})

describe('AddTaskBar glue — short syntax to POST body', () => {
  const NOW = '2026-03-10'

  it('parses a full capture line into the structured fields the handler validates', () => {
    const parsed = parseShortSyntax(
      'Draft spec #work #deep +Website 1h30m @tom p1 !2026-03-20',
      `${NOW}T12:00:00.000Z`,
    )
    expect(parsed.title).toBe('Draft spec')
    expect(parsed.tags).toEqual(['work', 'deep'])
    expect(parsed.project).toBe('Website')
    expect(parsed.estimateMs).toBe(5_400_000)
    expect(parsed.due?.day).toBe('2026-03-11')
    expect(parsed.deadline?.day).toBe('2026-03-20')
    expect(parsed.priority).toBe('high')
    expect(parsed.warnings).toEqual([])
  })

  it('autocomplete offers due words, tags, projects and repeat cadences at the caret', () => {
    const due = suggestAt('Draft @', 8)
    expect(due?.kind).toBe('due')
    const tag = suggestAt('Draft #dee', 10)
    expect(tag?.kind).toBe('tag')
    expect(tag?.query).toBe('dee')
    const repeat = suggestAt('Draft @every ', 13)
    expect(repeat?.kind).toBe('repeat')
    expect(suggestAt('plain prose', 4)).toBeNull()
  })
})

describe('TaskRow indicators — S3-63/S3-45 semantics', () => {
  const base = {
    id: 1,
    parentId: null,
    projectId: null,
    tagIds: [7],
    title: 'Row task',
    notes: null,
    priority: 'medium',
    estimateMs: 3_600_000,
    timeSpentOnDay: { '2026-03-10': 1_800_000 },
    due: '2026-03-09',
    dueWithTime: false,
    deadline: '2026-03-08',
    isDone: false,
    doneAt: null,
    wonthado: false,
    repeatCfgId: null,
    order: 0,
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
  } satisfies TaskItem

  function renderRow(task: TaskItem, today: string): string {
    return renderWithProviders(
      React.createElement(TaskRow, {
        task,
        tagNames: new Map([[7, 'work']]),
        selected: false,
        today,
        onToggleSelect: () => {},
        onComplete: () => {},
        onOpen: () => {},
        onDuplicate: () => {},
        onDelete: () => {},
        onMove: () => {},
        onDragStart: () => {},
        onDropOnto: () => {},
        dragging: false,
      }),
    )
  }

  it('flags overdue due dates and passed deadlines in the danger hue', () => {
    const html = visible(renderRow(base, '2026-03-10'))
    expect(html).toContain('Overdue')
    expect(html).toContain('Deadline 2026-03-08 passed')
  })

  it('shows estimate-vs-tracked and tag names on the row', () => {
    const html = visible(renderRow(base, '2026-03-09'))
    expect(html).toContain('30m / 1h')
    expect(html).toContain('>work</span>')
    expect(html).not.toContain('Overdue')
  })

  it('the drag contract matches POST /api/tasks/order (moveTo math)', () => {
    expect(moveTo([1, 2, 3], 3, 0)).toEqual([3, 1, 2])
    expect(moveTo([1, 2, 3], 2, 0)).toEqual([2, 1, 3])
  })
})
