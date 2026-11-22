'use client'

/**
 * useWindowedList (S3-99) — dependency-free fixed-row windowing.
 *
 * One scroll listener + one state slot: given the scroll position, the
 * pure {@link windowRange} math decides which rows are visible (plus
 * `overscan` rows above/below so fast scrolling never shows blank space).
 * The consumer renders an outer scroll container, an inner spacer with the
 * FULL virtual height, and only the visible slice — 1200 rows cost ~15
 * DOM nodes instead of 1200.
 *
 * Rows must be uniform height (`rowHeight`) — the fixed-height assumption
 * is what keeps the math O(1); variable-height lists need measurement
 * machinery that is not worth a dependency here.
 */
import { useCallback, useRef, useState } from 'react'

/** The visible-window math for one scroll position (pure, unit-tested). */
export interface WindowRange {
  /** First row index to render (clamped to 0). */
  startIndex: number
  /** One-past the last row index to render (clamped to itemCount). */
  endIndex: number
  /** Pixel offset for the absolutely-positioned slice. */
  offsetY: number
  /** The spacer's height = itemCount × rowHeight. */
  totalHeight: number
}

/** Clamp helper. */
const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v))

export function windowRange(opts: {
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  itemCount: number
  overscan?: number
}): WindowRange {
  const { scrollTop, viewportHeight, rowHeight, itemCount, overscan = 4 } = opts
  const totalHeight = itemCount * rowHeight
  if (itemCount === 0 || rowHeight <= 0) {
    return { startIndex: 0, endIndex: 0, offsetY: 0, totalHeight: 0 }
  }
  const firstVisible = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const startIndex = clamp(firstVisible - overscan, 0, itemCount)
  const visibleCount = Math.ceil(viewportHeight / rowHeight) + 1
  const endIndex = clamp(firstVisible + visibleCount + overscan, 0, itemCount)
  const offsetY = startIndex * rowHeight
  return { startIndex, endIndex, offsetY, totalHeight }
}

/** Result of {@link useWindowedList} — spread onto the two container divs. */
export interface WindowedListApi {
  startIndex: number
  endIndex: number
  offsetY: number
  totalHeight: number
  /** Scroll handler for the outer container (updates the window). */
  onScroll: React.UIEventHandler<HTMLElement>
  /** Attach to the outer scroll container (the hook reads its height). */
  viewportRef: React.RefObject<HTMLElement | null>
}

export function useWindowedList(opts: {
  itemCount: number
  rowHeight: number
  overscan?: number
  /** Container height; used until the ref is measured (SSR/first paint). */
  height?: number
}): WindowedListApi {
  const { itemCount, rowHeight, overscan = 4, height = 600 } = opts
  const viewportRef = useRef<HTMLElement | null>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const onScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

  // The height prop is the truth before the first client layout pass —
  // SSR renders the top slice of the real viewport, which is exactly what
  // a fresh page shows.
  const viewportHeight = viewportRef.current?.clientHeight ?? height

  const range = windowRange({ scrollTop, viewportHeight, rowHeight, itemCount, overscan })

  return { ...range, onScroll, viewportRef }
}
