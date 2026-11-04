/**
 * Plugin bootstrap for the Next.js server (SERVER-only).
 *
 * API routes call {@link ensurePluginsLoaded} once before their first event
 * emission, so plugins under `plugins/` are registered before any event can
 * fire. The load promise is cached on globalThis to survive dev hot-reloads
 * (same pattern as `lib/db.ts`) — `loadPlugins` also dedupes by plugin name,
 * so re-running it is a no-op, not a double-setup.
 */
import { loadPlugins } from '@learning-hub/core'

const g = globalThis as unknown as { __learningHubPlugins?: Promise<unknown> }

/** Load plugins from `plugins/` (cwd-relative) exactly once per server process. */
export function ensurePluginsLoaded(): Promise<unknown> {
  if (!g.__learningHubPlugins) {
    g.__learningHubPlugins = loadPlugins(['plugins']).catch((err) => {
      // loadPlugins is already per-plugin graceful; this guards the loop itself.
      console.error('[plugins] unexpected failure while loading plugins:', err)
      g.__learningHubPlugins = undefined
    })
  }
  return g.__learningHubPlugins
}
