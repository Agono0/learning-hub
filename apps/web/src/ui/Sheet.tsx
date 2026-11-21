'use client'

import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { IconButton } from './IconButton'

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  /** Sticky footer (primary actions). */
  footer?: ReactNode
}

/**
 * Responsive dialog: a bottom sheet on phones, a centered modal from `md` up.
 * Escape and backdrop close it; body scroll is locked; focus moves into the
 * dialog on open and returns to the opener on close.
 */
export function Sheet({ open, onClose, title, children, footer }: SheetProps) {
  const panel = useRef<HTMLDivElement | null>(null)
  // Latest onClose without re-running the open effect: callers pass inline
  // arrows, and re-running would steal focus from inputs on every keystroke.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onCloseRef.current()
      // Focus trap: Tab cycles inside the dialog instead of escaping into the
      // page behind it (WAI-ARIA modal dialog pattern).
      if (e.key !== 'Tab' || !panel.current) return
      const focusables = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]!
      const last = focusables[focusables.length - 1]!
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panel.current?.focus()
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      opener?.focus?.()
    }
  }, [open])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center md:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === 'string' ? title : undefined}
    >
      <button
        aria-label="Close"
        className="sheet-backdrop absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div
        ref={panel}
        tabIndex={-1}
        className="sheet-panel relative flex max-h-[90dvh] w-full flex-col rounded-t-2xl border border-neutral-200 bg-white outline-none md:max-w-lg md:rounded-2xl dark:border-(--hub-border) dark:bg-(--hub-sunken)"
      >
        <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3 dark:border-(--hub-border)">
          <h2 className="text-base font-semibold">{title}</h2>
          <IconButton label="Close" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-200 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 dark:border-(--hub-border)">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
