'use client'

import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from './cx'

export interface MenuItem {
  label: string
  icon?: React.ReactNode
  /** Invoked on click / Enter. Closing the menu afterwards is automatic. */
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
}

export interface MenuProps {
  /** Accessible name of the trigger (and the menu's aria-label). */
  label: string
  items: MenuItem[]
  /** Trigger content (icon + short text). A chevron is appended automatically. */
  children: React.ReactNode
  className?: string
  /** `ghost` (default) keeps the header calm; `secondary` gives a hairline fill. */
  variant?: 'ghost' | 'secondary'
  /** Disables the trigger (e.g. no deck selected yet). */
  disabled?: boolean
}

/**
 * Overflow menu for the 2nd..nth header actions (ui-design-signature §2 law 3:
 * one primary action per screen; secondary actions demote to menus). Escape,
 * outside click and item selection all close it and return focus to the
 * trigger; ArrowUp/Down move between items.
 */
export function Menu({
  label,
  items,
  children,
  className,
  variant = 'ghost',
  disabled,
}: MenuProps) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    const onPointer = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onPointer)
    }
  }, [open])

  return (
    <div ref={wrap} className={cx('relative', className)}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors [@media(pointer:coarse)]:min-h-11',
          variant === 'ghost'
            ? 'text-neutral-700 hover:bg-neutral-100 dark:text-secondary dark:hover:bg-(--hub-panel-2)'
            : 'border border-neutral-200 bg-neutral-100 text-neutral-800 hover:bg-neutral-200 dark:border-(--hub-border) dark:bg-(--hub-panel-2) dark:text-neutral-200 dark:hover:bg-(--hub-border)',
        )}
      >
        {children}
        <ChevronDown
          className={cx('h-3.5 w-3.5 opacity-60 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-xl border border-neutral-200 bg-white p-1 shadow-xl animate-scale-in dark:border-(--hub-border) dark:bg-(--hub-panel)"
        >
          {items.map((item) => (
            <button
              key={item.label}
              role="menuitem"
              type="button"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                trigger.current?.focus()
                item.onSelect()
              }}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-50 [@media(pointer:coarse)]:min-h-11',
                item.danger
                  ? 'text-danger-text hover:bg-danger-soft'
                  : 'text-neutral-700 hover:bg-neutral-100 dark:text-secondary dark:hover:bg-(--hub-panel-2)',
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
