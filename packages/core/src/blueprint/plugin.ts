/**
 * Bridge from a blueprint to a regular Learning HUB plugin.
 *
 * Installing a blueprint registers a plugin through the existing loader
 * (`registerPlugin`), so a blueprint shows up exactly like a hand-written one:
 * a command-palette action, a dashboard widget, an MCP tool, a CLI command and
 * event listeners that feed its counters. Blueprints never run code of their
 * own; the plugin is generated from validated data.
 */
import { definePlugin, type PluginDefinition } from '../plugin'
import { registerPlugin, type RegisteredPlugin } from '../plugin-loader'
import type { Blueprint } from './schema'
import { defaultParams, estimateMinutes, validateBlueprint, type BlueprintIssue } from './validate'

/** Prefix for generated plugin names. */
export const BLUEPRINT_PLUGIN_PREFIX = 'blueprint-'

/** Event counters per installed blueprint id (process-wide, like the plugin registry). */
const counters = new Map<string, Record<string, number>>()

/** Current event counters for an installed blueprint (empty object when none). */
export function getBlueprintCounters(blueprintId: string): Record<string, number> {
  return { ...(counters.get(blueprintId) ?? {}) }
}

/** Forget all counters (tests, hot reload). */
export function resetBlueprintCounters(): void {
  counters.clear()
}

/** Plain-text plan, shared by the MCP tool and the CLI command. */
export function describeBlueprint(blueprint: Blueprint): string {
  const params = defaultParams(blueprint)
  const lines = [
    `${blueprint.name} v${blueprint.version} (~${estimateMinutes(blueprint, params)} min)`,
    blueprint.summary,
    ...blueprint.phases.map((p, i) => `${i + 1}. [${p.kind}] ${p.title}: ${p.instructions}`),
  ]
  const c = getBlueprintCounters(blueprint.id)
  for (const t of blueprint.triggers) lines.push(`${t.label ?? t.counter}: ${c[t.counter] ?? 0}`)
  return lines.join('\n')
}

/** Build the plugin definition for a validated blueprint. */
export function blueprintToPlugin(blueprint: Blueprint): PluginDefinition {
  const pluginName = `${BLUEPRINT_PLUGIN_PREFIX}${blueprint.id}`
  const toolName = `blueprint_${blueprint.id.replace(/-/g, '_')}_plan`
  return definePlugin({
    name: pluginName,
    version: blueprint.version,
    description: blueprint.summary,
    setup(ctx) {
      const own: Record<string, number> = {}
      for (const t of blueprint.triggers) own[t.counter] = 0
      counters.set(blueprint.id, own)

      for (const trigger of blueprint.triggers) {
        ctx.events.on(trigger.event, () => {
          own[trigger.counter] = (own[trigger.counter] ?? 0) + 1
        })
      }

      const href = `/blueprints?open=${encodeURIComponent(blueprint.id)}`
      ctx.paletteActions.push({
        id: `${pluginName}.open`,
        label: `Study method: ${blueprint.name}`,
        href,
      })
      ctx.dashboardWidgets.push({
        id: `${pluginName}.widget`,
        title: blueprint.name,
        description: blueprint.summary,
        href,
      })
      ctx.mcpTools.push({
        name: toolName,
        description: `Plan for the "${blueprint.name}" study method.`,
        inputSchema: {},
        handler: () => ({ content: [{ type: 'text', text: describeBlueprint(blueprint) }] }),
      })
      ctx.cliCommands.push({
        name: pluginName,
        description: `show the "${blueprint.name}" study plan`,
        run: () => console.log(describeBlueprint(blueprint)),
      })
    },
  })
}

/** Result of {@link installBlueprint}. */
export type InstallResult =
  | { ok: true; blueprint: Blueprint; registered: RegisteredPlugin; warnings: BlueprintIssue[] }
  | { ok: false; issues: BlueprintIssue[] }

/**
 * Validate and register a blueprint as a plugin. A blueprint whose id is
 * already installed is reported as an issue (the loader dedupes by name).
 */
export async function installBlueprint(input: unknown): Promise<InstallResult> {
  const res = validateBlueprint(input)
  if (!res.ok) return res
  const registered = await registerPlugin(blueprintToPlugin(res.blueprint), 'blueprint')
  if (!registered)
    return {
      ok: false,
      issues: [{ path: 'id', message: `blueprint "${res.blueprint.id}" is already installed` }],
    }
  return { ok: true, blueprint: res.blueprint, registered, warnings: res.warnings }
}
