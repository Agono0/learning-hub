/**
 * Shortcut overrides (S3-35) — device-local persistence for the settings
 * section (no `user_settings` column: keyboard bindings are per-device
 * preferences, the audit L7a family). zod-validated on every read;
 * conflicts surface in the UI via core `detectConflicts`.
 */
import { shortcutOverridesSchema, type ShortcutOverrides } from '@learning-hub/core'

const KEY = 'lh:shortcut-overrides'

/** Load the overrides (empty off-storage / corrupted). */
export function loadShortcutOverrides(): ShortcutOverrides {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = shortcutOverridesSchema.safeParse(JSON.parse(raw) as unknown)
    return parsed.success ? parsed.data : {}
  } catch {
    return {}
  }
}

/** Persist the overrides (silent on storage errors). */
export function saveShortcutOverrides(overrides: ShortcutOverrides): void {
  if (typeof window === 'undefined') return
  const valid = shortcutOverridesSchema.parse(overrides)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(valid))
  } catch {
    // private mode / quota — overrides stay session-local
  }
}

/** Drop one override (back to the default combo). */
export function clearShortcutOverride(id: string): ShortcutOverrides {
  const next = loadShortcutOverrides()
  delete next[id]
  saveShortcutOverrides(next)
  return next
}
