/**
 * Learning HUB — plugin loader.
 *
 * Two ways plugins get in:
 * 1. `loadPlugins(['plugins'])` — scans each directory for plugin modules
 *    (`index.ts` / `index.js` / `index.mjs`, dynamic import). A directory may
 *    BE a plugin or CONTAIN plugin subdirectories (one level deep), so both
 *    `loadPlugins(['plugins/example-echo'])` and `loadPlugins(['plugins'])`
 *    work. Relative paths resolve against `process.cwd()`.
 * 2. `registerPlugin(moduleOrObject)` — programmatic/npm: hosts (apps/web,
 *    apps/mcp, apps/cli) call it for installed packages, tests call it with
 *    inline objects.
 *
 * Failure isolation contract: one broken plugin never prevents the others (or
 * the host) from starting. Invalid module shape, throwing import, throwing
 * `setup`, duplicate name — every case is logged with a `[plugins]` prefix and
 * skipped. `loadPlugins` therefore never rejects; it returns what loaded.
 */
import { existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  type CliCommandContribution,
  type McpToolContribution,
  type PluginContext,
  type PluginDefinition,
  createPluginLogger,
  parsePluginDefinition,
  pluginDefinitionIssues,
} from './plugin'
import { eventBus } from './events'

/** Entry file names a plugin directory may provide, in probe order. */
const PLUGIN_ENTRY_FILES = ['index.ts', 'index.js', 'index.mjs'] as const

/** A plugin that is registered and has finished (or is finishing) setup. */
export interface RegisteredPlugin {
  plugin: PluginDefinition
  /** Where it came from: a file path or 'programmatic'. */
  source: string
  /** Contributions pushed during setup (empty until setup resolved). */
  mcpTools: McpToolContribution[]
  cliCommands: CliCommandContribution[]
}

/** Registry state, keyed by plugin name (dedupe + programmatic access). */
const registry = new Map<string, RegisteredPlugin>()

/**
 * Register one plugin and run its `setup`. Returns the registered entry, or
 * `null` when the candidate was invalid/duplicate — the failure is logged, not
 * thrown. Duplicate names are skipped (a plugin already registered under the
 * same name is left untouched), which also makes `loadPlugins` idempotent
 * across hot reloads.
 */
export async function registerPlugin(candidate: unknown, source = 'programmatic'): Promise<RegisteredPlugin | null> {
  const plugin = parsePluginDefinition(candidate)
  if (!plugin) {
    console.error(`[plugins] ${source}: not a valid plugin definition (${pluginDefinitionIssues(candidate)}) — skipped`)
    return null
  }
  if (registry.has(plugin.name)) {
    console.warn(`[plugins] "${plugin.name}" (from ${source}) is already registered — skipped duplicate`)
    return null
  }

  const entry: RegisteredPlugin = { plugin, source, mcpTools: [], cliCommands: [] }
  const ctx: PluginContext = {
    events: eventBus,
    logger: createPluginLogger(plugin.name),
    mcpTools: entry.mcpTools,
    cliCommands: entry.cliCommands,
  }
  try {
    await plugin.setup(ctx)
  } catch (err) {
    // Isolation contract: a throwing setup logs and continues — the plugin is
    // NOT registered, the host and the other plugins keep working.
    console.error(`[plugins] "${plugin.name}" (from ${source}) setup failed — skipped:`, err)
    return null
  }
  registry.set(plugin.name, entry)
  return entry
}

/** Every registered plugin, in registration order. */
export function listPlugins(): RegisteredPlugin[] {
  return [...registry.values()]
}

/**
 * Aggregate contribution registries across all registered plugins, in
 * registration order. Hosts merge these alongside their built-ins.
 */
export function getPluginContributions(): { mcpTools: McpToolContribution[]; cliCommands: CliCommandContribution[] } {
  const mcpTools: McpToolContribution[] = []
  const cliCommands: CliCommandContribution[] = []
  for (const entry of registry.values()) {
    mcpTools.push(...entry.mcpTools)
    cliCommands.push(...entry.cliCommands)
  }
  return { mcpTools, cliCommands }
}

/** Forget every registration (useful in tests and hot reloads). */
export function resetPlugins(): void {
  registry.clear()
}

/** First existing entry file of a plugin directory, or null when none. */
function findEntryFile(dir: string): string | null {
  for (const file of PLUGIN_ENTRY_FILES) {
    const candidate = resolve(dir, file)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Import one plugin module and register it. The default export must be a
 * `definePlugin` result or an equivalent plain object.
 */
async function loadPluginModule(dir: string): Promise<RegisteredPlugin | null> {
  const entryFile = findEntryFile(dir)
  if (!entryFile) {
    console.warn(`[plugins] ${dir}: no ${PLUGIN_ENTRY_FILES.join('/')} entry — skipped`)
    return null
  }
  const source = pathToFileURL(entryFile).href
  let moduleValue: unknown
  try {
    // Fully dynamic specifier (file URL) — never statically analyzable, so no
    // bundler can rewrite it; the host runtime (tsx/Node) executes it natively.
    moduleValue = (await import(/* @vite-ignore */ source)).default
  } catch (err) {
    console.error(`[plugins] ${entryFile}: import failed — skipped:`, err)
    return null
  }
  return registerPlugin(moduleValue, entryFile)
}

/**
 * Scan directories for plugin modules and register everything found. Each
 * directory may itself be a plugin (own entry file) and/or contain plugin
 * subdirectories; missing directories are logged and skipped. Per-plugin
 * failures never reject this promise — see the module docblock.
 */
export async function loadPlugins(dirs: string[]): Promise<RegisteredPlugin[]> {
  for (const rawDir of dirs) {
    const dir = resolve(process.cwd(), rawDir)
    if (!existsSync(dir)) {
      console.warn(`[plugins] directory "${rawDir}" (resolved ${dir}) does not exist — no plugins loaded from it`)
      continue
    }

    // The directory itself may be a single plugin…
    if (findEntryFile(dir)) {
      await loadPluginModule(dir)
    }

    // …and/or a group directory of plugin subdirectories (one level deep).
    const children = readdirSync(dir, { withFileTypes: true })
    for (const child of children) {
      if (!child.isDirectory()) continue
      const subDir = resolve(dir, child.name)
      if (findEntryFile(subDir)) {
        await loadPluginModule(subDir)
      }
    }
  }
  return listPlugins()
}
