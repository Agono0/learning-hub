/**
 * Lazy GSAP loader — the ONLY place this app touches gsap at runtime.
 *
 * GSAP must never be imported (or have `registerPlugin` called) at module scope: the
 * Node-env integration tests render web components with `renderToString` (no jsdom, no
 * window), where a top-level gsap import would execute and crash them. Callers instead
 * await `loadGsap()` inside a client effect; the dynamic import is cached, so gsap +
 * ScrollTrigger load exactly once, `ScrollTrigger` is registered exactly once, and the
 * bundle stays lean (gsap is code-split out of the initial chunk).
 *
 * Gating note: this module performs no DOM/window access and no motion checks of its
 * own — callers must gate any animation behind `motionOK()` from './motion' first, since
 * JS animations bypass the CSS `prefers-reduced-motion` and e-ink kill-switches.
 */

/** What `loadGsap()` resolves with: the gsap core instance plus the registered ScrollTrigger class. */
export interface LoadedGsap {
  gsap: (typeof import('gsap'))['gsap']
  ScrollTrigger: (typeof import('gsap/ScrollTrigger'))['ScrollTrigger']
}

let cached: Promise<LoadedGsap> | null = null

/**
 * Load GSAP core + the ScrollTrigger plugin once (cached dynamic import) and register
 * the plugin. Client-only: never call at module scope or during SSR — call inside a
 * client effect, after a `motionOK()` check.
 */
export function loadGsap(): Promise<LoadedGsap> {
  cached ??= Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(
    ([gsapModule, scrollTriggerModule]) => {
      gsapModule.gsap.registerPlugin(scrollTriggerModule.ScrollTrigger)
      return { gsap: gsapModule.gsap, ScrollTrigger: scrollTriggerModule.ScrollTrigger }
    },
  )
  return cached
}
