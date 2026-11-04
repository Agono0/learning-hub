/**
 * Loader fixture — a .ts plugin that IMPORTS core's definePlugin, mirroring how
 * real plugins (e.g. plugins/example-echo) are authored.
 */
import { definePlugin } from '../../../../src/plugin.ts'

export default definePlugin({
  name: 'fixture-ts-dep',
  version: '0.3.0',
  description: '.ts fixture that imports definePlugin from core',
  setup(ctx) {
    ctx.cliCommands.push({
      name: 'fixture-ts-dep-command',
      description: 'from the definePlugin fixture',
      run: () => {},
    })
  },
})
