'use client'

/**
 * Haptic feedback (native shells and mobile web). The Tauri haptics plugin is wired in
 * Rust; on web browsers supporting the HTML5 Vibration API, navigator.vibrate provides
 * instant tactile feedback for card grading, hypercorrections, and milestones.
 *
 * Opt-out invariant (calm by default): every helper becomes a no-op while
 * disabled. The flag persists in user_settings.haptics_enabled (migration 027)
 * and is applied at boot from the settings load (ThemeSync path).
 */
import { isTauri } from '@/lib/transport'

type ImpactStyle = 'light' | 'medium' | 'heavy'

/** Master switch; defaults to the shipped always-on behavior until settings load. */
let enabled = true

/** Apply the persisted user_settings.haptics_enabled value at boot. */
export function setHapticsEnabled(value: boolean): void {
  enabled = value
}

/** Current flag — exported for tests and settings UI state reflection. */
export function hapticsEnabled(): boolean {
  return enabled
}

function webVibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(pattern)
    } catch {
      // Ignore vibration errors if blocked by permissions
    }
  }
}

async function impact(style: ImpactStyle): Promise<void> {
  if (!enabled) return
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      await invoke('plugin:haptics|impact', { style })
      return
    } catch {
      // Plugin absent (desktop) or unsupported device — fallback to web vibrate
    }
  }
  const ms = style === 'light' ? 12 : style === 'medium' ? 25 : 50
  webVibrate(ms)
}

/** Feather tick (12ms) — correct answers, check-ins. */
export function hapticLight(): void {
  void impact('light')
}

/** Confident tap (25ms) — grade buttons, unlocks. */
export function hapticMedium(): void {
  void impact('medium')
}

/** Milestone feedback (50ms) — achievement unlock, session complete. */
export function hapticHeavy(): void {
  void impact('heavy')
}

/** Pattern buzz — streak lost, friction gate fired, incorrect answer. */
export function hapticWarning(): void {
  if (!enabled) return
  if (isTauri) {
    try {
      void import('@tauri-apps/api/core').then(({ invoke }) =>
        invoke('plugin:haptics|vibrate', [40, 60, 40]).catch(() => {}),
      )
      return
    } catch {
      /* ignore */
    }
  }
  webVibrate([40, 60, 40])
}

/** Double subtle tap — hypercorrection high-confidence error alert (Metcalfe 2017). */
export function hapticHypercorrection(): void {
  if (!enabled) return
  if (isTauri) {
    try {
      void import('@tauri-apps/api/core').then(({ invoke }) =>
        invoke('plugin:haptics|vibrate', [20, 40, 20]).catch(() => {}),
      )
      return
    } catch {
      /* ignore */
    }
  }
  webVibrate([20, 40, 20])
}

/** Gentle rhythm pulse — friction gate breathing guidance. */
export function hapticBreathe(): void {
  if (!enabled) return
  if (isTauri) {
    try {
      void import('@tauri-apps/api/core').then(({ invoke }) =>
        invoke('plugin:haptics|vibrate', [20, 100, 20, 100, 30]).catch(() => {}),
      )
      return
    } catch {
      /* ignore */
    }
  }
  webVibrate([20, 100, 20, 100, 30])
}
