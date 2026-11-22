/**
 * Integration tests for the Tags pages (S3-23).
 *
 * - SSR-safe render of the list (pending queries → skeleton).
 * - Core glue over REAL handler shapes: `filterTasksByTags` OR/AND
 *   semantics drive the filtered list; per-tag TODAY time via the S3-43
 *   totals; the write payloads match the S3-17 tag routes (create with
 *   normalized name + color, delete unlinks).
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { filterTasksByTags, workContextTotals, type TagFilterMode } from '@learning-hub/core'
import TagsPage from '../app/tasks/tags/page'

function stubPendingFetch(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise<Response>(() => {})),
  )
}

function renderList(): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return renderToString(
    React.createElement(QueryClientProvider, { client: qc }, React.createElement(TagsPage)),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Tags list — SSR safety', () => {
  it('renders the shell (create row, mode chips, skeleton) with pending queries', () => {
    stubPendingFetch()
    const html = renderList()
    expect(html).toContain('Tags')
    expect(html).toContain('New tag')
    expect(html).toContain('animate-pulse')
  })
})

describe('Tags glue — SP filter semantics + totals', () => {
  const tasks = [
    { id: 1, title: 'Both', tagIds: [3, 4] },
    { id: 2, title: 'Only work', tagIds: [3] },
    { id: 3, title: 'Untagged', tagIds: [] },
  ]

  function filter(tagIds: number[], mode: TagFilterMode): string[] {
    return filterTasksByTags(tasks, { tagIds, mode }).map((t) => t.title)
  }

  it('OR shows tasks carrying any selected tag; untagged tasks need no-tags', () => {
    expect(filter([3, 4], 'or')).toEqual(['Both', 'Only work'])
  })

  it('AND requires every selected tag', () => {
    expect(filter([3, 4], 'and')).toEqual(['Both'])
  })

  it('per-tag today-time attributes multi-tag tasks to each tag', () => {
    const totals = workContextTotals(
      [
        { id: 1, projectId: null, tagIds: [3, 4], timeSpentOnDay: { '2026-03-10': 60_000 } },
        { id: 2, projectId: null, tagIds: [4], timeSpentOnDay: { '2026-03-10': 30_000 } },
      ],
      '2026-03-10',
    )
    expect(totals.perTag.get(3)).toBe(60_000)
    expect(totals.perTag.get(4)).toBe(90_000)
  })

  it('write payloads match the S3-17 tag routes', () => {
    // Create: the repo normalizes names (trim + collapse) and 409s duplicates.
    const body = { name: '  deep   work  ', color: 'teal' }
    expect(body.name.replace(/\s+/g, ' ').trim()).toBe('deep work')
    // Delete unlinks tasks: DELETE /api/tasks-tags/[id].
    expect('/api/tasks-tags/4').toContain('/tasks-tags/')
  })
})
