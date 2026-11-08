'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/transport'
import { setHapticsEnabled } from '@/platform/haptics'

export type ThemePreference = 'dark' | 'light' | 'system' | 'e-ink'

export const THEME_STORAGE_KEY = 'lh-theme'

/** Color palettes — ids double as world-mood ids (see lib/three/WorldMood.ts). */
export type PaletteId = 'calm' | 'forest' | 'ocean' | 'sunset' | 'blossom' | 'midnight'

export const PALETTE_STORAGE_KEY = 'lh-palette'
export const PALETTE_CHANGE_EVENT = 'lh-palette-change'

export const PALETTES: Array<{ id: PaletteId; label: string; swatch: string[] }> = [
  { id: 'calm', label: 'Calm', swatch: ['#f6f8f5', '#7c8f84', '#56735f', '#0e120f'] },
  { id: 'forest', label: 'Forest', swatch: ['#f3f8f1', '#6f9b6a', '#3f7d46', '#0d130c'] },
  { id: 'ocean', label: 'Ocean', swatch: ['#f2f7fa', '#6f93b8', '#2f6ea3', '#0c1116'] },
  { id: 'sunset', label: 'Sunset', swatch: ['#faf5f0', '#c2916b', '#b45f2d', '#14100c'] },
  { id: 'blossom', label: 'Blossom', swatch: ['#faf4f7', '#c48ea4', '#b04a72', '#130e12'] },
  { id: 'midnight', label: 'Midnight', swatch: ['#f4f4f8', '#8b8fc0', '#6355c7', '#0d0d14'] },
]

export function normalizeThemePreference(raw: string | null | undefined): ThemePreference {
  if (raw === 'light' || raw === 'system' || raw === 'e-ink') return raw
  return 'dark'
}

export function normalizePalette(raw: string | null | undefined): PaletteId {
  return PALETTES.some((p) => p.id === raw) ? (raw as PaletteId) : 'calm'
}

export function resolveIsDark(pref: ThemePreference): boolean {
  if (pref === 'e-ink') return false
  if (pref === 'dark') return true
  if (pref === 'light') return false
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return true
}

export function applyThemePreference(pref: ThemePreference): void {
  if (typeof document === 'undefined') return
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, pref)
  } catch {
    // ignore storage restrictions
  }
  const isEInk = pref === 'e-ink'
  const isDark = resolveIsDark(pref)
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.classList.toggle('theme-e-ink', isEInk)
  document.documentElement.style.colorScheme = isEInk ? 'light' : isDark ? 'dark' : 'light'
}

function readStoredPalette(): PaletteId {
  if (typeof window === 'undefined') return 'calm'
  try {
    return normalizePalette(window.localStorage.getItem(PALETTE_STORAGE_KEY))
  } catch {
    return 'calm'
  }
}

const paletteStore = {
  subscribe(listener: () => void) {
    window.addEventListener(PALETTE_CHANGE_EVENT, listener)
    return () => window.removeEventListener(PALETTE_CHANGE_EVENT, listener)
  },
  getSnapshot(): PaletteId {
    return readStoredPalette()
  },
  set(palette: PaletteId) {
    try {
      window.localStorage.setItem(PALETTE_STORAGE_KEY, palette)
    } catch {
      // ignore storage restrictions
    }
    document.documentElement.dataset.theme = palette
    window.dispatchEvent(new Event(PALETTE_CHANGE_EVENT))
  },
}

/** Reactive handle on the active color palette (re-renders when it changes). */
export function usePalette(): PaletteId {
  return useSyncExternalStore(paletteStore.subscribe, paletteStore.getSnapshot, () => 'calm')
}

export function setPalette(palette: PaletteId): void {
  paletteStore.set(palette)
}

/**
 * Synchronizes `user_settings.theme` (`'dark' | 'light' | 'system'`) onto
 * `<html class="dark">` across every page and OS color-scheme change. The
 * color palette itself is local-first (`lh-palette` → `data-theme`), applied
 * pre-paint by the init script in app/layout.tsx.
 */
export function ThemeSync() {
  const { data } = useQuery<{ settings?: { theme?: string; hapticsEnabled?: boolean } }>({
    queryKey: ['settings'],
    queryFn: () => apiGet('/api/settings'),
    staleTime: 30_000,
  })

  // Hydration-safe: window reads live inside the effects below (this component
  // renders null, but keeping window access out of render prevents the whole
  // class of hydration mismatches).

  // Re-apply the palette on mount (covers SPA navigations after storage edits).
  useEffect(() => {
    document.documentElement.dataset.theme = readStoredPalette()
  }, [])

  useEffect(() => {
    const stored =
      data?.settings?.theme == null ? window.localStorage.getItem(THEME_STORAGE_KEY) : null
    const effective = normalizeThemePreference(data?.settings?.theme ?? stored)
    applyThemePreference(effective)
    if (effective !== 'system' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyThemePreference('system')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [data?.settings?.theme])

  // Apply the persisted haptics opt-out once settings arrive (undefined until
  // loaded → keep the default-on so early session haptics behave as shipped).
  useEffect(() => {
    if (data?.settings?.hapticsEnabled !== undefined) {
      setHapticsEnabled(data.settings.hapticsEnabled)
    }
  }, [data?.settings?.hapticsEnabled])

  return null
}
