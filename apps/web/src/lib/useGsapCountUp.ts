'use client'

/**
 * Count-up numbers on clay surfaces.
 *
 * SSR — and the Node-env `renderToString` integration tests — see the FINAL number,
 * because the component renders `{end}` normally and this hook only rewrites
 * `textContent` inside a client effect after the gsap chunk loads. Gsap itself is never
 * statically imported (only via the cached dynamic import in './gsap'; the type-only
 * import below is erased at compile time), so nothing touches gsap at module scope.
 *
 * Gating note: JS animations bypass the CSS `prefers-reduced-motion` and e-ink
 * kill-switches, so every run is gated by `motionOK()` from './motion' — reduced-motion
 * and e-ink users simply keep the static final number (per the motion law).
 */

import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
// Type-only import for the `gsap.core.Tween` annotation — erased at runtime, never executed.
import type { gsap } from 'gsap'
import { loadGsap } from './gsap'
import { motionOK } from './motion'

/** Tunables for `useGsapCountUp`. All optional; sensible defaults for clay stat rows. */
export interface CountUpOptions {
  /** Tween duration in seconds (default 0.9). */
  duration?: number
  /** GSAP ease name (default 'power2.out'). */
  ease?: string
  /** Value to count from on FIRST mount (default 0); subsequent value changes tween from the previous value. */
  from?: number
}

/**
 * Attach the returned ref to a span that renders ONLY the number, e.g.
 * `<span ref={ref}>{value}</span>`. The component keeps rendering `{value}` normally
 * (that is what SSR and the integration tests assert); this hook rewrites `textContent`
 * client-side, tweening from the previous value to `end` — only when `motionOK()`;
 * otherwise the element keeps the static final number.
 *
 * @param end Final count to land on. Guarded: NaN/negative is treated as 0, and the
 *   display is a non-negative integer via `Math.round` (all current uses are integer
 *   counts/XP/minutes).
 * @param options Optional `duration` (seconds), `ease` name and first-mount `from` value.
 * @returns A ref for an `HTMLSpanElement` (nullable).
 */
export function useGsapCountUp(
  end: number,
  options?: CountUpOptions,
): RefObject<HTMLSpanElement | null> {
  const { duration = 0.9, ease = 'power2.out', from = 0 } = options ?? {}
  const ref = useRef<HTMLSpanElement | null>(null)
  const prevRef = useRef(from)

  useEffect(() => {
    // Guard against NaN/negative ends: every use is a non-negative integer count.
    const target = Number.isFinite(end) && end > 0 ? end : 0

    // Reduced-motion / e-ink / SSR: the element already shows the final number from React.
    if (!motionOK()) {
      prevRef.current = target
      return
    }

    let cancelled = false
    let tween: gsap.core.Tween | null = null

    loadGsap()
      .then(({ gsap }) => {
        if (cancelled || !ref.current) return
        const prev = prevRef.current
        const start = Number.isFinite(prev) && prev >= 0 ? prev : 0
        const counter = { v: start }
        tween = gsap.to(counter, {
          v: target,
          duration,
          ease,
          onUpdate: () => {
            if (ref.current) ref.current.textContent = String(Math.round(counter.v))
          },
        })
      })
      .catch(() => {
        // Chunk load failed — leave the React-rendered final number untouched.
      })

    return () => {
      cancelled = true
      tween?.kill()
      prevRef.current = target
    }
  }, [end, duration, ease, from])

  return ref
}
