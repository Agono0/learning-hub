/**
 * Stored state for the blueprint studio: one versioned envelope holding the
 * library and the history, plus the one-way migration from the first format
 * (a bare library under the v1 key).
 *
 * Loading never throws and never guesses. Corrupt JSON, a newer version, or an
 * oversized value is reported as `unreadable` so the host can keep the raw
 * data instead of overwriting it.
 */
import { emptyLibrary, readLibrary, type BlueprintLibrary } from './library'
import { readHistory, type HistoryEntry } from './history'

/** Current envelope version. */
export const STORAGE_VERSION = 2 as const

/** Largest stored string we will parse (characters). Larger is treated as unreadable. */
export const MAX_STORED_CHARS = 2_000_000

/** What the studio persists. */
export interface StudioState {
  library: BlueprintLibrary
  history: HistoryEntry[]
}

/** How the stored data was read. */
export type StorageStatus =
  'empty' | 'loaded' | 'migrated-v1' | 'corrupt' | 'unsupported-version' | 'too-large'

/** Result of {@link loadStudioState}. */
export interface StorageLoad {
  state: StudioState
  status: StorageStatus
  /** Entries dropped while reading (invalid, duplicate or over a cap). */
  dropped: number
  /** True when the stored value could not be read and must not be overwritten silently. */
  unreadable: boolean
  /** The version found in an unsupported envelope. */
  foundVersion?: unknown
}

/** An empty studio state. */
export function emptyState(): StudioState {
  return { library: emptyLibrary(), history: [] }
}

/** JSON string for storage (envelope v2). */
export function serializeState(state: StudioState): string {
  return JSON.stringify({
    version: STORAGE_VERSION,
    library: state.library,
    history: state.history,
  })
}

const unreadable = (status: StorageStatus, foundVersion?: unknown): StorageLoad => ({
  state: emptyState(),
  status,
  dropped: 0,
  unreadable: true,
  ...(foundVersion !== undefined ? { foundVersion } : {}),
})

/**
 * Load from the v2 value, else migrate the v1 value, else start empty.
 * v2 wins when both exist (the v1 value is left alone, never deleted).
 */
export function loadStudioState(v2: string | null | undefined, v1?: string | null): StorageLoad {
  if (v2) {
    if (v2.length > MAX_STORED_CHARS) return unreadable('too-large')
    let data: unknown
    try {
      data = JSON.parse(v2)
    } catch {
      return unreadable('corrupt')
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data))
      return unreadable('corrupt')
    const env = data as { version?: unknown; library?: unknown; history?: unknown }
    if (env.version !== STORAGE_VERSION) return unreadable('unsupported-version', env.version)
    const lib = readLibrary(env.library)
    const hist = readHistory(env.history)
    return {
      state: { library: lib.library, history: hist.history },
      status: 'loaded',
      dropped: lib.dropped + hist.dropped,
      unreadable: false,
    }
  }
  if (v1) {
    if (v1.length > MAX_STORED_CHARS) return unreadable('too-large')
    let data: unknown
    try {
      data = JSON.parse(v1)
    } catch {
      return unreadable('corrupt')
    }
    if (typeof data !== 'object' || data === null || Array.isArray(data))
      return unreadable('corrupt')
    const lib = readLibrary(data)
    return {
      state: { library: lib.library, history: [] },
      status: 'migrated-v1',
      dropped: lib.dropped,
      unreadable: false,
    }
  }
  return { state: emptyState(), status: 'empty', dropped: 0, unreadable: false }
}

/** Why a save failed. */
export type SaveFailure = 'quota' | 'unavailable'

/** The slice of `Storage` the studio needs (lets tests pass a fake). */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/**
 * Save without throwing: a full or blocked store is reported, and the caller
 * keeps working from memory.
 */
export function saveStudioState(
  store: KeyValueStore | null,
  key: string,
  state: StudioState,
): { ok: true } | { ok: false; reason: SaveFailure } {
  if (!store) return { ok: false, reason: 'unavailable' }
  try {
    store.setItem(key, serializeState(state))
    return { ok: true }
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    const quota = name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    return { ok: false, reason: quota ? 'quota' : 'unavailable' }
  }
}

/**
 * Keep a copy of unreadable data under `${key}.backup`, then clear `key`.
 * Returns whether the copy was kept. When the copy fails (quota), nothing is cleared.
 */
export function resetUnreadable(
  store: KeyValueStore,
  key: string,
): { ok: true } | { ok: false; reason: SaveFailure } {
  try {
    const raw = store.getItem(key)
    if (raw !== null) store.setItem(`${key}.backup`, raw)
    store.removeItem(key)
    return { ok: true }
  } catch (err) {
    const name = err instanceof Error ? err.name : ''
    return { ok: false, reason: name === 'QuotaExceededError' ? 'quota' : 'unavailable' }
  }
}
