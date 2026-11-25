/**
 * A small pure library of installed blueprints plus (de)serialization.
 * Hosts persist `serializeLibrary(...)` wherever they like (the web UI uses
 * localStorage); this module does no I/O.
 */
import { validateBlueprint, type BlueprintIssue } from './validate'
import { startSession, type BlueprintSession } from './runtime'
import type { Blueprint } from './schema'

/** Persisted shape: installed blueprints and at most one active session each. */
export interface BlueprintLibrary {
  installed: Blueprint[]
  sessions: Record<string, BlueprintSession>
}

/** An empty library. */
export function emptyLibrary(): BlueprintLibrary {
  return { installed: [], sessions: {} }
}

/** Add or replace (same id, any version) a blueprint. */
export function installIntoLibrary(
  lib: BlueprintLibrary,
  input: unknown,
):
  | { ok: true; library: BlueprintLibrary; replaced: boolean }
  | { ok: false; issues: BlueprintIssue[] } {
  const res = validateBlueprint(input)
  if (!res.ok) return res
  const bp = res.blueprint
  const replaced = lib.installed.some((b) => b.id === bp.id)
  const sessions = { ...lib.sessions }
  // a replaced blueprint invalidates a running session built on the old phases
  if (replaced) delete sessions[bp.id]
  return {
    ok: true,
    replaced,
    library: { installed: [...lib.installed.filter((b) => b.id !== bp.id), bp], sessions },
  }
}

/** Remove a blueprint and its session. */
export function uninstallFromLibrary(lib: BlueprintLibrary, id: string): BlueprintLibrary {
  const sessions = { ...lib.sessions }
  delete sessions[id]
  return { installed: lib.installed.filter((b) => b.id !== id), sessions }
}

/** Start (or restart) a session for an installed blueprint. */
export function startInLibrary(
  lib: BlueprintLibrary,
  id: string,
  overrides: Record<string, unknown> = {},
): { ok: true; library: BlueprintLibrary } | { ok: false; issues: BlueprintIssue[] } {
  const bp = lib.installed.find((b) => b.id === id)
  if (!bp) return { ok: false, issues: [{ path: 'id', message: `"${id}" is not installed` }] }
  const started = startSession(bp, overrides)
  if (!started.ok) return started
  return { ok: true, library: { ...lib, sessions: { ...lib.sessions, [id]: started.session } } }
}

/** JSON string for storage. */
export function serializeLibrary(lib: BlueprintLibrary): string {
  return JSON.stringify(lib)
}

/** Most blueprints a library keeps; extra stored entries are dropped on load. */
export const MAX_INSTALLED_BLUEPRINTS = 50

/** Result of reading an untrusted library value. */
export interface LibraryRead {
  library: BlueprintLibrary
  /** Installed blueprints or sessions that were invalid, duplicate or over the cap. */
  dropped: number
}

/**
 * Read an already-parsed JSON value as a library, defensively: invalid or
 * duplicate blueprints are dropped (and counted), at most
 * {@link MAX_INSTALLED_BLUEPRINTS} are kept, and a session that no longer
 * matches its blueprint version or phases is discarded.
 */
export function readLibrary(data: unknown): LibraryRead {
  const empty = { library: emptyLibrary(), dropped: 0 }
  if (typeof data !== 'object' || data === null) return empty
  const obj = data as { installed?: unknown; sessions?: unknown }
  const installed: Blueprint[] = []
  let dropped = 0
  if (Array.isArray(obj.installed)) {
    for (const item of obj.installed) {
      const res = validateBlueprint(item)
      if (res.ok && !installed.some((b) => b.id === res.blueprint.id)) {
        if (installed.length < MAX_INSTALLED_BLUEPRINTS) installed.push(res.blueprint)
        else dropped++
      } else dropped++
    }
  }
  const sessions: Record<string, BlueprintSession> = {}
  if (typeof obj.sessions === 'object' && obj.sessions !== null) {
    for (const [id, s] of Object.entries(obj.sessions as Record<string, BlueprintSession>)) {
      const bp = installed.find((b) => b.id === id)
      if (
        bp &&
        s &&
        s.blueprintVersion === bp.version &&
        bp.phases.some((p) => p.id === s.phaseId) &&
        Array.isArray(s.history)
      )
        sessions[id] = s
      else dropped++
    }
  }
  return { library: { installed, sessions }, dropped }
}

/** Parse stored JSON defensively: bad JSON yields an empty library. */
export function parseLibrary(raw: string | null | undefined): BlueprintLibrary {
  if (!raw) return emptyLibrary()
  try {
    return readLibrary(JSON.parse(raw)).library
  } catch {
    return emptyLibrary()
  }
}
