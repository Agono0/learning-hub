'use client'

import React, { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cx } from './cx'

export interface TabItem<K extends string> {
  key: K
  label: ReactNode
  icon?: ReactNode
}

export interface TabsProps<K extends string> {
  items: TabItem<K>[]
  value: K
  onChange: (key: K) => void
  /** Accessible name of the tab list. */
  label: string
}

/**
 * Segmented tabs (WAI-ARIA tablist): arrow keys move between tabs, the row
 * scrolls horizontally on narrow screens instead of wrapping. The active pill
 * slides between tabs (transform only, --ease-move) instead of hard-swapping
 * backgrounds — ui-design-signature §5 signature opportunity 5.
 */
export function Tabs<K extends string>({ items, value, onChange, label }: TabsProps<K>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)

  // Measure the active tab so the pill can slide to it. Re-measure on resize
  // and after fonts/layout settle; position via offsetLeft/offsetWidth so the
  // pill scrolls together with a horizontally scrolled row.
  useEffect(() => {
    const measure = () => {
      const i = items.findIndex((item) => item.key === value)
      const el = refs.current[i]
      if (!el) return
      // Keep object identity when unchanged — callers commonly pass inline
      // `items` arrays, and a fresh object here would re-render in a loop.
      setPill((prev) =>
        prev && prev.left === el.offsetLeft && prev.width === el.offsetWidth
          ? prev
          : { left: el.offsetLeft, width: el.offsetWidth },
      )
    }
    measure()
    // First paint of dynamically-rendered tabs can shift after hydration.
    const raf = requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', measure)
    }
  }, [items, value])

  const onKey = (e: KeyboardEvent, index: number) => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const next = (index + delta + items.length) % items.length
    onChange(items[next]!.key)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="scroll-x relative flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-(--hub-panel)"
    >
      {pill && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-1 rounded-lg bg-white shadow-sm transition-[transform,width] duration-(--duration-base) ease-(--ease-move) dark:bg-(--hub-border)"
          style={{
            transform: `translateX(${pill.left - 4}px)`,
            width: pill.width,
            left: 4,
          }}
        />
      )}
      {items.map((item, i) => {
        const active = item.key === value
        return (
          <button
            key={item.key}
            ref={(el) => {
              refs.current[i] = el
            }}
            role="tab"
            type="button"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              'relative z-10 flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors [@media(pointer:coarse)]:min-h-11',
              active
                ? 'font-medium text-neutral-900 dark:text-neutral-100'
                : 'text-tertiary hover:text-neutral-800 dark:hover:text-neutral-200',
            )}
          >
            {item.icon}
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
