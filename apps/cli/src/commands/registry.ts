/**
 * CLI command registry types — the shape every dispatchable command
 * (built-in or plugin contribution) satisfies, plus the help-line renderer.
 * Built-in command groups live in ./commands/*.ts and are concatenated in
 * ../index.ts next to the plugin contributions.
 */
import type { CliCommandContribution } from '@learning-hub/core'

/** One dispatchable command: a built-in or a plugin's CliCommandContribution. */
export interface RegisteredCommand extends CliCommandContribution {
  /** Extra usage fragment rendered after the name (e.g. `[n]` → `review [n]`). */
  usage?: string
}

/** Help line: `capture "text"  quick-capture an idea` — name+usage at col 16. */
export function helpLine(command: RegisteredCommand): string {
  const label = command.usage ? `${command.name} ${command.usage}` : command.name
  return `${label.padEnd(20)}${command.description}`
}
