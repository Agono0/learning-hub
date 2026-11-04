/**
 * Loader fixture — TypeScript plugin module, erasable-syntax only, so native
 * Node type-stripping (the production tsx path mirrors this) can execute it
 * without any build step.
 */
interface FixtureArgs {
  echo: string
}

export default {
  name: 'fixture-ts',
  version: '0.2.0',
  description: 'plain .ts fixture',
  setup(ctx) {
    ctx.mcpTools.push({
      name: 'fixture_ts_tool',
      description: 'from the .ts fixture',
      inputSchema: { echo: { description: 'text to echo' } },
      handler: (args: FixtureArgs) => ({ content: [{ type: 'text' as const, text: args.echo }] }),
    })
  },
}
