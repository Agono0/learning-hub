'use client'

/**
 * Clay-restyled shadcn-pattern alert dialog (confirmation gate), living in
 * `src/components/ui` (the page layer). The design-system kit in `src/ui` is
 * untouched — this module composes with it and pages may mix both freely.
 *
 * Composition (shadcn convention):
 *
 * ```
 * <AlertDialog open={open} onOpenChange={setOpen}>
 *   <AlertDialogTrigger asChild>…</AlertDialogTrigger>
 *   <AlertDialogContent title="sr-only title">
 *     <AlertDialogHeader>
 *       <AlertDialogTitle>Visible title</AlertDialogTitle>
 *       <AlertDialogDescription>…</AlertDialogDescription>
 *     </AlertDialogHeader>
 *     <AlertDialogFooter>
 *       <AlertDialogCancel>Keep it</AlertDialogCancel>
 *       <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
 *     </AlertDialogFooter>
 *   </AlertDialogContent>
 * </AlertDialog>
 * ```
 *
 * Clay restyle: ghost shadcn surface tokens are replaced with repo utilities —
 * the elevated clay card surface (`.panel-elevated`) for the panel,
 * `text-strong`/`text-secondary` for type, `rounded-(--clay-radius)` for the
 * chunky radius. The destructive action is `bg-rose-500` (the AA-tested
 * `--danger-strong` alias) with white text; the cancel is a bordered quiet
 * button. `AlertDialogAction` accepts `variant="destructive"` for destructive
 * confirmations; the default accent fill is the palette-aware
 * `bg-hub-accent`.
 *
 * Behavior (Radix alert dialog): `role="alertdialog"`, no outside-click
 * dismissal, focus starts on the Cancel button and focus is trapped while
 * open. Escape closes the dialog; the committed choice is made through
 * `AlertDialogAction` (which closes on click) or `AlertDialogCancel`. There is
 * deliberately no close button — an alert must be answered, not dismissed.
 *
 * Usage law — pages should drive the dialog with
 * `<AlertDialog open onOpenChange>` (controlled). Uncontrolled usage is also
 * supported: the root mirrors Radix's internal state through `onOpenChange`
 * into a context that {@link AlertDialogContent} reads. `AlertDialogContent`
 * must sit inside the exported {@link AlertDialog} root (not a bare Radix
 * root) — without the context it renders nothing.
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
 * appears and disappears instantly.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'
import React, { type ComponentProps, type ReactNode } from 'react'
import { claySpring, motionOK } from '@/lib/motion'
import { cn } from './lib'

/**
 * Open-state context filled by {@link AlertDialog} so
 * {@link AlertDialogContent} can drive the `AnimatePresence` lifecycle without
 * `forceMount` on call sites. `undefined` (no provider) reads as closed.
 */
const AlertDialogOpenContext = React.createContext<boolean | undefined>(undefined)

/** Reads the tracked open state of the enclosing {@link AlertDialog} root. */
function useAlertDialogOpen(): boolean {
  return React.useContext(AlertDialogOpenContext) ?? false
}

/** Props of the alert-dialog root (Radix `AlertDialog.Root`). */
export type AlertDialogProps = ComponentProps<typeof AlertDialogPrimitive.Root>

/**
 * Alert-dialog root — provides the open state to the animated layer and
 * forwards to Radix's root. Controlled (`open` + `onOpenChange`) or
 * uncontrolled (`defaultOpen` + triggers).
 */
export function AlertDialog({
  open,
  defaultOpen,
  onOpenChange,
  children,
  ...props
}: AlertDialogProps) {
  const [internalOpen, setInternalOpen] = React.useState(defaultOpen ?? false)
  const isControlled = open !== undefined

  /** Mirrors Radix's state changes so uncontrolled usage still animates. */
  const handleOpenChange = (next: boolean) => {
    if (!isControlled) setInternalOpen(next)
    onOpenChange?.(next)
  }

  const isOpen = isControlled ? open : internalOpen

  return (
    <AlertDialogOpenContext.Provider value={isOpen}>
      <AlertDialogPrimitive.Root
        open={open}
        defaultOpen={defaultOpen}
        onOpenChange={handleOpenChange}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Root>
    </AlertDialogOpenContext.Provider>
  )
}

/** Trigger that opens the alert dialog; pass `asChild` to wrap your own control. */
export function AlertDialogTrigger(props: ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

/**
 * Advanced escape hatch: a plain Radix portal without the animated layer.
 * Prefer {@link AlertDialogContent}, which mounts its own portal. Manual
 * composition through this component follows Radix's native (instant)
 * mount/unmount and does not animate.
 */
export function AlertDialogPortal(props: ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

/**
 * Static backdrop for manual portal composition (advanced): the same clay
 * scrim the animated {@link AlertDialogContent} renders, without motion. The
 * animated path does not use this component.
 */
export function AlertDialogOverlay(props: ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  const { className, ...rest } = props
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn('fixed inset-0 z-50 bg-black/55 backdrop-blur-sm', className)}
      {...rest}
    />
  )
}

/** Heading group: title + description stacked, centered on small screens. */
export function AlertDialogHeader(props: ComponentProps<'div'>) {
  const { className, ...rest } = props
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
      {...rest}
    />
  )
}

/** Action row: buttons stack on small screens and right-align from `sm` up. */
export function AlertDialogFooter(props: ComponentProps<'div'>) {
  const { className, ...rest } = props
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
      {...rest}
    />
  )
}

/** Visible alert-dialog heading (`text-strong`, kit type scale). */
export function AlertDialogTitle(props: ComponentProps<typeof AlertDialogPrimitive.Title>) {
  const { className, ...rest } = props
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn('text-lg leading-tight font-semibold text-strong', className)}
      {...rest}
    />
  )
}

/** Visible alert-dialog description (`text-secondary`). */
export function AlertDialogDescription(
  props: ComponentProps<typeof AlertDialogPrimitive.Description>,
) {
  const { className, ...rest } = props
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn('text-sm text-secondary', className)}
      {...rest}
    />
  )
}

/** Props of {@link AlertDialogAction}. */
export interface AlertDialogActionProps extends ComponentProps<typeof AlertDialogPrimitive.Action> {
  /**
   * `accent` (default) is the palette-aware accent fill for normal
   * confirmations; `destructive` (shadcn parity) is the AA-tested rose fill
   * for destructive confirmations.
   */
  variant?: 'accent' | 'destructive'
}

/**
 * Confirming action: closes the alert dialog on click. Styled as a filled
 * clay button (44px coarse target, standard focus ring); pass
 * `variant="destructive"` when the action destroys something.
 */
export function AlertDialogAction({
  className,
  variant = 'accent',
  ...props
}: AlertDialogActionProps) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-(--clay-radius-sm) px-4 text-sm font-semibold transition-colors',
        'focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg)',
        'disabled:pointer-events-none disabled:opacity-50',
        variant === 'destructive'
          ? 'bg-rose-500 text-white hover:opacity-90'
          : 'bg-hub-accent text-white hover:opacity-90',
        className,
      )}
      {...props}
    />
  )
}

/**
 * Dismissing action: closes the alert dialog without committing, returning
 * focus to the trigger (Radix behavior). Styled as the quiet bordered option.
 */
export function AlertDialogCancel(props: ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
  const { className, ...rest } = props
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-(--clay-radius-sm) border border-(--hub-border) px-4 text-sm font-semibold text-strong transition-colors hover:bg-hub-accent/10',
        'focus-visible:ring-2 focus-visible:ring-(--ac-strong) focus-visible:ring-offset-2 focus-visible:ring-offset-(--hub-bg)',
        'disabled:pointer-events-none disabled:opacity-50',
        className,
      )}
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
  ComponentProps<typeof AlertDialogPrimitive.Content>,
  'title' | 'onAnimationStart' | 'onDragStart' | 'onDragEnd' | 'onDrag'
>

/** Props of {@link AlertDialogContent}. */
export interface AlertDialogContentProps extends MotionSafeContentProps {
  /**
   * Accessible title for dialogs without a visible heading: rendered as a
   * screen-reader-only Radix title so assistive tech announces the dialog.
   * Don't combine with a visible `AlertDialogTitle` inside `children`.
   */
  title?: ReactNode
  /**
   * Accessible description for dialogs without a visible one: rendered as a
   * screen-reader-only Radix description (wires `aria-describedby`).
   */
  description?: ReactNode
}

// Created once at module scope — recreating motion components per render would
// remount the underlying element and kill the animation.
const MotionOverlay = motion.create(AlertDialogPrimitive.Overlay)
const MotionAlertDialogContent = motion.create(AlertDialogPrimitive.Content)

/**
 * Animated alert-dialog surface: backdrop + centered clay panel, mounted
 * through `AnimatePresence` while the enclosing {@link AlertDialog} is open.
 * Composes the Radix portal, overlay and content so `role="alertdialog"`,
 * focus trapping, cancel autofocus, `aria` wiring and the modal scroll lock
 * all come from Radix.
 *
 * The panel centers via a full-screen grid wrapper (not translate utilities)
 * so the framer scale entrance owns the transform without fighting centering.
 */
export function AlertDialogContent({
  className,
  children,
  title,
  description,
  ...props
}: AlertDialogContentProps) {
  const open = useAlertDialogOpen()
  // Only meaningful client-side while open (nothing renders otherwise), so
  // the synchronous reduced-motion gate cannot race an SSR render.
  const animated = open && motionOK()

  return (
    <AlertDialogPrimitive.Portal forceMount>
      <AnimatePresence>
        {open && (
          <div key="clay-alert-dialog-layer" className="fixed inset-0 z-50">
            <MotionOverlay
              data-slot="alert-dialog-overlay"
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
              <MotionAlertDialogContent
                {...props}
                data-slot="alert-dialog-content"
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
                  <AlertDialogPrimitive.Title className="sr-only">
                    {title}
                  </AlertDialogPrimitive.Title>
                )}
                {description != null && (
                  <AlertDialogPrimitive.Description className="sr-only">
                    {description}
                  </AlertDialogPrimitive.Description>
                )}
                {children}
              </MotionAlertDialogContent>
            </div>
          </div>
        )}
      </AnimatePresence>
    </AlertDialogPrimitive.Portal>
  )
}
