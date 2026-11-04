/**
 * Learning HUB — example plugin (`plugins/example-echo`).
 *
 * Proves the whole plugin chain end to end with the smallest possible surface:
 *
 * 1. It subscribes to the platform event bus: every completed review is logged
 *    through the plugin's namespaced logger (`[plugin:example-echo] …`).
 * 2. It contributes one CLI command: `learning-hub hub-echo hello world`
 *    prints `hello world` — so after `loadPlugins(['plugins'])` the terminal
 *    app literally grows a new command from this folder.
 *
 * Copy this folder as a starting point for your own plugin — see
 * docs/plugins.md for the full contract (events, MCP tools, distribution).
 */
import { definePlugin } from '@learning-hub/core'

export default definePlugin({
  name: 'example-echo',
  version: '0.1.0',
  description: 'Logs completed reviews and adds the `hub-echo` CLI command.',
  setup(ctx) {
    // React to platform events (typed payloads, namespaced logger).
    ctx.events.on('review.completed', ({ cardId, grade, xpEarned }) => {
      ctx.logger.info(`review completed — card #${cardId}, grade ${grade}, +${xpEarned} XP`)
    })

    // Contribute a CLI command: run with `learning-hub hub-echo hello world`.
    ctx.cliCommands.push({
      name: 'hub-echo',
      description: 'echo the given arguments back (example plugin)',
      run: (args) => {
        console.log(args.length > 0 ? args.join(' ') : '(nothing to echo)')
      },
    })
  },
})
