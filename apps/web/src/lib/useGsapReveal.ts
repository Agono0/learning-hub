'use client'

/**
 * Scroll-reveal on GSAP + ScrollTrigger: fades/rises the children of the
 * attached container into view as the container crosses the viewport.
 * Transform/opacity only (motion law) — `gsap.from` animates `opacity` + `y`,
 * nothing else.
 *
 * SSR-safe (load-bearing): gsap is never touched at module scope — the hook
 * only `await`s the cached dynamic {@link loadGsap} inside a client effect, so
 * the Node-env `renderToString` integration tests (no window) and the server
 * render see the FINAL visible content and never execute gsap. Gating note:
 * JS animation bypasses the CSS `prefers-reduced-motion` and e-ink
 * kill-switches, so every run is gated by `motionOK()` from './motion' first —
 * reduced-motion and e-ink users simply keep the statically rendered content
 * (per the motion law; nothing is ever hidden unless the tween runs).
 *
 * Stagger cap (motion law: stagger totals <300ms): the per-child delay is
 * `min(index * stagger, 0.26s)`, passed in GSAP's function-based `stagger`
 * form (gsap calls it as `(index, target, targets)` and uses the return as the
 * child's start offset), so even a 100-child list never waits longer than
 * 260ms before its last child starts.
 *
 * Cleanup follows the gsap-react skill's manual pattern: the tween is created
 * inside `gsap.context(…, container)` and the effect returns
 * `ctx.revert()`, which kills the tween AND its ScrollTrigger (the
 * `tween.scrollTrigger?.kill()` + `tween.kill()` pair, as one call) AND clears
 * the inline opacity/transform styles — so a dependency change re-runs the
 * effect from a clean, fully visible state instead of a mid-animation one.
 * If unmount races the async chunk load, a `cancelled` flag prevents the
 * context from ever being created. `once: false` re-entry (play again on each
 * viewport re-entry) is left to ScrollTrigger semantics.
 *
 * Usage:
 * ```tsx
 * const ref = useGsapReveal()
 * <div ref={ref}>…children…</div>
 * ```
 * or, revealing only marked descendants:
 * ```tsx
 * const ref = useGsapReveal({ selector: '[data-reveal]', y: 24, stagger: 0.08 })
 * <section ref={ref}>…<div data-reveal>…</div>…</section>
 * ```
 */

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
// Type-only import for the `gsap.Context` annotation — erased at runtime, never executed.
import type { gsap } from 'gsap'
import { loadGsap } from './gsap'
import { motionOK } from './motion'

/** Tunables for `useGsapReveal`. All optional; defaults fit a calm card grid. */
export interface GsapRevealOptions {
  /** Rise distance in px (default 16). Transform-only (motion law). */
  y?: number
  /** Per-child stagger step in seconds; capped so totals stay <300ms (default 0.05). */
  stagger?: number
  /**
   * Optional selector, resolved relative to the container
   * (`container.querySelectorAll(selector)`), narrowing the revealed children;
   * defaults to ALL direct children of the container.
   */
  selector?: string
  /** Reveal only the first time the container enters the viewport (default `true`). */
  once?: boolean
  /**
   * ScrollTrigger `start` — `"triggerPosition viewportPosition"` (default
   * `'top 85%'`, i.e. when the container's top crosses 85% of the viewport).
   */
  start?: string
}

/**
 * Hard cap on a single child's computed stagger delay, in seconds — the
 * function-based stagger clamps to it so the slowest child still starts
 * <300ms after its container begins (motion law: stagger totals <300ms).
 */
const MAX_STAGGER_DELAY_S = 0.26

/**
 * Attach the returned ref to a container; its children (or the `selector`
 * matches) rise + fade in with a capped stagger when the container scrolls
 * into view — only when `motionOK()`. Nothing is hidden at render time, so
 * SSR, the integration tests, and no-JS/motion-blocked clients all show the
 * final content untouched.
 *
 * @param options Optional `y`, `stagger`, `selector`, `once`, `start` (see
 *   {@link GsapRevealOptions}).
 * @returns A ref for the container element (nullable).
 */
export function useGsapReveal<T extends HTMLElement = HTMLDivElement>(
  options?: GsapRevealOptions,
): RefObject<T | null> {
  const { y = 16, stagger = 0.05, selector, once = true, start = 'top 85%' } = options ?? {}
  const ref = useRef<T | null>(null)

  useEffect(() => {
    // Reduced-motion / e-ink / SSR: skip entirely — the children keep their
    // rendered (visible) state, exactly as if the hook were not attached.
    if (!motionOK()) return

    let cancelled = false
    let ctx: gsap.Context | null = null

    loadGsap()
      // ScrollTrigger is already registered by loadGsap — the `scrollTrigger:`
      // config below works without the class itself.
      .then(({ gsap }) => {
        const container = ref.current
        if (cancelled || !container) return
        // Targets are queried ONLY within the container (never a bare selector
        // string — the gsap-react skill's scoping rule), so re-renders of other
        // components can never be swept into this tween.
        const targets = selector ? container.querySelectorAll(selector) : container.children
        if (targets.length === 0) return
        ctx = gsap.context(() => {
          gsap.from(targets, {
            opacity: 0,
            y,
            duration: 0.5,
            ease: 'power2.out',
            // Function-based stagger: child i starts after i * `stagger`
            // seconds, hard-capped at MAX_STAGGER_DELAY_S so the slowest child
            // still starts <300ms in (motion law: stagger totals <300ms).
            stagger: (index: number) => Math.min(index * stagger, MAX_STAGGER_DELAY_S),
            scrollTrigger: {
              trigger: container,
              start,
              once,
            },
          })
        }, container)
      })
      .catch(() => {
        // Chunk load failed — the content simply stays as rendered (visible).
      })

    return () => {
      cancelled = true
      // ctx.revert() = tween.scrollTrigger?.kill() + tween.kill() + revert of
      // the inline opacity/transform styles — the gsap-react skill's required
      // cleanup, which also leaves a clean state when the effect re-runs.
      ctx?.revert()
    }
  }, [y, stagger, selector, once, start])

  return ref
}
