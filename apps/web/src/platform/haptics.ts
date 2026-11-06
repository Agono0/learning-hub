'use client'

/**
 * Haptic feedback (native shells only). The Tauri haptics plugin is wired in
 * Rust; the JS side is a thin `invoke` — no extra npm package needed. Every
 * call is feature-detected and silently ignored on the web.
 */
import { isTauri } from '@/lib/transport'

type ImpactStyle = 'light' | 'medium' | 'heavy'

async function impact(style: ImpactStyle): Promise<void> {
  if (!isTauri) return
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('plugin:haptics|impact', { style })
  } catch {
    // Plugin absent (desktop) or unsupported device — silence is correct.
  }
}

/** Feather tick — correct answers, check-ins. */
export function hapticLight(): void {
  void impact('light')
}

/** Confident tap — grade buttons, unlocks. */
export function hapticMedium(): void {
  void impact('medium')
}

/** Milestone feedback — achievement unlock, session complete. */
export function hapticHeavy(): void {
  void impact('heavy')
}

/** Pattern buzz — streak lost, friction gate fired. */
export function hapticWarning(): void {
  if (!isTauri) return
  try {
    void import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke('plugin:haptics|vibrate', [40, 60, 40]).catch(() => {}),
    )
  } catch {
    /* ignore */
  }
}
