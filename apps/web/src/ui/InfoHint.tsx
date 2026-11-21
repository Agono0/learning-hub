'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { IconButton } from './IconButton'
import { cx } from './cx'

export interface InfoHintProps {
  /** The explanatory text shown in the bubble and wired to the trigger via
   * aria-describedby. This replaces the invisible `title=` affordance. */
  hint: string
  /** Accessible name of the trigger button. Defaults to "More information". */
  label?: string
  /** Which side of the trigger the bubble opens on. Default 'bottom'. */
  placement?: 'top' | 'bottom'
  /** Extra classes on the inline wrapper (alignment tweaks only). */
  className?: string
}

/**
 * Button-triggered hint bubble (ui-signature §4 kit list: the Tooltip/InfoHint
 * that retires `title=`-only affordances).
 *
 * Design law compliance:
 * - Never hover-only, never opacity-only: the bubble opens on tap/click AND
 *   on keyboard focus, and the trigger is a real focusable button — a hover
 *   tooltip is unreachable on touch, so touch users tap to toggle.
 * - 44px touch law: the trigger is a kit IconButton (sm), which grows to 44px
 *   on coarse pointers while staying compact in a text line.
 * - Keyboard: focus opens, Esc closes and returns focus to the trigger, Tab
 *   moves on (the bubble is non-interactive, so it stays open while focused
 *   and closes on blur to avoid trapping anyone).
 * - Wiring: `aria-expanded` on the trigger; `aria-describedby` points at the
 *   bubble while it is open so screen readers can read the hint on demand.
 * - Motion: a single duration-fast fade via the .animate-fade-in-fast
 *   utility (globals.css); reduced-motion is killed globally by the CSS
 *   kill-switch, so no JS gating is needed.
 */
export function InfoHint({
  hint,
  label = 'More information',
  placement = 'bottom',
  className,
}: InfoHintProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const wrapRef = useRef<HTMLSpanElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement | null>(null)

  // Esc closes and hands focus back to the trigger; outside tap closes too
  // (a hint is transient — it must never require a second click elsewhere).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  return (
    <span
      ref={wrapRef}
      className={cx('relative inline-flex align-middle', className)}
      onBlur={(e) => {
        // Close when focus leaves the wrapper entirely (keyboard tab-out).
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      <IconButton
        ref={buttonRef}
        label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        className="-my-1 rounded-full"
      >
        <Info className="h-3.5 w-3.5" />
      </IconButton>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cx(
            'animate-fade-in-fast absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs leading-snug text-neutral-800 shadow-lg dark:border-(--hub-border) dark:bg-(--hub-panel-2) dark:text-neutral-200',
            placement === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          {hint}
        </span>
      )}
    </span>
  )
}
