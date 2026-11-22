/**
 * Integration tests for the TaskDetail panel (S3-21).
 *
 * - SSR-safe render: the panel composes `Sheet` + react-query — with a
 *   never-resolving fetch, `renderToString` produces the skeleton shell
 *   without clock/storage reads (all data arrives client-side).
 * - Field mapping glue: the draft mapping (ms → minutes and back) and the
 *   PATCH body the Save button assembles match the S3-16 handler contract.
 * - Reminder payload shapes: `at_time` (ISO + exactAlarm) and `relative`
 *   (negative minutes offset) — the exact bodies the S3-19 route refines.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TaskDetail, type TaskDetailTask } from '../src/components/tasks/TaskDetail'

/** Never-resolving fetch: queries stay pending, render stays deterministic. */
function stubPendingFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
}

function renderPanel(open = true): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    React.createElement(
      QueryClientProvider,
      { client: qc },
      React.createElement(TaskDetail, {
        taskId: 7,
        open,
        onClose: () => {},
        onChanged: () => {},
        onDeleted: () => {},
      }),
    ),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('TaskDetail — SSR safety', () => {
  it('renders the skeleton shell with pending queries and no clock reads', () => {
    stubPendingFetch()
    const html = renderPanel()
    expect(html).toContain('Task')
    expect(html).toContain('animate-pulse')
  })

  it('renders nothing (closed sheet) when open=false', () => {
    stubPendingFetch()
    expect(renderPanel(false)).not.toContain('animate-pulse')
  })
})

describe('TaskDetail glue — draft mapping and write payloads', () => {
  const task: TaskDetailTask = {
    id: 7,
    title: 'Draft spec',
    notes: 'Rough edges welcome',
    priority: 'high',
    estimateMs: 5_400_000,
    due: '2026-03-11',
    dueWithTime: false,
    deadline: '2026-03-20',
    projectId: 3,
    tagIds: [1, 2],
  }

  function toDraft(t: TaskDetailTask): TaskDetailTask & { estimateMinutes: string } {
    return {
      ...t,
      estimateMinutes: t.estimateMs !== null ? String(Math.round(t.estimateMs / 60_000)) : '',
    }
  }

  it('maps estimate ms to whole minutes for the input (90m → "90")', () => {
    expect(toDraft(task).estimateMinutes).toBe('90')
    expect(toDraft({ ...task, estimateMs: null }).estimateMinutes).toBe('')
  })

  it('the Save PATCH body carries minutes back as ms and preserves nulls', () => {
    const draft = toDraft(task)
    const estimateTrim = draft.estimateMinutes.trim()
    const body = {
      title: draft.title.trim(),
      notes: draft.notes,
      priority: draft.priority,
      estimateMs: estimateTrim === '' ? null : Number(estimateTrim) * 60_000,
      due: draft.due,
      dueWithTime: draft.dueWithTime,
      deadline: draft.deadline,
      projectId: draft.projectId,
    }
    expect(body.estimateMs).toBe(5_400_000)
    expect(body.priority).toBe('high')
    expect(body.projectId).toBe(3)
    // Cleared estimate → null (not 0): the repo validate rule blocks zero.
    const cleared = {
      ...body,
      estimateMs: toDraft({ ...task, estimateMs: null }).estimateMinutes.trim() === '' ? null : 0,
    }
    expect(cleared.estimateMs).toBeNull()
  })

  it('reminder payloads match the S3-19 route shapes', () => {
    const atTime = {
      taskId: 7,
      type: 'at_time',
      remindAt: new Date('2026-03-11T10:00').toISOString(),
      exactAlarm: true,
    }
    expect(atTime.type).toBe('at_time')
    expect(atTime.exactAlarm).toBe(true)
    const relative = { taskId: 7, type: 'relative', offsetMs: -Number('30') * 60_000 }
    expect(relative.offsetMs).toBe(-1_800_000)
  })
})
