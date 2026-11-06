/**
 * streak-guardian — first-party plugin.
 *
 * Watches `streak.broken` (previously a dead event — nothing emitted it until
 * the M18 event engine) and contributes a `streak` CLI command so the
 * terminal can check the state the plugin saw.
 */
import { definePlugin } from '@learning-hub/core'

let breaksSeen = 0

export default definePlugin({
  name: 'streak-guardian',
  version: '1.0.0',
  description: 'Notices broken streaks (event bus) and adds the `streak` CLI command.',
  setup(ctx) {
    ctx.events.on('streak.broken', () => {
      breaksSeen++
      ctx.logger.warn(`streak broken! (breaks seen by this plugin: ${breaksSeen})`)
    })

    ctx.cliCommands.push({
      name: 'streak',
      description: 'report how many streak breaks this plugin has witnessed',
      run: () => {
        console.log(
          breaksSeen === 0
            ? 'No streak breaks witnessed this session. 🔥'
            : `${breaksSeen} streak break(s) witnessed this session. Tomorrow is day one.`,
        )
      },
    })
  },
})
