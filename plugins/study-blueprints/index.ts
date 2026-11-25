/**
 * study-blueprints: boot-time registration of study blueprints.
 *
 * At host start (web server, MCP, CLI, headless server) this registers the
 * bundled sample methods and every valid `*.json` blueprint found in the
 * blueprints directory (`LEARNING_HUB_BLUEPRINTS_DIR`, default `./blueprints`).
 * Each becomes a `blueprint-<id>` plugin with a palette action, dashboard
 * widget, MCP tool and CLI command.
 *
 * Loaded once at boot: there is no hot reload; restart the host after adding or
 * editing a file. These blueprints live on disk and are separate from the ones
 * installed in the browser on /blueprints (browser storage); the two are not
 * synced. Bad files are skipped with a log line and never stop the host.
 */
import { definePlugin } from '@learning-hub/core'
import { bootBlueprints } from '../../packages/core/src/blueprint'
import { createNodeBlueprintSource } from './node-source'

export default definePlugin({
  name: 'study-blueprints',
  version: '0.1.0',
  description: 'Registers bundled and directory study blueprints at boot.',
  async setup(ctx) {
    try {
      const report = await bootBlueprints(createNodeBlueprintSource(), ctx.logger)
      ctx.logger.info(
        `registered ${report.loaded.length} blueprint(s), skipped ${report.skipped.length}`,
      )
    } catch (err) {
      // Never let blueprint loading stop the host.
      ctx.logger.error('blueprint boot failed, continuing without directory blueprints:', err)
    }
  },
})
