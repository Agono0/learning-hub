'use client'

/**
 * Clay-restyled "choose one (or toggle)" chip row for the page layer
 * (`src/components/ui`) — kit-izes the five hand-rolled single-choice
 * patterns found in the audit (deck chips, provider grid, palette cards,
 * identity-mode, world camera). The design-system kit (`src/ui`) is
 * untouched.
 *
 * Semantics — a `role="radiogroup"` container of `role="radio"` buttons in
 * single mode (chips cannot be un-chosen by re-click, like real radios); a
 * `role="group"` of `role="checkbox"` buttons when `multiple` is set. In
 * multiple mode `onChange` fires with the clicked value on every activation
 * (including deselect) and `value` still highlights the chip equal to it —
 * the parent owns any set state.
 *
 * Keyboard — buttons are natively tabbable and activate on Enter/Space
 * (acceptable per the component contract; arrow-key roving focus can be
 * added later without an API break). Focus uses the repo recipe:
 * accent ring with `--hub-bg` offset.
 *
 * Motion law — transform/opacity only: a `whileTap` 0.97 press scale, gated
 * by the synchronous `motionOK()` from `@/lib/motion` (reduced-motion +
 * e-ink honored). Color state changes are CSS `transition-colors`.
 */

import React from 'react'
import { motion } from 'framer-motion'
import { motionOK } from '@/lib/motion'
import { cn } from './lib'

/** One selectable chip. */
export interface ChipPickerItem<T extends string> {
  /** Identity reported to `onChange`. */
  value: T
  /** Visible label. */
  label: string
  /** Optional 16-24px icon rendered left of the label (sized to 16px). */
  icon?: React.ReactNode
  /** Optional one-line explanation shown under the label. */
  hint?: string
}

/** Props for {@link ChipPicker}. */
export interface ChipPickerProps<T extends string> {
  /** The choices, in display order. */
  items: readonly ChipPickerItem<T>[]
  /** Currently highlighted value, or `null` for "nothing selected". */
  value: T | null
  /** Called with the clicked chip's value (in `multiple` mode: on every toggle). */
  onChange(next: T): void
  /** Accessible name of the group (`aria-label`). */
  label: string
  /** Checkbox semantics instead of radio. Defaults to `false`. */
  multiple?: boolean
  /** Passthrough classes on the wrapping row (layout/spacing tweaks only). */
  className?: string
}

/**
 * Wrap-friendly row of selectable chips. Active chips get the accent tint +
 * ring; inactive ones are bordered secondary text that hover-tints. Both
 * grow to 44px tall on coarse pointers (`[@media(pointer:coarse)]:min-h-11`).
 */
export function ChipPicker<T extends string>({
  items,
  value,
  onChange,
  label,
  multiple = false,
  className,
}: ChipPickerProps<T>): React.ReactElement {
  // Lazy one-shot gate for the press scale; stable across re-renders.
  // Hydration-safe: the server cannot know motionOK(), and a client-initialised `true` made
  // framer-motion add tabIndex=0 to the buttons that the server HTML lacked (React hydration
  // mismatch on /settings). Start false on both, then opt in after mount.
  const [motionAllowed, setMotionAllowed] = React.useState(false)
  React.useEffect(() => {
    setMotionAllowed(motionOK())
  }, [])
  return (
    <div
      role={multiple ? 'group' : 'radiogroup'}
      aria-label={label}
      className={cn('flex flex-wrap gap-2', className)}
    >
      {items.map((item) => {
        const active = value === item.value
        return (
          <motion.button
            key={item.value}
            type="button"
            role={multiple ? 'checkbox' : 'radio'}
            aria-checked={active}
            onClick={() => onChange(item.value)}
            whileTap={motionAllowed ? { scale: 0.97 } : undefined}
            className={cn(
              'inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border px-3 py-2',
              'text-left text-sm font-medium transition-colors duration-(--duration-fast)',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-(--ac-strong)',
              'focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg)',
              '[@media(pointer:coarse)]:min-h-11',
              active
                ? 'border-transparent bg-hub-accent/10 text-hub-accent ring-2 ring-(--ac-strong)'
                : 'border-(--hub-border) text-secondary hover:bg-hub-accent/5',
            )}
          >
            {item.icon ? (
              <span
                aria-hidden="true"
                className="grid shrink-0 place-items-center [&>svg]:h-4 [&>svg]:w-4"
              >
                {item.icon}
              </span>
            ) : null}
            <span className="flex flex-col items-start">
              <span className="truncate">{item.label}</span>
              {item.hint ? (
                <span className="text-[11px] font-normal leading-tight text-tertiary">
                  {item.hint}
                </span>
              ) : null}
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
