'use client'

/**
 * Clay-restyled tooltip for the page layer (`src/components/ui`) — a Radix
 * Tooltip wearing our `.panel-elevated` surface. It is the replacement for
 * `title=`-only affordances (audit: 196 occurrences), reachable by hover,
 * keyboard focus and touch; the design-system kit (`src/ui`) is untouched.
 *
 * Motion law — transform/opacity only. JS animation bypasses the CSS
 * reduced-motion / e-ink kill-switches in globals.css, so the entrance is
 * gated by the synchronous `motionOK()` from `@/lib/motion` (reduced-motion
 * and e-ink honored). SSR safety: Radix mounts `Content` only while the
 * tooltip is open, and open state is pure client state, so the entrance
 * values never appear in server HTML — therefore do not pass `forceMount`.
 */

import React from 'react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { motion } from 'framer-motion'
import { motionOK, claySpring } from '@/lib/motion'
import { cn } from './lib'

/** Props for {@link TooltipProvider} — Radix Tooltip.Provider passthrough. */
export type TooltipProviderProps = React.ComponentProps<typeof TooltipPrimitive.Provider>

/**
 * Shared delay/skip context for every tooltip below it. Optional: Radix falls
 * back to its implicit provider when absent. Defaults tune Radix's 700ms
 * hover delay down to a snappier 200ms with a 300ms skip window when moving
 * between triggers.
 */
export function TooltipProvider({
  delayDuration = 200,
  skipDelayDuration = 300,
  ...props
}: TooltipProviderProps): React.ReactElement {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...props}
    />
  )
}

/** Props for {@link Tooltip} — Radix Tooltip.Root passthrough. */
export type TooltipProps = React.ComponentProps<typeof TooltipPrimitive.Root>

/** Uncontrolled tooltip root; works standalone or inside {@link TooltipProvider}. */
export function Tooltip(props: TooltipProps): React.ReactElement {
  return <TooltipPrimitive.Root {...props} />
}

/** Props for {@link TooltipTrigger} — Radix Tooltip.Trigger passthrough. */
export type TooltipTriggerProps = React.ComponentProps<typeof TooltipPrimitive.Trigger>

/**
 * Focusable/hoverable trigger. Pass `asChild` and render your own element
 * (Button, IconButton, text) so the accessible name stays yours; Radix wires
 * aria-describedby to the content automatically.
 */
export function TooltipTrigger(props: TooltipTriggerProps): React.ReactElement {
  return <TooltipPrimitive.Trigger {...props} />
}

/** Props for {@link TooltipContent}: Radix Content plus clay-surface extras. */
export interface TooltipContentProps extends React.ComponentProps<typeof TooltipPrimitive.Content> {
  /** Extra classes on the bubble; appended after the default surface classes. */
  className?: string
  /** Gap in px between trigger and bubble. Defaults to `6`. */
  sideOffset?: number
}

/**
 * The bubble: `.panel-elevated` mini-panel (clay radius, border, shadow) with
 * an arrow filled to match the surface. Non-interactive by Radix design — it
 * never steals focus. The fade + 4px rise entrance runs on the clay spring
 * only when `motionOK()`; otherwise the bubble appears in its final state.
 */
export function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: TooltipContentProps): React.ReactElement {
  // Lazy one-shot gate: content only mounts while open (client-side), so this
  // reads real media state at mount and never differs from server HTML.
  const [motionAllowed] = React.useState(motionOK)
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'panel-elevated z-50 px-3 py-2 text-xs text-body rounded-(--clay-radius-sm) shadow',
          className,
        )}
        {...props}
      >
        <motion.div
          initial={motionAllowed ? { opacity: 0, y: 4 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={claySpring}
        >
          {children}
        </motion.div>
        <TooltipPrimitive.Arrow className="fill-white dark:fill-(--hub-panel)" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}
