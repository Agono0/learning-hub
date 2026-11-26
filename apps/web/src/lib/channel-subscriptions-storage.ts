/**
 * Tolerant read of the stored channel subscriptions. Both the share panel and the update banner
 * cast the stored JSON straight to an array; a value that parsed fine but had the wrong shape
 * (an object, a null entry, a record with no localItems) crashed the page on `.map`/`.find`
 * every time it loaded, with no way to recover short of clearing site data.
 */
export interface StoredSubscriptionShape {
  manifest: Record<string, unknown>
  localItems: unknown[]
  localVersion: number
}

export function parseStoredSubscriptions<T extends StoredSubscriptionShape>(
  raw: string | null,
): T[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((item): item is T => {
    if (typeof item !== 'object' || item === null) return false
    const r = item as Record<string, unknown>
    return (
      typeof r['manifest'] === 'object' &&
      r['manifest'] !== null &&
      Array.isArray(r['localItems']) &&
      typeof r['localVersion'] === 'number' &&
      Number.isFinite(r['localVersion'])
    )
  })
}

/** Persist subscriptions; returns false (instead of throwing) when storage is full or blocked. */
export function writeStoredSubscriptions(key: string, subs: unknown[]): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(subs))
    return true
  } catch {
    return false
  }
}
