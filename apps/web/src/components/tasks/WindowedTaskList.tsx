'use client'

/**
 * WindowedTaskList (S3-99) — fixed-row virtualization for 1000+ item task
 * lists, dependency-free.
 *
 * Renders ONLY the visible slice (+ overscan) of `items`: an outer scroll
 * container of `height`, an inner spacer of the full virtual height, and
 * the absolutely-positioned visible rows at the current offset. Rows are
 * uniform `rowHeight` (the O(1) windowing assumption — see
 * `useWindowedList`); content longer than a row truncates, which the row
 * renderer controls.
 *
 * Consumers with short lists should NOT use this (the Tasks page switches
 * to plain rendering below a threshold — no behavior change for the 95%
 * case).
 */
import React from 'react'
import { useWindowedList } from '@/lib/use-windowed-list'

export interface WindowedTaskListProps<T> {
  items: readonly T[]
  /** Uniform row height in px (rows truncate to fit). */
  rowHeight: number
  /** Viewport height in px. */
  height: number
  /** Rows rendered above/below the viewport (default 4). */
  overscan?: number
  renderItem: (item: T, index: number) => React.ReactNode
  className?: string
  ariaLabel?: string
}

export function WindowedTaskList<T>({
  items,
  rowHeight,
  height,
  overscan,
  renderItem,
  className,
  ariaLabel,
}: WindowedTaskListProps<T>) {
  const { startIndex, endIndex, offsetY, totalHeight, onScroll, viewportRef } = useWindowedList({
    itemCount: items.length,
    rowHeight,
    overscan,
    height,
  })

  const visible: Array<React.ReactNode> = []
  for (let i = startIndex; i < endIndex; i++) {
    const item = items[i]
    if (item === undefined) continue
    visible.push(
      <div
        key={i}
        style={{ position: 'absolute', top: i * rowHeight, left: 0, right: 0, height: rowHeight }}
      >
        {renderItem(item, i)}
      </div>,
    )
  }

  return (
    <div
      ref={viewportRef as React.RefObject<HTMLDivElement>}
      onScroll={onScroll}
      role="list"
      aria-label={ariaLabel}
      style={{ height, overflowY: 'auto' }}
      className={className}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>{visible}</div>
    </div>
  )
}
