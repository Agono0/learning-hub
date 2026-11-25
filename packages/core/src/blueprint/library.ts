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

/**
 * Parse stored JSON defensively: bad JSON or invalid entries are dropped, and
 * a session that no longer matches its blueprint version is discarded.
 */
export function parseLibrary(raw: string | null | undefined): BlueprintLibrary {
  if (!raw) return emptyLibrary()
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return emptyLibrary()
  }
  if (typeof data !== 'object' || data === null) return emptyLibrary()
  const obj = data as { installed?: unknown; sessions?: unknown }
  const installed: Blueprint[] = []
  if (Array.isArray(obj.installed)) {
    for (const item of obj.installed) {
      const res = validateBlueprint(item)
      if (res.ok && !installed.some((b) => b.id === res.blueprint.id)) installed.push(res.blueprint)
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
    }
  }
  return { installed, sessions }
}
