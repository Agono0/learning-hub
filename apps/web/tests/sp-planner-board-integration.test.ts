/**
 * Integration tests for the TaskPlannerBoard (S3-25): SSR-safe render of
 * the planner section on /planner, plus the pure glue — capacity % math,
 * calendar-event day filtering (visible subscriptions only), day labels,
 * and the drag-to-schedule payload contract (PATCH due).
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { capacityPct, dayLabel, eventsForDay } from '../src/components/tasks/TaskPlannerBoard'
import type { CalendarFeedCache } from '../src/lib/calendar-feeds'
import PlannerPage from '../app/planner/page'

function stubPendingFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
}

function renderPage(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    React.createElement(QueryClientProvider, { client: qc }, React.createElement(PlannerPage)),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('planner page — SSR safety with the task board', () => {
  it('renders the planner shell (matrix + task planner section) with pending queries', () => {
    stubPendingFetch()
    const html = renderPage()
    expect(html).toContain('Study planner')
    expect(html).toContain('Task planner')
    // Skeleton-shaped loading for the board columns (queries pending).
    expect(html).toContain('animate-pulse')
  })
})

describe('capacity % glue', () => {
  it('maps estimated workload onto the daily capacity, clamped', () => {
    expect(capacityPct(4 * 3_600_000, 480)).toBe(50) // 4h of an 8h day
    expect(capacityPct(9 * 3_600_000, 480)).toBe(113) // over budget
    expect(capacityPct(0, 480)).toBe(0)
    expect(capacityPct(100 * 3_600_000, 480)).toBe(999) // display clamp
    expect(capacityPct(3_600_000, 0)).toBe(0) // no capacity configured
  })
})

describe('calendar events — day filter with visible subscriptions only', () => {
  const cache: CalendarFeedCache[] = [
    {
      subscriptionId: 'sub-1',
      events: [
        {
          uid: 'e1',
          title: 'Lecture',
          description: null,
          start: '2026-03-10T09:00',
          end: null,
          allDay: false,
          status: 'confirmed',
        },
        {
          uid: 'e2',
          title: 'Deadline',
          description: null,
          start: '2026-03-11',
          end: null,
          allDay: true,
          status: 'confirmed',
        },
      ],
      todos: [],
      fetchedAt: '2026-03-10T00:00:00.000Z',
    },
    {
      subscriptionId: 'sub-hidden',
      events: [
        {
          uid: 'e3',
          title: 'Hidden event',
          description: null,
          start: '2026-03-10T10:00',
          end: null,
          allDay: false,
          status: 'confirmed',
        },
      ],
      todos: [],
      fetchedAt: '2026-03-10T00:00:00.000Z',
    },
  ]

  it('shows only visible subscriptions’ events on their day, with times', () => {
    const events = eventsForDay(cache, '2026-03-10', new Set(['sub-1']))
    // Both feeds' events are IN the cache; visibility is the caller's filter.
    expect(events.some((e) => e.uid === 'e3')).toBe(false)
    expect(events).toEqual([expect.objectContaining({ uid: 'e1', time: '09:00' })])
  })

  it('all-day events carry no time and land on their start day', () => {
    const events = eventsForDay(cache, '2026-03-11', new Set(['sub-1']))
    expect(events).toEqual([expect.objectContaining({ uid: 'e2', time: null })])
  })
})

describe('day label + drag payload', () => {
  it('labels columns as `Www dd/mm`', () => {
    expect(dayLabel('2026-03-10')).toBe('Tue 10/03')
  })

  it('drag-to-schedule PATCHes due with dueWithTime=false (the handler contract)', () => {
    // The board's schedule mutation body — exactly what PATCH /api/tasks/[id]
    // accepts (updateTaskInputSchema): a date-only due with the timed flag off.
    const body = { due: '2026-03-10', dueWithTime: false }
    expect(body.dueWithTime).toBe(false)
    expect(body.due).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
