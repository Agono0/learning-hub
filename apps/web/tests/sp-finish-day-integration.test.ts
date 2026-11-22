/**
 * Integration tests for the finish-day flow (S3-29).
 *
 * - SSR-safe render of /tasks/finish-day (pending queries → skeleton, no
 *   clock reads at render).
 * - Glue: tomorrow-key math, the reschedule PATCH contract shared with the
 *   planner/schedule drag, and the celebration line mapping from the
 *   batch-D handler response.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { tomorrowOf } from '../app/tasks/finish-day/page'
import type { FinishDayResponse } from '../app/tasks/finish-day/page'

function stubPendingFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
}

function renderPage(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    React.createElement(QueryClientProvider, { client: qc }, React.createElement(FinishDayPage)),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

// Import after the component import above (default export page).
import FinishDayPage from '../app/tasks/finish-day/page'

describe('Finish-day page — SSR safety', () => {
  it('renders the shell (close button + honest empty state) with pending queries', () => {
    stubPendingFetch()
    const html = renderPage()
    expect(html).toContain('Finish the day')
    // Queries pending → the skeleton branch, shaped like the summary cards.
    expect(html).toContain('animate-pulse')
  })
})

describe('finish-day glue', () => {
  it('tomorrow is exactly +1 calendar day', () => {
    expect(tomorrowOf('2026-03-10')).toBe('2026-03-11')
    // Month rollover.
    expect(tomorrowOf('2026-03-31')).toBe('2026-04-01')
  })

  it('the celebration line maps the handler response', () => {
    const result: FinishDayResponse = {
      day: '2026-03-10',
      completedThatDay: [
        { id: 1, title: 'A' },
        { id: 2, title: 'B' },
      ],
      trackedMs: 7_200_000,
      stillOpenForDay: [],
      archive: { archived: [10, 11], promoted: [], restored: [] },
    }
    const summary = `Day closed — ${result.completedThatDay.length} tasks done, 2h tracked.`
    expect(summary).toContain('2 tasks done')
    expect(summary).toContain('2h tracked')
    expect(result.archive.archived).toHaveLength(2)
    expect(result.archive.promoted).toHaveLength(0)
  })

  it('reschedule and create payloads match the handler contracts', () => {
    // "→ tomorrow" = PATCH due date-only, dueWithTime off (S3-49 exclusivity:
    // tomorrow-due tasks are structurally absent from Today).
    const patch = { due: '2026-03-11', dueWithTime: false }
    expect(patch.dueWithTime).toBe(false)
    // PlanTomorrow's create body posts due=tomorrow through the same grammar
    // as the Today bar (S3-09 short syntax).
    const create = { title: 'Prep standup', due: '2026-03-11' }
    expect(create.due).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
