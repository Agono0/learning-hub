'use client'

import { useRef } from 'react'
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
 * scrolls horizontally on narrow screens instead of wrapping.
 */
export function Tabs<K extends string>({ items, value, onChange, label }: TabsProps<K>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
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
      className="scroll-x flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-(--hub-panel)"
    >
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
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-white font-medium text-neutral-900 shadow-sm dark:bg-(--hub-border) dark:text-neutral-100'
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
