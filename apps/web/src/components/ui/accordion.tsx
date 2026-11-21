'use client'

/**
 * Clay-restyled accordion for the page layer (`src/components/ui`) — Radix
 * Accordion parts wearing our panel surfaces. Powers the Settings
 * section-nav redesign; the design-system kit (`src/ui`) is untouched.
 *
 * Motion law — transform/opacity only: the reveal animates the inner div with
 * opacity + a slight rise. Height is NOT animated (height is neither
 * transform nor opacity and Radix's `--radix-accordion-content-height`
 * grid/height tricks are explicitly out). The reveal is gated by the
 * synchronous `motionOK()` from `@/lib/motion` (reduced-motion + e-ink
 * honored), because JS animation bypasses the CSS kill-switches.
 *
 * SSR safety — `initial={false}` everywhere: items open via `defaultValue`
 * render their content server-side, so the HTML must show the final state;
 * the entrance hides imperatively and starts in an isomorphic layout effect
 * (same pattern as `ClayIn` in `src/lib/motion.tsx`). Closed items unmount,
 * so opening one replays the reveal client-side only.
 */

import React, { useEffect, useLayoutEffect } from 'react'
import { Accordion as AccordionPrimitive } from 'radix-ui'
import { ChevronDown } from 'lucide-react'
import { motion, useAnimationControls } from 'framer-motion'
import { motionOK, claySpring } from '@/lib/motion'
import { cn } from './lib'

/**
 * Isomorphic layout effect: `useLayoutEffect` on the client, `useEffect` on
 * the server (React warns about server-side `useLayoutEffect`). Mirrors the
 * private helper in `src/lib/motion.tsx`; kept local to avoid widening that
 * module's API.
 */
const useIsoLayoutEffect: typeof useLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

/** Props for {@link Accordion} — Radix Accordion.Root passthrough. */
export type AccordionProps = React.ComponentProps<typeof AccordionPrimitive.Root>

/**
 * Accordion root. Pass `type="single"` (typically with `collapsible`) or
 * `type="multiple"`; `defaultValue` selects initially open items.
 */
export function Accordion(props: AccordionProps): React.ReactElement {
  return <AccordionPrimitive.Root {...props} />
}

/** Props for {@link AccordionItem}: Radix Item plus clay-surface extras. */
export interface AccordionItemProps extends React.ComponentProps<typeof AccordionPrimitive.Item> {
  /** Extra classes on the item panel; appended after the default surface. */
  className?: string
}

/**
 * One collapsible panel: `.panel` surface (chunky clay radius, border,
 * shadow, p-4) with `overflow-hidden` so the corners stay clean. The baked
 * `p-4` is the horizontal padding for the trigger/content inside —
 * {@link AccordionTrigger} therefore insets itself with `px-0`.
 */
export function AccordionItem({ className, ...props }: AccordionItemProps): React.ReactElement {
  return (
    <AccordionPrimitive.Item
      className={cn('panel overflow-hidden rounded-(--clay-radius-sm)', className)}
      {...props}
    />
  )
}

/** Props for {@link AccordionTrigger}: Radix Trigger plus clay-surface extras. */
export interface AccordionTriggerProps extends React.ComponentProps<
  typeof AccordionPrimitive.Trigger
> {
  /** Extra classes on the trigger button; appended after the default styles. */
  className?: string
}

/** Chevron classes: rotate on open is a transform-only clay-eased transition. */
const CHEVRON_CLASS = [
  'h-4 w-4 shrink-0 text-tertiary',
  'transition-transform duration-(--duration-base) ease-(--ease-clay)',
  'group-data-[state=open]:rotate-180',
].join(' ')

/**
 * Full-width disclosure button inside an `h3` header (Radix `Header`).
 * `min-h-11` honors the 44px touch law on coarse pointers. The chevron
 * rotates 180° on open — a transform-only transition on the clay ease. The
 * focus ring is inset because the item panel's `overflow-hidden` would clip
 * an outside ring; the accent color matches the repo focus recipe.
 */
export function AccordionTrigger({
  className,
  children,
  ...props
}: AccordionTriggerProps): React.ReactElement {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        className={cn(
          'group flex min-h-11 w-full flex-1 items-center justify-between gap-2 px-0 py-2',
          'text-left text-sm font-semibold text-strong',
          'transition-colors duration-(--duration-fast)',
          'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset',
          'focus-visible:ring-(--ac-strong) [@media(pointer:coarse)]:min-h-11',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown aria-hidden="true" className={CHEVRON_CLASS} />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

/** Props for {@link AccordionContent}: Radix Content plus clay-surface extras. */
export interface AccordionContentProps extends React.ComponentProps<
  typeof AccordionPrimitive.Content
> {
  /** Extra classes on the Radix content element (layout tweaks only). */
  className?: string
}

/**
 * Collapsible body. Radix unmounts closed content, so opening an item mounts
 * this fresh on the client; the inner div reveals with opacity + a 6px rise
 * on the clay spring — never a height animation. For items open at first
 * render (SSR), `initial={false}` keeps the HTML in its final state and the
 * isomorphic layout effect replays the reveal imperatively, gated by
 * `motionOK()`.
 */
export function AccordionContent({
  className,
  children,
  ...props
}: AccordionContentProps): React.ReactElement {
  const controls = useAnimationControls()

  useIsoLayoutEffect(() => {
    if (!motionOK()) return
    controls.set({ opacity: 0, y: 6 })
    controls.start({ opacity: 1, y: 0, transition: claySpring })
  }, [controls])

  return (
    <AccordionPrimitive.Content className={className} {...props}>
      {/* Horizontal padding comes from the item panel's baked p-4; pt-0.5
          separates the body from the trigger's 8px bottom padding. */}
      <motion.div
        initial={false}
        animate={controls}
        className="pt-0.5 text-sm leading-relaxed text-body"
      >
        {children}
      </motion.div>
    </AccordionPrimitive.Content>
  )
}
