'use client'

/**
 * Clay-restyled shadcn-pattern dialog primitives, living in
 * `src/components/ui` (the page layer). The design-system kit in `src/ui` is
 * untouched — this module composes with it (kit {@link IconButton} for the
 * close glyph) and pages may mix both freely.
 *
 * Clay restyle: ghost shadcn surface tokens are replaced with repo utilities —
 * the elevated clay card surface (`.panel-elevated`) for the panel,
 * `text-strong`/`text-secondary` for type, `rounded-(--clay-radius)` for the
 * chunky radius and `border-(--hub-border)`-backed surfaces elsewhere. The
 * close control is the kit {@link IconButton} (ghost, 44px coarse target) with
 * `aria-label="Close dialog"`.
 *
 * Composition (shadcn convention):
 *
 * ```
 * <Dialog open={open} onOpenChange={setOpen}>
 *   <DialogTrigger asChild>…</DialogTrigger>
 *   <DialogContent title="Optional sr-only title">
 *     <DialogHeader>
 *       <DialogTitle>Visible title</DialogTitle>
 *       <DialogDescription>…</DialogDescription>
 *     </DialogHeader>
 *     …
 *     <DialogFooter>actions</DialogFooter>
 *   </DialogContent>
 * </Dialog>
 * ```
 *
 * Pass `title`/`description` to {@link DialogContent} for the screen-reader
 * fallback (Radix Title/Description rendered `sr-only`), or render visible
 * `DialogTitle`/`DialogDescription` yourself — not both (the Radix title id
 * would be duplicated).
 *
 * Usage law — pages should drive the dialog with `<Dialog open onOpenChange>`
 * (controlled). Uncontrolled usage (`<Dialog>` + `DialogTrigger`) is also
 * supported: the root mirrors Radix's internal state through `onOpenChange`
 * into a context that {@link DialogContent} reads, so the animated layer
 * tracks the real open state either way. `DialogContent` must sit inside the
 * exported {@link Dialog} root (not a bare Radix root) — without the context
 * it renders nothing.
 *
 * Motion & Radix presence (load-bearing): Radix's own unmount is not
 * framer-aware — its Presence only defers removal while a CSS keyframe
 * animation runs, so a plain portal would snap shut with no exit. The portal
 * here is force-mounted and the animated layer is gated on the open state via
 * `AnimatePresence`: while closed the gate renders nothing (so nothing is
 * focus-trapped, `aria-hidden` or scroll-locked), while open the Radix
 * overlay/content inherit the force-mount and stay mounted through the exit
 * window — which is also what keeps the overlay's scroll lock engaged until
 * the layer is gone. Portal output is empty server-side (Radix mounts portals
 * in a layout effect), so SSR renders nothing for a closed dialog.
 *
 * Motion law: transform/opacity only, entrance on the kit clay spring
 * (`claySpring` from `@/lib/motion`), faster exit, and the JS animation is
 * gated by {@link motionOK} — with reduced motion or the e-ink theme the layer
 * appears and disappears instantly. `data-state` attributes from Radix are
 * preserved for styling and tests.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import React, { type ComponentProps, type ReactNode } from 'react'
import { claySpring, motionOK } from '@/lib/motion'
import { IconButton } from '@/ui'
import { cn } from './lib'

/**
 * Open-state context filled by {@link Dialog} so {@link DialogContent} can
 * drive the `AnimatePresence` lifecycle without `forceMount` on call sites.
 * `undefined` (no provider) reads as closed.
 */
const DialogOpenContext = React.createContext<boolean | undefined>(undefined)

/** Reads the tracked open state of the enclosing {@link Dialog} root. */
function useDialogOpen(): boolean {
  return React.useContext(DialogOpenContext) ?? false
}

/** Props of the dialog root (Radix `Dialog.Root`, controlled or uncontrolled). */
export type DialogProps = ComponentProps<typeof DialogPrimitive.Root>

/**
 * Dialog root — provides the open state to the animated layer and forwards to
 * Radix's root. Controlled (`open` + `onOpenChange`) or uncontrolled
 * (`defaultOpen` + triggers); see the module JSDoc for the usage law.
 */
export function Dialog({ open, defaultOpen, onOpenChange, children, ...props }: DialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
  const isControlled = open !== undefined

  /** Mirrors Radix's state changes so uncontrolled usage still animates. */
  const handleOpenChange = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  const isOpen = isControlled ? open : internalOpen

  return (
    <DialogOpenContext.Provider value={isOpen}>
      <DialogPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        {...props}
      >
        {children}
      </DialogPrimitive.Root>
    </DialogOpenContext.Provider>
  )
}

/** Trigger that opens the dialog; pass `asChild` to wrap your own control. */
export function DialogTrigger(props: ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

/**
 * Advanced escape hatch: a plain Radix portal without the animated layer.
 * Prefer {@link DialogContent}, which mounts its own portal. Manual
 * composition through this component follows Radix's native (instant)
 * mount/unmount and does not animate.
 */
export function DialogPortal(props: ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

/**
 * Static backdrop for manual portal composition (advanced): the same clay
 * scrim the animated {@link DialogContent} renders, without motion. Radix
 * renders it only while the dialog is open (unless `forceMount` is passed),
 * and mounting it is what engages the modal scroll lock in manual
 * composition. The animated path does not use this component.
 */
export function DialogOverlay(props: ComponentProps<typeof DialogPrimitive.Overlay>) {
  const { className, ...rest } = props
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn('fixed inset-0 z-50 bg-black/55 backdrop-blur-sm', className)}
      {...rest}
    />
  )
}

/** Programmatic close control; pass `asChild` to wrap your own button. */
export function DialogClose(props: ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

/** Heading group: title + description stacked, centered on small screens. */
export function DialogHeader(props: ComponentProps<'div'>) {
  const { className, ...rest } = props
  return (
    <div
      data-slot="dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...rest}
    />
  )
}

/** Action row: buttons stack on small screens and right-align from `sm` up. */
export function DialogFooter(props: ComponentProps<'div'>) {
  const { className, ...rest } = props
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...rest}
    />
  )
}

/** Visible dialog heading (`text-strong`, kit type scale). */
export function DialogTitle(props: ComponentProps<typeof DialogPrimitive.Title>) {
  const { className, ...rest } = props
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('text-lg leading-tight font-semibold text-strong', className)}
      {...rest}
    />
  )
}

/** Visible dialog description (`text-secondary`). */
export function DialogDescription(props: ComponentProps<typeof DialogPrimitive.Description>) {
  const { className, ...rest } = props
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn('text-sm text-secondary', className)}
      {...rest}
    />
  )
}

/**
 * Radix content props pruned for the motion-wrapped surface: `title` is
 * re-purposed below as the accessible dialog title (dropping the HTML tooltip
 * attribute), and `onAnimationStart`/`onDrag*` are dropped because framer
 * redefines those names for its own animation runtime — framer's documented
 * workaround for `motion.create` on custom components.
 */
type MotionSafeContentProps = Omit<
  ComponentProps<typeof DialogPrimitive.Content>,
  'title' | 'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'
>

/** Props of {@link DialogContent}. */
export interface DialogContentProps extends MotionSafeContentProps {
  /**
   * Accessible title for dialogs without a visible heading: rendered as a
   * screen-reader-only Radix title so assistive tech announces the dialog.
   * Don't combine with a visible `DialogTitle` inside `children`.
   */
  title?: ReactNode
  /**
   * Accessible description for dialogs without a visible one: rendered as a
   * screen-reader-only Radix description (wires `aria-describedby`).
   */
  description?: ReactNode
  /** Hides the kit close button. Defaults to `true` (shown). */
  showCloseButton?: boolean
}

// Created once at module scope — recreating motion components per render would
// remount the underlying element and kill the animation.
const MotionOverlay = motion.create(DialogPrimitive.Overlay)
const MotionDialogContent = motion.create(DialogPrimitive.Content)

/**
 * Animated dialog surface: backdrop + centered clay panel, mounted through
 * `AnimatePresence` while the enclosing {@link Dialog} is open. Composes the
 * Radix portal, overlay and content so focus trapping, `aria` wiring, escape
 * handling and the modal scroll lock all come from Radix.
 *
 * The panel centers via a full-screen grid wrapper (not translate utilities)
 * so the framer scale entrance owns the transform without fighting centering.
 * Content taller than the viewport scrolls inside the panel; the panel is
 * capped at the viewport minus the wrapper padding.
 */
export function DialogContent({
  className,
  children,
  title,
  description,
  showCloseButton = true,
  ...props
}: DialogContentProps) {
  const open = useDialogOpen()
  // Only meaningful client-side while open (nothing renders otherwise), so
  // the synchronous reduced-motion gate cannot race an SSR render.
  const animated = open && motionOK()

  return (
    <DialogPrimitive.Portal forceMount>
      <AnimatePresence>
        {open && (
          <div key="clay-dialog-layer" className="fixed inset-0 z-50">
            <MotionOverlay
              data-slot="dialog-overlay"
              className="absolute inset-0 bg-black/55 backdrop-blur-sm"
              initial={animated ? { opacity: 0 } : false}
              animate={{ opacity: 1 }}
              exit={
                animated
                  ? { opacity: 0, transition: { duration: 0.15, ease: 'easeOut' } }
                  : undefined
              }
              transition={{ duration: 0.2, ease: 'easeOut' }}
            />
            <div className="absolute inset-0 grid place-items-center p-4 sm:p-6">
              <MotionDialogContent
                {...props}
                data-slot="dialog-content"
                className={cn(
                  'panel-elevated relative flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-(--clay-radius) p-6 outline-none sm:max-h-[calc(100dvh-3rem)]',
                  className,
                )}
                initial={animated ? { opacity: 0, scale: 0.96 } : false}
                animate={{ opacity: 1, scale: 1 }}
                exit={
                  animated
                    ? { opacity: 0, scale: 0.98, transition: { duration: 0.12, ease: 'easeOut' } }
                    : undefined
                }
                transition={claySpring}
              >
                {title != null && (
                  <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
                )}
                {description != null && (
                  <DialogPrimitive.Description className="sr-only">
                    {description}
                  </DialogPrimitive.Description>
                )}
                {children}
                {showCloseButton && (
                  <DialogPrimitive.Close asChild data-slot="dialog-close">
                    <IconButton
                      label="Close dialog"
                      variant="ghost"
                      size="sm"
                      className="absolute top-4 right-4"
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </IconButton>
                  </DialogPrimitive.Close>
                )}
              </MotionDialogContent>
            </div>
          </div>
        )}
      </AnimatePresence>
    </DialogPrimitive.Portal>
  )
}
