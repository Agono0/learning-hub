/**
 * Learning HUB — plugin loader.
 *
 * Three ways plugins get in:
 * 1. `loadPlugins(dirs, { storage? })` — scans each directory for plugin
 *    modules (`index.ts` / `index.js` / `index.mjs`, dynamic import). A
 *    directory may BE a plugin or CONTAIN plugin subdirectories (one level
 *    deep), so both `loadPlugins(['plugins/example-echo'])` and
 *    `loadPlugins(['plugins'])` work. Relative paths resolve against
 *    `process.cwd()`. The filesystem walk lives behind
 *    {@link PluginSourceStorage}: the Node default (fs/path/url) is created
 *    lazily INSIDE the scan, so this module itself loads in browsers — hosts
 *    on other runtimes inject their own storage.
 * 2. `registerBundledPlugin(plugin)` — programmatic registration of an
 *    already-imported plugin (mobile path: bundled imports). Synchronous.
 * 3. `registerPlugin(moduleOrObject)` — awaitable programmatic/npm path:
 *    hosts (apps/web, apps/mcp, apps/cli) call it for installed packages,
 *    tests call it with inline objects.
 *
 * Failure isolation contract: one broken plugin never prevents the others (or
 * the host) from starting. Invalid module shape, throwing import, throwing
 * `setup`, duplicate name — every case is logged with a `[plugins]` prefix and
 * skipped. `loadPlugins` therefore never rejects; it returns what loaded.
 * `listPlugins()` returns every registered plugin — bundled, scanned and
 * programmatic alike.
 */
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

/** Host-facing alias for the plugin contract (same object as PluginDefinition). */
export type LearningHubPlugin = PluginDefinition

/** Entry file names a plugin directory may provide, in probe order. */
const PLUGIN_ENTRY_FILES = ['index.ts', 'index.js', 'index.mjs'] as const

/** A plugin that is registered and has finished (or is finishing) setup. */
export interface RegisteredPlugin {
  plugin: PluginDefinition
  /** Where it came from: a file path, 'programmatic' or 'bundled'. */
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
export async function registerPlugin(
  candidate: unknown,
  source = 'programmatic',
): Promise<RegisteredPlugin | null> {
  const plugin = parsePluginDefinition(candidate)
  if (!plugin) {
    console.error(
      `[plugins] ${source}: not a valid plugin definition (${pluginDefinitionIssues(candidate)}) — skipped`,
    )
    return null
  }
  if (registry.has(plugin.name)) {
    console.warn(
      `[plugins] "${plugin.name}" (from ${source}) is already registered — skipped duplicate`,
    )
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

/**
 * Register an already-imported plugin (mobile path: bundled imports) WITHOUT
 * any filesystem or dynamic-module work. Synchronous by contract: the entry
 * lands in the registry immediately, so `listPlugins()` is complete right
 * after the call. A sync-throwing setup means the plugin is not registered;
 * an async setup registers first and, if it later rejects, the entry is
 * removed again — the same isolation contract as {@link registerPlugin}.
 * Invalid candidates and duplicate names are logged and skipped, never thrown.
 */
export function registerBundledPlugin(plugin: LearningHubPlugin): void {
  const parsed = parsePluginDefinition(plugin)
  if (!parsed) {
    console.error(
      `[plugins] bundled plugin: not a valid plugin definition (${pluginDefinitionIssues(plugin)}) — skipped`,
    )
    return
  }
  if (registry.has(parsed.name)) {
    console.warn(`[plugins] "${parsed.name}" (bundled) is already registered — skipped duplicate`)
    return
  }

  const entry: RegisteredPlugin = {
    plugin: parsed,
    source: 'bundled',
    mcpTools: [],
    cliCommands: [],
  }
  const ctx: PluginContext = {
    events: eventBus,
    logger: createPluginLogger(parsed.name),
    mcpTools: entry.mcpTools,
    cliCommands: entry.cliCommands,
  }

  let result: void | Promise<void>
  try {
    result = parsed.setup(ctx)
  } catch (err) {
    console.error(`[plugins] "${parsed.name}" (bundled) setup failed — skipped:`, err)
    return
  }

  registry.set(parsed.name, entry)
  if (result instanceof Promise) {
    void result.catch((err) => {
      if (registry.get(parsed.name) === entry) registry.delete(parsed.name)
      console.error(`[plugins] "${parsed.name}" (bundled) setup failed — skipped:`, err)
    })
  }
}

/** Every registered plugin, in registration order (bundled + loaded + programmatic). */
export function listPlugins(): RegisteredPlugin[] {
  return [...registry.values()]
}

/**
 * Aggregate contribution registries across all registered plugins, in
 * registration order. Hosts merge these alongside their built-ins.
 */
export function getPluginContributions(): {
  mcpTools: McpToolContribution[]
  cliCommands: CliCommandContribution[]
} {
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

// ─── Plugin sources (runtime-agnostic directory scan) ───────────────────────

/** One discoverable plugin entry — a file path in Node, anything elsewhere. */
export interface PluginSource {
  /** Stable id recorded in `RegisteredPlugin.source` and used in failure logs. */
  id: string
}

/**
 * Runtime-agnostic backend for {@link loadPlugins}: lists plugin sources and
 * reads (loads) their modules. The Node default walks the filesystem with
 * node:fs/node:path/node:url — imported LAZILY so this module loads in
 * browsers and webview workers. Hosts on other runtimes pass their own
 * storage: `read` resolves with a module namespace (its `.default` is used) or
 * directly with the plugin candidate object.
 */
export interface PluginSourceStorage {
  /**
   * Discover the plugin entry sources under the given root dirs, in scan
   * order. Mirrors the Node contract: a missing root is warned about and
   * skipped; root dirs without an entry file may still hold plugin
   * subdirectories (one level deep).
   */
  list(dirs: string[]): PluginSource[] | Promise<PluginSource[]>
  /** Load one source. Resolves with the module namespace (default export is picked) or the plugin object itself. */
  read(source: PluginSource): Promise<unknown>
}

/** Lazily-created Node filesystem storage (single promise; deterministic errors). */
let nodeStoragePromise: Promise<PluginSourceStorage> | null = null

/**
 * The Node default {@link PluginSourceStorage}. Every `node:` import lives
 * here, guarded and lazy — calling it on a non-Node runtime throws a clear
 * error instead of breaking module load.
 */
function getNodeSourceStorage(): Promise<PluginSourceStorage> {
  if (!nodeStoragePromise) {
    nodeStoragePromise = createNodeSourceStorage()
  }
  return nodeStoragePromise
}

async function createNodeSourceStorage(): Promise<PluginSourceStorage> {
  let fs: typeof import('node:fs')
  let path: typeof import('node:path')
  let url: typeof import('node:url')
  try {
    ;[fs, path, url] = await Promise.all([
      import('node:fs'),
      import('node:path'),
      import('node:url'),
    ])
  } catch (err) {
    throw new Error(
      '[plugins] directory scanning requires a Node runtime (node:fs is unavailable here) — ' +
        'use registerBundledPlugin() or pass { storage } to loadPlugins()',
      { cause: err },
    )
  }

  /** First existing entry file of a plugin directory, or null when none. */
  function findEntryFile(dir: string): string | null {
    for (const file of PLUGIN_ENTRY_FILES) {
      const candidate = path.resolve(dir, file)
      if (fs.existsSync(candidate)) return candidate
    }
    return null
  }

  return {
    list(dirs: string[]): PluginSource[] {
      const sources: PluginSource[] = []
      for (const rawDir of dirs) {
        const dir = path.resolve(process.cwd(), rawDir)
        if (!fs.existsSync(dir)) {
          console.warn(
            `[plugins] directory "${rawDir}" (resolved ${dir}) does not exist — no plugins loaded from it`,
          )
          continue
        }

        // The directory itself may be a single plugin…
        const entry = findEntryFile(dir)
        if (entry) sources.push({ id: entry })

        // …and/or a group directory of plugin subdirectories (one level deep).
        const children = fs.readdirSync(dir, { withFileTypes: true })
        for (const child of children) {
          if (!child.isDirectory()) continue
          const subEntry = findEntryFile(path.resolve(dir, child.name))
          if (subEntry) sources.push({ id: subEntry })
        }
      }
      return sources
    },

    async read(source: PluginSource): Promise<unknown> {
      // Fully dynamic specifier (file URL) — never statically analyzable, so
      // no bundler can rewrite it; the host runtime (tsx/Node) executes it natively.
      return import(/* @vite-ignore */ url.pathToFileURL(source.id).href)
    },
  }
}

/**
 * Scan directories for plugin modules and register everything found. Each
 * directory may itself be a plugin (own entry file) and/or contain plugin
 * subdirectories; missing directories are logged and skipped. Per-plugin
 * failures never reject this promise — see the module docblock. On runtimes
 * without Node, pass `{ storage }` implementing {@link PluginSourceStorage}.
 */
export async function loadPlugins(
  dirs: string[],
  options?: { storage?: PluginSourceStorage },
): Promise<RegisteredPlugin[]> {
  const storage = options?.storage ?? (await getNodeSourceStorage())
  const sources = await storage.list(dirs)

  for (const source of sources) {
    let moduleValue: unknown
    try {
      moduleValue = await storage.read(source)
    } catch (err) {
      console.error(`[plugins] ${source.id}: import failed — skipped:`, err)
      continue
    }
    const candidate =
      (moduleValue as { default?: unknown } | null | undefined)?.default ?? moduleValue
    await registerPlugin(candidate, source.id)
  }
  return listPlugins()
}
