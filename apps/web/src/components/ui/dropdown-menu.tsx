'use client'

/**
 * Clay-restyled shadcn-pattern dropdown menu, living in `src/components/ui`
 * (the page layer). The design-system kit in `src/ui` is untouched — pages may
 * mix both freely.
 *
 * Composition (shadcn convention):
 *
 * ```
 * <DropdownMenu>
 *   <DropdownMenuTrigger asChild>…</DropdownMenuTrigger>
 *   <DropdownMenuContent>
 *     <DropdownMenuLabel>Section</DropdownMenuLabel>
 *     <DropdownMenuItem onSelect={…}>Action</DropdownMenuItem>
 *     <DropdownMenuItem variant="destructive">Remove</DropdownMenuItem>
 *     <DropdownMenuSeparator />
 *     <DropdownMenuSub>…</DropdownMenuSub>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 * ```
 *
 * Clay restyle: ghost shadcn surface tokens are replaced with repo utilities —
 * the elevated clay card surface (`.panel-elevated`, `p-1`) for the menu
 * shell at `rounded-(--clay-radius-sm)` with a deep shadow; items get the
 * clay hover (`focus:bg-hub-accent/10 focus:text-strong`) with a 44px minimum
 * target on coarse pointers (the touch law, guarded to pointer:coarse so
 * desktop menus stay compact); the destructive item variant is the AA-tested
 * rose pair (`text-rose-400` on `bg-rose-500/10` focus); separators and labels
 * use the hub border and `text-tertiary` type. Radix's `data-state` /
 * `data-highlighted` attributes are preserved for styling and tests.
 *
 * Motion law: a single entrance — fade + scale 0.97 on the kit clay spring
 * (`claySpring` from `@/lib/motion`), transform/opacity only, gated by
 * {@link motionOK} (reduced-motion / e-ink renders instantly). There is no
 * exit animation by design: Radix unmounts the menu content on close (its
 * presence logic only defers removal for CSS keyframe animations, which
 * framer's runtime styles are not), and menus closing instantly is the calmer
 * default. Content mounts only when the menu opens (client state), so the
 * synchronous gate cannot race an SSR render — closed menus render nothing
 * server-side.
 */

import { motion } from 'framer-motion'
import { Check, ChevronRight, Circle } from 'lucide-react'
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui'
import React, { type ComponentProps } from 'react'
import { claySpring, motionOK } from '@/lib/motion'
import { cn } from './lib'

/** Props of the dropdown root (Radix `DropdownMenu.Root`). */
export type DropdownMenuProps = ComponentProps<typeof DropdownMenuPrimitive.Root>

/** Dropdown root: wraps the trigger and the (portal-mounted) content. */
export function DropdownMenu(props: DropdownMenuProps) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

/** Trigger that toggles the menu; pass `asChild` to wrap your own control. */
export function DropdownMenuTrigger(props: ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

/** Advanced escape hatch: Radix portal for manual content composition. */
export function DropdownMenuPortal(props: ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

/** Groups items for arrow-key navigation within a labelled section. */
export function DropdownMenuGroup(props: ComponentProps<typeof DropdownMenuPrimitive.Group>) {
  return <DropdownMenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
}

/** Radio group for single-choice items (`DropdownMenuRadioItem` children). */
export function DropdownMenuRadioGroup(
  props: ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>,
) {
  return <DropdownMenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />
}

/** Opens a nested submenu; pair with `DropdownMenuSubContent`. */
export function DropdownMenuSub(props: ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
  return <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} />
}

/** Small panel class shared by the menu content and submenu content. */
const PANEL_CLASSES =
  'panel-elevated z-50 min-w-[8rem] max-h-(--radix-dropdown-menu-content-available-height) overflow-x-hidden overflow-y-auto rounded-(--clay-radius-sm) p-1 shadow-lg outline-none origin-(--radix-dropdown-menu-content-transform-origin)'

/** Item base shared by items, sub-triggers and the selectable item kinds. */
const ITEM_CLASSES =
  "relative flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-2 text-sm text-body outline-none transition-colors data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [@media(pointer:coarse)]:min-h-11"

// Created once at module scope — recreating motion components per render would
// remount the underlying element and kill the entrance animation.
const MotionMenuContent = motion.create(DropdownMenuPrimitive.Content)
const MotionMenuSubContent = motion.create(DropdownMenuPrimitive.SubContent)

/**
 * Radix menu props pruned for the motion-wrapped surfaces: framer redefines
 * `onAnimationStart` and `onDrag*` for its own animation runtime, so those DOM
 * handler names are dropped from the forwarded props — framer's documented
 * workaround for `motion.create` on custom components.
 */
type MotionSafeMenuProps<T> = Omit<T, 'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'>

/** Props of {@link DropdownMenuContent}. */
export interface DropdownMenuContentProps extends MotionSafeMenuProps<
  ComponentProps<typeof DropdownMenuPrimitive.Content>
> {
  /** Distance from the trigger in px. Defaults to `4` (shadcn convention). */
  sideOffset?: number
}

/**
 * Animated menu shell: elevated clay panel positioned by Radix's popper, with
 * a fade + scale 0.97 entrance on the clay spring (see the module JSDoc for
 * the motion law and why there is no exit animation).
 */
export function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: DropdownMenuContentProps) {
  // Content mounts only while the menu is open (client state), so the
  // synchronous reduced-motion gate cannot race an SSR render.
  const animated = motionOK()
  return (
    <DropdownMenuPrimitive.Portal>
      <MotionMenuContent
        {...props}
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(PANEL_CLASSES, className)}
        initial={animated ? { opacity: 0, scale: 0.97 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={claySpring}
      />
    </DropdownMenuPrimitive.Portal>
  )
}

/** Props of {@link DropdownMenuItem}. */
export interface DropdownMenuItemProps extends ComponentProps<typeof DropdownMenuPrimitive.Item> {
  /** Adds the left padding used under a leading indicator column. */
  inset?: boolean
  /**
   * `destructive` (shadcn parity) restyles the item with the AA-tested rose
   * text pair. The banned shadcn surface classes it replaces are swapped for
   * rose utilities at the class level; the identifier itself is unaffected.
   */
  variant?: 'default' | 'destructive'
}

/**
 * Selectable menu row: clay hover (accent wash + strong text), 44px coarse
 * target, destructive variant. Fires `onSelect` on click or Enter.
 */
export function DropdownMenuItem({
  className,
  inset,
  variant = 'default',
  ...props
}: DropdownMenuItemProps) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        ITEM_CLASSES,
        inset && 'pl-8',
        'focus:bg-hub-accent/10 focus:text-strong',
        variant === 'destructive' &&
          'text-rose-400 focus:bg-rose-500/10 focus:text-rose-400 [&_svg]:text-rose-400',
        className,
      )}
      {...props}
    />
  )
}

/** Checkbox row with a leading check indicator; `checked`/`onCheckedChange` control it. */
export function DropdownMenuCheckboxItem({
  className,
  children,
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(ITEM_CLASSES, 'pl-8', 'focus:bg-hub-accent/10 focus:text-strong', className)}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Check className="h-4 w-4" aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

/** Radio row with a leading dot indicator; use inside `DropdownMenuRadioGroup`. */
export function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.RadioItem> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(ITEM_CLASSES, 'pl-8', 'focus:bg-hub-accent/10 focus:text-strong', className)}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <DropdownMenuPrimitive.ItemIndicator>
          <Circle className="h-2 w-2 fill-current" aria-hidden />
        </DropdownMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </DropdownMenuPrimitive.RadioItem>
  )
}

/** Section label: small, uppercase, tertiary (`text-tertiary`). */
export function DropdownMenuLabel({
  className,
  inset,
  ...props
}: ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return (
    <DropdownMenuPrimitive.Label
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        'px-2 py-1.5 text-xs font-semibold tracking-wide uppercase text-tertiary',
        inset && 'pl-8',
        className,
      )}
      {...props}
    />
  )
}

/** Hairline divider between sections, spanning the padded panel width. */
export function DropdownMenuSeparator(
  props: ComponentProps<typeof DropdownMenuPrimitive.Separator>,
) {
  const { className, ...rest } = props
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-(--hub-border)', className)}
      {...rest}
    />
  )
}

/** Right-aligned keyboard hint text (e.g. `⌘K`) inside an item. */
export function DropdownMenuShortcut(props: ComponentProps<'span'>) {
  const { className, ...rest } = props
  return (
    <span
      data-slot="dropdown-menu-shortcut"
      className={cn('ml-auto text-xs tracking-widest text-faint', className)}
      {...rest}
    />
  )
}

/**
 * Submenu trigger: item-styled row with a trailing chevron; highlights while
 * the submenu is open (`data-state=open`).
 */
export function DropdownMenuSubTrigger(
  props: ComponentProps<typeof DropdownMenuPrimitive.SubTrigger>,
) {
  const { className, children, ...rest } = props
  return (
    <DropdownMenuPrimitive.SubTrigger
      data-slot="dropdown-menu-sub-trigger"
      className={cn(
        ITEM_CLASSES,
        'focus:bg-hub-accent/10 focus:text-strong',
        'data-[state=open]:bg-hub-accent/10 data-[state=open]:text-strong',
        className,
      )}
      {...rest}
    >
      {children}
      <ChevronRight className="ml-auto h-4 w-4" aria-hidden />
    </DropdownMenuPrimitive.SubTrigger>
  )
}

/**
 * Animated submenu shell: same clay panel as {@link DropdownMenuContent} with
 * the same entrance animation, positioned by Radix's popper relative to its
 * `DropdownMenuSubTrigger`.
 */
export function DropdownMenuSubContent({
  className,
  ...props
}: MotionSafeMenuProps<ComponentProps<typeof DropdownMenuPrimitive.SubContent>>) {
  // Submenu content mounts only while the submenu is open (client state), so
  // the synchronous reduced-motion gate cannot race an SSR render.
  const animated = motionOK()
  return (
    <MotionMenuSubContent
      {...props}
      data-slot="dropdown-menu-sub-content"
      className={cn(PANEL_CLASSES, className)}
      initial={animated ? { opacity: 0, scale: 0.97 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={claySpring}
    />
  )
}
