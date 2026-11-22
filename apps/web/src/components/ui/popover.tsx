'use client'

/**
 * Clay-restyled popover for the page layer (`src/components/ui`) — a Radix
 * Popover wearing the same `.panel-elevated` surface as the tooltip, but
 * `p-4` and interactive (stays open while its content has focus; closes on
 * Escape / outside click). The design-system kit (`src/ui`) is untouched.
 *
 * Motion law — transform/opacity only. JS animation bypasses the CSS
 * reduced-motion / e-ink kill-switches in globals.css, so the entrance is
 * gated by the synchronous `motionOK()` from `@/lib/motion` (reduced-motion
 * and e-ink honored). SSR safety: Radix mounts `Content` only while the
 * popover is open, and open state is pure client state, so the entrance
 * values never appear in server HTML — therefore do not pass `forceMount`.
 */

import React from 'react'
import { Popover as PopoverPrimitive } from 'radix-ui'
import { motion } from 'framer-motion'
import { motionOK, claySpring } from '@/lib/motion'
import { cn } from './lib'

/** Props for {@link Popover} — Radix Popover.Root passthrough. */
export type PopoverProps = React.ComponentProps<typeof PopoverPrimitive.Root>

/** Uncontrolled popover root; pass `open`/`onOpenChange` to control it. */
export function Popover(props: PopoverProps): React.ReactElement {
  return <PopoverPrimitive.Root {...props} />
}

/** Props for {@link PopoverTrigger} — Radix Popover.Trigger passthrough. */
export type PopoverTriggerProps = React.ComponentProps<typeof PopoverPrimitive.Trigger>

/**
 * Toggle trigger. Pass `asChild` and render your own element (usually a kit
 * Button) so aria-expanded and aria-controls are wired to your accessible
 * name, not an extra node.
 */
export function PopoverTrigger(props: PopoverTriggerProps): React.ReactElement {
  return <PopoverPrimitive.Trigger {...props} />
}

/** Props for {@link PopoverContent}: Radix Content plus clay-surface extras. */
export interface PopoverContentProps extends React.ComponentProps<typeof PopoverPrimitive.Content> {
  /** Extra classes on the panel; appended after the default surface classes. */
  className?: string
  /** Gap in px between trigger and panel. Defaults to `8`. */
  sideOffset?: number
}

/**
 * The panel: `.panel-elevated` surface at `p-4`, width `auto` (set an
 * explicit width via `className` when the content needs one). The fade +
 * 0.96-scale entrance runs on the clay spring only when `motionOK()`;
 * otherwise the panel appears in its final state.
 */
export function PopoverContent({
  className,
  sideOffset = 8,
  children,
  ...props
}: PopoverContentProps): React.ReactElement {
  // Lazy one-shot gate: content only mounts while open (client-side), so this
  // reads real media state at mount and never differs from server HTML.
  const [motionAllowed] = React.useState(motionOK)
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'panel-elevated z-50 w-auto p-4 text-sm text-body rounded-(--clay-radius-sm) shadow',
          className,
        )}
        {...props}
      >
        <motion.div
          initial={motionAllowed ? { opacity: 0, scale: 0.96 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={claySpring}
        >
          {children}
        </motion.div>
        <PopoverPrimitive.Arrow className="fill-white dark:fill-(--hub-panel)" />
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  )
}
