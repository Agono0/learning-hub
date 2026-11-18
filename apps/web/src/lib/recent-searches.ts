'use client'

/**
 * Recent searches — device-local memory of the last few palette queries.
 *
 * Pure helpers are exported for tests; storage failures (private mode,
 * quota) degrade to "no recents" without ever throwing into the palette.
 * Capped at 5 entries (calm, not a history wall); duplicates move to front.
 */
const RECENT_KEY = 'lh-palette-recent-searches'
const RECENT_LIMIT = 5

/** Pure: add a query to the recents list (dedupe → front → cap). */
export function pushRecentSearch(list: string[], query: string): string[] {
  const q = query.trim()
  if (q.length < 2) return list
  const next = [q, ...list.filter((item) => item.toLowerCase() !== q.toLowerCase())]
  return next.slice(0, RECENT_LIMIT)
}

/** Read recents; corrupt storage degrades to an empty list. */
export function getRecentSearches(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(RECENT_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length >= 2).slice(0, RECENT_LIMIT)
  } catch {
    return []
  }
}

/** Persist the recents list (fire-and-forget safe). */
export function saveRecentSearches(list: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_LIMIT)))
  } catch {
    /* private mode / quota — recents are a nicety, never a dependency */
  }
}

/** Record one executed search (call on select/search-execution). */
export function rememberSearch(query: string): string[] {
  const next = pushRecentSearch(getRecentSearches(), query)
  saveRecentSearches(next)
  return next
}

/** Clear all recents (palette affordance). */
export function clearRecentSearches(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(RECENT_KEY)
  } catch {
    /* ignore */
  }
}

export const RECENT_SEARCH_LIMIT = RECENT_LIMIT
