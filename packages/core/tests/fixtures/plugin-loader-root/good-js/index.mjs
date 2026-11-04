/**
 * Loader fixture — plain-JS plugin module (no dependencies, default export).
 * Records the ctx it received on globalThis so the test can assert setup ran.
 */
export default {
  name: 'fixture-js',
  version: '1.0.0',
  description: 'plain .mjs fixture',
  setup(ctx) {
    globalThis.__fixtureJsCtx = ctx
    ctx.cliCommands.push({
      name: 'fixture-js-command',
      description: 'from the .mjs fixture',
      run: () => {},
    })
  },
}
