'use client'

/**
 * Clay motion foundation for the claymorphism design system: shared framer-motion
 * springs, stagger constants, variants and SSR-safe entrance components (`ClayIn`,
 * `Reveal`, `Stagger`, `StaggerItem`).
 *
 * Motion law — animate transform/opacity only, enter fast, stagger totals <300ms. The
 * springs mirror the CSS token `--ease-clay: cubic-bezier(0.34, 1.56, 0.64, 1)` (springy
 * overshoot) from `apps/web/app/globals.css`.
 *
 * Accessibility — JS animations bypass the CSS kill-switches (`@media
 * (prefers-reduced-motion: reduce)` and `html.theme-e-ink` set animation/transition to
 * none in globals.css), so every animation here is gated in JS by the synchronous
 * {@link motionOK} gate. The async `useReducedMotion` hook cannot drive these decisions:
 * it defaults to `false` on the first frame and only updates in `useEffect`, which races
 * the layout effects below.
 *
 * SSR safety (load-bearing) — 38 integration tests render components with
 * `renderToString` in node and assert text content, and the Playwright CI smoke fails on
 * hydration mismatches. SSR must render the FINAL state (no hidden styles in the HTML)
 * and the first client render must match SSR exactly. The pattern used everywhere in
 * this file: `initial={false}` on motion components (final state in SSR HTML, identical
 * first client render) + hidden state applied imperatively via
 * `useAnimationControls.set()` from a window-guarded isomorphic layout effect
 * (`useIsoLayoutEffect`), then revealed with `controls.start()`. Never pass hidden
 * values to `initial`; never put animation-hiding inline styles in render output; no
 * `AnimatePresence` in this file.
 */

import { motion, useAnimationControls, useInView } from 'framer-motion'
// Default React import (repo JSX pattern): apps/web compiles JSX with the classic
// runtime under vitest/esbuild ("jsx": "preserve" in tsconfig maps to
// React.createElement), so every JSX file reachable from a renderToString test
// must import React or it throws "ReferenceError: React is not defined" in CI.
import React, { useEffect, useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react'
import type { TargetAndTransition, Transition, Variants } from 'framer-motion'

/**
 * Isomorphic layout effect: `useLayoutEffect` on the client, `useEffect` on the server.
 * Why: React warns when a server-rendered component calls `useLayoutEffect`; under
 * `typeof window === 'undefined'` we fall back to `useEffect` (a no-op on the server),
 * while on the client the effect still runs before the browser paints, so
 * `controls.set()` never flashes hidden content on screen.
 */
const useIsoLayoutEffect: typeof useLayoutEffect =
  typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Per-child stagger step in seconds (motion law: 30–50ms between children). Used by the
 * `staggerContainer` orchestration and by {@link staggerDelay}.
 */
export const STAGGER_STEP_S = 0.04

/**
 * Hard cap on a single child's computed stagger delay, in seconds. {@link staggerDelay}
 * clamps to this so the slowest child still starts <300ms after its container begins
 * (motion law: stagger totals <300ms).
 */
export const STAGGER_MAX_DELAY_S = 0.26

/**
 * Clay spring — the default transition for clay entrances, tuned to mirror the overshoot
 * of the CSS `--ease-clay: cubic-bezier(0.34, 1.56, 0.64, 1)` token. Delays and
 * durations are in seconds; stiffness/damping are spring physics units (framer
 * convention).
 */
export const claySpring: Transition = { type: 'spring', stiffness: 400, damping: 28 }

/**
 * Bezier mirror of the CSS `--ease-clay` token as a framer easing tuple
 * (`[x1, y1, x2, y2]`, unitless coordinates; y2 > 1 gives the clay overshoot). Use it
 * where a `Transition.ease` is required instead of a physics spring (springs ignore
 * `ease`).
 */
export const clayEase: [number, number, number, number] = [0.34, 1.56, 0.64, 1]

/**
 * Stagger delay for the child at position `index`, in seconds:
 * `min(index * STAGGER_STEP_S, STAGGER_MAX_DELAY_S)`. Motion law keeps total stagger
 * under 300ms.
 */
export function staggerDelay(index: number): number {
  return Math.min(index * STAGGER_STEP_S, STAGGER_MAX_DELAY_S)
}

/**
 * Synchronous motion-permission gate: `false` on the server and in environments without
 * `matchMedia`, `false` when the user asks for reduced motion
 * (`prefers-reduced-motion: reduce`) or the e-ink theme is active
 * (`html.theme-e-ink`), otherwise `true`. Must be checked before ANY JS-driven
 * animation, because those CSS kill-switches do not apply to framer's runtime-driven
 * styles. Deliberately synchronous (not the async `useReducedMotion` hook) so it can be
 * called inside layout effects without a first-frame race.
 */
export function motionOK(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  if (document.documentElement.classList.contains('theme-e-ink')) return false
  return true
}

/**
 * Rise + fade variant pair for a single element: rises 14px while fading in, on the
 * clay spring. Named `hidden`/`visible` so variant propagation and
 * `useAnimationControls.set/start` can drive it; never assign it to `initial` (SSR must
 * render the final state — see the file header).
 */
export const clayRiseVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: claySpring },
}

/**
 * Pop variant pair for a single element: scales up from 0.96 while fading in, on the
 * clay spring. Named `hidden`/`visible`; never assign it to `initial`.
 */
export const clayPopVariants: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: { opacity: 1, scale: 1, transition: claySpring },
}

/**
 * Container variant pair for {@link Stagger}: the container carries no visual values,
 * only the `staggerChildren` orchestration ({@link STAGGER_STEP_S} per child), which
 * schedules the `StaggerItem` children's own variants.
 */
export const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: STAGGER_STEP_S } },
}

/**
 * Child variant pair for {@link StaggerItem}. `visible` is a dynamic variant resolver:
 * framer passes the `custom` prop (the child's zero-based index) so each child adds
 * {@link staggerDelay} to its own transition, capped by {@link STAGGER_MAX_DELAY_S}.
 */
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: (index: number): TargetAndTransition => ({
    opacity: 1,
    y: 0,
    transition: { ...claySpring, delay: staggerDelay(index) },
  }),
}

interface ClayInProps {
  /** Content to reveal. */
  children: ReactNode
  /** Optional className forwarded to the rendered element. */
  className?: string
  /** Extra delay before the rise starts, in seconds. Defaults to `0`. */
  delayS?: number
  /** Rise distance in px. Defaults to `14` (matches `clayRiseVariants.hidden.y`). */
  y?: number
  /** Rendered tag. Defaults to `'div'`. */
  as?: 'div' | 'section'
}

/**
 * Mount entrance: rise + fade the children in once, on mount, on the clay spring.
 *
 * SSR-safe: renders the final state (`initial={false}`, no hiding styles in the HTML),
 * then — only when {@link motionOK} — hides imperatively in an isomorphic layout effect
 * and starts the rise before first paint. When motion is not allowed the children simply
 * stay visible. Transform/opacity only; `delayS` is in seconds.
 */
export function ClayIn({
  children,
  className,
  delayS = 0,
  y = 14,
  as = 'div',
}: ClayInProps): ReactElement {
  const controls = useAnimationControls()
  const MotionTag = as === 'section' ? motion.section : motion.div

  useIsoLayoutEffect(() => {
    if (!motionOK()) return
    controls.set({ opacity: 0, y })
    controls.start({ opacity: 1, y: 0, transition: { ...claySpring, delay: delayS } })
  }, [controls, delayS, y])

  return (
    <MotionTag initial={false} animate={controls} className={className}>
      {children}
    </MotionTag>
  )
}

interface RevealProps {
  /** Content to reveal. */
  children: ReactNode
  /** Optional className forwarded to the rendered element. */
  className?: string
  /** Extra delay before the reveal starts, in seconds. Defaults to `0`. */
  delayS?: number
  /** Rise distance in px. Defaults to `14`. */
  y?: number
  /** Reveal only the first time the element enters the viewport. Defaults to `true`. */
  once?: boolean
}

/**
 * Scroll reveal: rise + fade the children in when the element scrolls into view (the
 * observer triggers as the element crosses 10% above the viewport bottom, via the
 * `useInView` margin `0px 0px -10% 0px`).
 *
 * SSR-safe like {@link ClayIn}: final state in the HTML, hidden set imperatively
 * (client only, only when {@link motionOK}), started when `useInView` reports the
 * element in view. When motion is not allowed the content simply stays visible.
 * Transform/opacity only; `delayS` is in seconds.
 */
export function Reveal({
  children,
  className,
  delayS = 0,
  y = 14,
  once = true,
}: RevealProps): ReactElement {
  const controls = useAnimationControls()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once, margin: '0px 0px -10% 0px' })

  useIsoLayoutEffect(() => {
    if (!motionOK()) return
    controls.set({ opacity: 0, y })
  }, [controls, y])

  useIsoLayoutEffect(() => {
    if (!motionOK() || !inView) return
    controls.start({ opacity: 1, y: 0, transition: { ...claySpring, delay: delayS } })
  }, [controls, delayS, inView])

  return (
    <motion.div ref={ref} initial={false} animate={controls} className={className}>
      {children}
    </motion.div>
  )
}

interface StaggerProps {
  /** Children; `StaggerItem` descendants are staggered via variant propagation. */
  children: ReactNode
  /** Optional className forwarded to the rendered element. */
  className?: string
  /** Rendered tag. Defaults to `'div'`. */
  as?: 'div' | 'section'
}

/**
 * Stagger container: orchestrates {@link StaggerItem} children through the
 * {@link staggerContainer} variants (`staggerChildren: STAGGER_STEP_S`, totals kept
 * <300ms by `STAGGER_MAX_DELAY_S`).
 *
 * SSR-safe: renders the final state (`initial={false}`), then — only when
 * {@link motionOK} — imperatively sets the `hidden` variant and starts `visible` from an
 * isomorphic layout effect; variant propagation staggers the children. When motion is
 * not allowed nothing is hidden and nothing animates.
 */
export function Stagger({ children, className, as = 'div' }: StaggerProps): ReactElement {
  const controls = useAnimationControls()
  const MotionTag = as === 'section' ? motion.section : motion.div

  useIsoLayoutEffect(() => {
    if (!motionOK()) return
    controls.set('hidden')
    controls.start('visible')
  }, [controls])

  return (
    <MotionTag initial={false} animate={controls} variants={staggerContainer} className={className}>
      {children}
    </MotionTag>
  )
}

interface StaggerItemProps {
  /** Content of this staggered child. */
  children: ReactNode
  /** Optional className forwarded to the rendered element. */
  className?: string
  /** Zero-based position in the parent {@link Stagger} list. Defaults to `0`. */
  index?: number
}

/**
 * Stagger child: a motion element whose `visible` variant resolves a per-index delay
 * (`staggerDelay(index)`, capped by `STAGGER_MAX_DELAY_S`). Renders plain (final state)
 * on SSR and before the parent's controlled variants propagate; motion gating happens
 * in the parent {@link Stagger}.
 */
export function StaggerItem({ children, className, index = 0 }: StaggerItemProps): ReactElement {
  return (
    <motion.div variants={itemVariants} custom={index} className={className}>
      {children}
    </motion.div>
  )
}
