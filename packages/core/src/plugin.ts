/**
 * Learning HUB — plugin contract.
 *
 * A plugin is one `setup(ctx)` function that subscribes to platform events and
 * pushes contributions into the registries handed to it. Everything else in
 * the object is metadata (`name`/`version`/`description`) used for logs,
 * dedupe and help output. Define plugins with {@link definePlugin} — it
 * validates the shape at the boundary (zod) so a malformed plugin fails at
 * load time with a clear message instead of at emit time with a confusing one.
 *
 * Distribution shapes:
 * - a folder under `plugins/` with an `index.ts`/`index.js`/`index.mjs` that
 *   default-exports the {@link PluginDefinition} (see plugins/example-echo);
 * - an npm package that default-exports the same object (hosts call
 *   `registerPlugin(await import('my-plugin'))` — see docs/plugins.md).
 */
import { z } from 'zod'
import type { EventBus, HubEventMap } from './events'

// ─── Contribution registries ────────────────────────────────────────────────

/**
 * One content block of an MCP tool reply (structural subset of CallToolResult).
 * Type aliases, not interfaces — they must stay assignable to the MCP SDK's
 * index-signature-carrying result types.
 */
export type McpToolContent = {
  type: 'text'
  text: string
}

/** What a contributed MCP tool handler returns (structural, no SDK import). */
export type McpToolResult = {
  content: McpToolContent[]
  isError?: boolean
}

/** Handler for a contributed MCP tool; `args` is the zod-parsed input object. */
export type McpToolHandler = (
  args: Record<string, unknown>,
) => McpToolResult | Promise<McpToolResult>

/**
 * An MCP tool a plugin adds to the `learning-hub` server. `inputSchema` is a
 * zod "raw shape" (`{ title: z.string(), … }`) — exactly what the MCP SDK's
 * `registerTool` expects, and what powers the tool's client-side form.
 */
export interface McpToolContribution {
  name: string
  description: string
  inputSchema: z.ZodRawShape
  handler: McpToolHandler
}

/** A terminal command a plugin adds to the `learning-hub` CLI. */
export interface CliCommandContribution {
  /** Invoked as `learning-hub <name> <args…>`. */
  name: string
  /** One line shown in the CLI help panel. */
  description: string
  /** Receives the raw argument strings after the command name. */
  run: (args: string[]) => void | Promise<void>
}

// ─── Plugin context ─────────────────────────────────────────────────────────

/** Namespaced console wrapper: every line is prefixed with `[plugin:<name>]`. */
export interface PluginLogger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
}

/** Factory for the logger shape handed to plugins — hosts use it too. */
export function createPluginLogger(pluginName: string): PluginLogger {
  const prefix = `[plugin:${pluginName}]`
  return {
    // stdout belongs to the host (JSON-RPC frames, --json output), so status lines go to stderr.
    debug: (...args: unknown[]) => console.error(prefix, ...args),
    info: (...args: unknown[]) => console.error(prefix, ...args),
    warn: (...args: unknown[]) => console.warn(prefix, ...args),
    error: (...args: unknown[]) => console.error(prefix, ...args),
  }
}

/** Everything `setup` is given. Registries are plain arrays: push into them. */
export interface PluginContext {
  /** Subscribe to platform events (read-only view — plugins never `emit`). */
  events: Pick<EventBus<HubEventMap>, 'on' | 'off' | 'once'>
  /** Console wrapper namespaced with the plugin name. */
  logger: PluginLogger
  /** Push MCP tool contributions here during `setup`. */
  mcpTools: McpToolContribution[]
  /** Push CLI command contributions here during `setup`. */
  cliCommands: CliCommandContribution[]
  /** Push declarative command-palette actions here during `setup`. */
  paletteActions: PaletteActionContribution[]
  /** Push declarative dashboard widgets here during `setup`. */
  dashboardWidgets: DashboardWidgetContribution[]
}

/**
 * A declarative command-palette action a plugin contributes. `href` routes
 * in the web app; `hud: 'capture'` opens the Quick-HUD capture tab. Serializable
 * by design — core never imports React, the web layer renders these.
 */
export interface PaletteActionContribution {
  /** Stable id, namespaced by convention `plugin-id.action`. */
  id: string
  label: string
  href?: string
  hud?: 'capture' | 'review' | 'search'
}

/**
 * A declarative dashboard widget a plugin contributes. Static text and/or a
 * `dataHref` API path returning `{ items: [{ title, detail? }] }` — the web
 * layer fetches and renders it as plain text (untrusted content never renders
 * as HTML). React-free so core stays pure.
 */
export interface DashboardWidgetContribution {
  /** Stable id, namespaced by convention `plugin-id.widget`. */
  id: string
  title: string
  description?: string
  /** Where a click on the widget header routes. */
  href?: string
  /** API path returning `{ items: [{ title, detail? }] }` for the widget body. */
  dataHref?: string
}

/** Validated plugin setup function. */
export type PluginSetup = (ctx: PluginContext) => void | Promise<void>

/** What a plugin module exports: metadata + one setup function. */
export interface PluginDefinition {
  /** Unique, stable id — also the dedupe key on repeated loads. */
  name: string
  /** Semver-ish version string, shown in boot logs and help. */
  version: string
  /** Optional one-liner for logs and docs. */
  description?: string
  /** Subscribe to events and push contributions; may be async. */
  setup: PluginSetup
}

/** Runtime zod schema for the plugin boundary (third-party code enters here). */
const pluginDefinitionSchema = z.object({
  name: z.string().min(1, 'plugin name must be a non-empty string'),
  version: z.string().min(1, 'plugin version must be a non-empty string'),
  description: z.string().min(1).optional(),
  setup: z.custom<PluginSetup>((v) => typeof v === 'function', 'plugin setup must be a function'),
})

/**
 * Declare a plugin. Runs the contract validation immediately and returns the
 * definition unchanged, so `export default definePlugin({ … })` fails fast
 * with a precise message when the object is malformed.
 */
export function definePlugin(plugin: PluginDefinition): PluginDefinition {
  const parsed = pluginDefinitionSchema.safeParse(plugin)
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `${i.path.join('.') || 'plugin'}: ${i.message}`)
      .join('; ')
    throw new Error(`definePlugin: invalid plugin definition — ${detail}`)
  }
  return parsed.data
}

/** Validate an unknown candidate (loader path) without throwing on failure. */
export function parsePluginDefinition(candidate: unknown): PluginDefinition | null {
  const parsed = pluginDefinitionSchema.safeParse(candidate)
  return parsed.success ? parsed.data : null
}

/** Human-readable validation errors for an unknown candidate (loader logs). */
export function pluginDefinitionIssues(candidate: unknown): string {
  const parsed = pluginDefinitionSchema.safeParse(candidate)
  if (parsed.success) return ''
  return parsed.error.issues.map((i) => `${i.path.join('.') || 'plugin'}: ${i.message}`).join('; ')
}
