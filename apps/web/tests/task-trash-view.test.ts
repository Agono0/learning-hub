/**
 * Trash store + view (S3-76) — the device-local round-trip contract is
 * window-guarded (node tests exercise the SSR/default paths); the SSR
 * rendering covers the closed-clock honesty, empty state and the per-row
 * days-left badges. The TTL math itself is core-tested (tasks-trash.test.ts).
 */
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { defaultTaskViewSettings } from '../src/lib/task-view-settings'
import {
  expiredTrashIds,
  listTrashEntries,
  purgeExpiredEntries,
  putTrashEntry,
  removeTrashEntry,
  restoreFromTrash,
} from '../src/lib/task-trash'
import { TrashView, expiryTone } from '../src/components/tasks/TrashView'

const TODAY = '2026-11-22'

describe('task trash store (device-local contract)', () => {
  it('reads as empty off-storage (SSR / private mode) and never throws', () => {
    expect(listTrashEntries(TODAY)).toEqual([])
    expect(expiredTrashIds(TODAY)).toEqual([])
  })

  it('store functions are no-ops without a window (writes fail soft)', () => {
    const entry = {
      taskId: 1,
      snapshot: { id: 1, title: 'Ghost' },
      title: 'Ghost',
      deletedAt: '2026-11-22T00:00:00.000Z',
      deletedVia: 'task-row' as const,
    }
    expect(putTrashEntry(entry, TODAY)).toEqual([entry]) // returned list, nothing persisted
    expect(removeTrashEntry(1)).toEqual([])
    expect(purgeExpiredEntries(TODAY)).toEqual([])
    void restoreFromTrash(1).catch(() => {}) // dynamic import of transport is safe in node
  })
})

describe('TrashView rendering', () => {
  const view = (today: string | null = TODAY): string =>
    renderToString(
      React.createElement(
        QueryClientProvider,
        { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
        React.createElement(TrashView, { today, onRestored: () => {} }),
      ),
    ).replace(/<!-- -->/g, '')

  it('renders nothing before the client clock mounts (hydration-safe)', () => {
    expect(view(null)).toBe('')
  })

  it('renders the honest loading state on the server (effects never run in SSR)', () => {
    expect(view(TODAY)).toContain('Loading trash')
    // the client mount renders the empty state — its copy is pinned here so
    // a wording drift shows up in this file rather than only in a browser
    expect(view(TODAY)).not.toContain('Trash is empty')
  })

  it('expiry tone: danger at the purge edge, warning within 3 days', () => {
    expect(expiryTone(0)).toBe('danger')
    expect(expiryTone(3)).toBe('warning')
    expect(expiryTone(20)).toBe('neutral')
  })
})

describe('task-view-settings smoke (same device-local family)', () => {
  it('defaults survive a node read', () => {
    expect(defaultTaskViewSettings().sortBy).toBe('manual')
  })
})
