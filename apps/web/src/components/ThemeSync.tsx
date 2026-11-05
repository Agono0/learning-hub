'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '@/lib/transport'

export type ThemePreference = 'dark' | 'light' | 'system'

export const THEME_STORAGE_KEY = 'lh-theme'

export function normalizeThemePreference(raw: string | null | undefined): ThemePreference {
  if (raw === 'light' || raw === 'system') return raw
  return 'dark'
}

export function resolveIsDark(pref: ThemePreference): boolean {
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
  const isDark = resolveIsDark(pref)
  document.documentElement.classList.toggle('dark', isDark)
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light'
}

/**
 * Synchronizes `user_settings.theme` (`'dark' | 'light' | 'system'`) onto
 * `<html class="dark">` across every page and OS color-scheme change.
 */
export function ThemeSync() {
  const { data } = useQuery<{ settings?: { theme?: string } }>({
    queryKey: ['settings'],
    queryFn: () => apiGet('/api/settings'),
    staleTime: 30_000,
  })

  const pref = normalizeThemePreference(
    data?.settings?.theme ??
      (typeof window !== 'undefined' ? window.localStorage.getItem(THEME_STORAGE_KEY) : 'dark'),
  )

  useEffect(() => {
    applyThemePreference(pref)
    if (pref !== 'system' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyThemePreference('system')
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [pref])

  return null
}
