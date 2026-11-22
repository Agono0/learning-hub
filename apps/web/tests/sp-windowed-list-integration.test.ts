/**
 * Integration tests for the windowed task list (S3-99): the pure window
 * math (start/end/offset/total under scroll and clamps) and the render
 * behavior on a 1200-item list — only the viewport slice (+ overscan) hits
 * the DOM, with the spacer carrying the full virtual height.
 */
import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { windowRange } from '../src/lib/use-windowed-list'
import {
  WindowedTaskList,
  type WindowedTaskListProps,
} from '../src/components/tasks/WindowedTaskList'

/**
 * Generic components do not flow their type parameter through
 * `React.createElement` — pin the instantiation for the render tests.
 */
const ItemList = WindowedTaskList as unknown as (
  props: WindowedTaskListProps<{ id: number; title: string }>,
) => React.ReactElement

describe('windowRange — the O(1) windowing math', () => {
  const ROW = 72

  it('opens with the top slice plus overscan', () => {
    const range = windowRange({
      scrollTop: 0,
      viewportHeight: 600,
      rowHeight: ROW,
      itemCount: 1200,
    })
    // viewport 600/72 → 9 visible rows (+1 partial) + 4 overscan × 2 ends.
    expect(range.startIndex).toBe(0)
    expect(range.endIndex).toBe(9 + 1 + 4)
    expect(range.totalHeight).toBe(1200 * ROW)
    expect(range.offsetY).toBe(0)
  })

  it('advances the window with scroll and anchors the offset to the slice start', () => {
    // scrollTop = 10 rows in (720px): firstVisible=10, start=6, offset=6*72.
    const range = windowRange({
      scrollTop: 720,
      viewportHeight: 600,
      rowHeight: ROW,
      itemCount: 1200,
    })
    expect(range.startIndex).toBe(6)
    expect(range.offsetY).toBe(6 * ROW)
    expect(range.endIndex).toBeGreaterThan(range.startIndex)
  })

  it('clamps at the end of the list', () => {
    const range = windowRange({
      scrollTop: 1190 * ROW,
      viewportHeight: 600,
      rowHeight: ROW,
      itemCount: 1200,
    })
    expect(range.startIndex).toBeLessThanOrEqual(1200)
    expect(range.endIndex).toBe(1200)
    expect(range.offsetY).toBe(range.startIndex * ROW)
  })

  it('handles empty lists and degenerate row heights', () => {
    expect(
      windowRange({ scrollTop: 0, viewportHeight: 600, rowHeight: ROW, itemCount: 0 }),
    ).toEqual({
      startIndex: 0,
      endIndex: 0,
      offsetY: 0,
      totalHeight: 0,
    })
    expect(windowRange({ scrollTop: 0, viewportHeight: 600, rowHeight: 0, itemCount: 5 })).toEqual({
      startIndex: 0,
      endIndex: 0,
      offsetY: 0,
      totalHeight: 0,
    })
  })
})

describe('WindowedTaskList — 1200-item render', () => {
  const ROW = 72
  const items = Array.from({ length: 1200 }, (_, i) => ({ id: i + 1, title: `Task ${i + 1}` }))

  function renderList(height = 600, overscan?: number): string {
    return renderToString(
      React.createElement(ItemList, {
        items,
        rowHeight: ROW,
        height,
        overscan,
        renderItem: (item) => React.createElement('div', { key: item.id }, item.title),
        ariaLabel: 'Virtualized tasks',
      }),
    )
  }

  it('renders only the viewport slice of a 1200-item list, not all rows', () => {
    const html = renderList()
    const renderedTitles = (html.match(/Task \d+/g) ?? []).length
    // 600/72 → 9+1 visible + 8 overscan = 18 — NOT 1200.
    expect(renderedTitles).toBeLessThanOrEqual(20)
    expect(renderedTitles).toBeGreaterThan(0)
    // The spacer carries the full virtual height (scroll math stays honest).
    expect(html).toContain('86400') // 1200 × 72
    // First item is on screen, deep items are not.
    expect(html).toContain('Task 1')
    expect(html).not.toContain('Task 1200')
  })

  it('a taller viewport shows more rows', () => {
    const html = renderList(1200)
    const renderedTitles = (html.match(/Task \d+/g) ?? []).length
    expect(renderedTitles).toBeGreaterThan(20)
    expect(renderedTitles).toBeLessThan(60)
  })
})
