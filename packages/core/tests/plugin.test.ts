import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createPluginLogger,
  definePlugin,
  parsePluginDefinition,
  pluginDefinitionIssues,
  type PluginContext,
} from '../src/plugin'

const noop = () => {}

function makeCtx(): PluginContext {
  return {
    events: {
      on: () => noop,
      off: () => {},
      once: () => noop,
    },
    logger: createPluginLogger('test'),
    mcpTools: [],
    cliCommands: [],
    paletteActions: [],
    dashboardWidgets: [],
  }
}

describe('definePlugin — contract validation', () => {
  it('accepts a well-formed definition and returns it (default-exportable)', () => {
    const setup = vi.fn()
    const plugin = definePlugin({
      name: 'my-plugin',
      version: '1.2.3',
      description: 'does things',
      setup,
    })
    expect(plugin.name).toBe('my-plugin')
    expect(plugin.version).toBe('1.2.3')
    expect(plugin.description).toBe('does things')
    expect(plugin.setup).toBe(setup)
  })

  it('description is optional', () => {
    const plugin = definePlugin({ name: 'my-plugin', version: '0.0.1', setup: noop })
    expect(plugin.description).toBeUndefined()
  })

  it.each([
    ['missing name', { version: '1.0.0', setup: noop }],
    ['empty name', { name: '', version: '1.0.0', setup: noop }],
    ['missing version', { name: 'p', setup: noop }],
    ['empty version', { name: 'p', version: '', setup: noop }],
    ['setup not a function', { name: 'p', version: '1.0.0', setup: 'nope' }],
    ['not an object at all', null],
  ])('throws a descriptive error for: %s', (_label, candidate) => {
    expect(() => definePlugin(candidate as never)).toThrow(
      /definePlugin: invalid plugin definition/,
    )
  })

  it('names the offending field in the error', () => {
    expect(() => definePlugin({ name: '', version: '1.0.0', setup: noop })).toThrow(/name/)
    expect(() => definePlugin({ name: 'p', version: '1.0.0', setup: 42 as never })).toThrow(/setup/)
  })
})

describe('parsePluginDefinition / pluginDefinitionIssues — loader-side validation', () => {
  it('returns the definition for a valid plain object', () => {
    const parsed = parsePluginDefinition({ name: 'p', version: '1', setup: noop })
    expect(parsed?.name).toBe('p')
    expect(pluginDefinitionIssues({ name: 'p', version: '1', setup: noop })).toBe('')
  })

  it('returns null (never throws) for garbage', () => {
    expect(parsePluginDefinition(null)).toBeNull()
    expect(parsePluginDefinition(undefined)).toBeNull()
    expect(parsePluginDefinition(42)).toBeNull()
    expect(parsePluginDefinition({ name: 'p' })).toBeNull() // version + setup missing
    expect(
      parsePluginDefinition({ name: 'p', version: '1', setup: noop, extra: true }),
    ).not.toBeNull()
  })

  it('pluginDefinitionIssues lists the problems for garbage', () => {
    const issues = pluginDefinitionIssues({ version: '1' })
    expect(issues).toContain('name')
    expect(issues).toContain('setup')
  })
})

describe('createPluginLogger — namespaced console wrapper', () => {
  afterEach(() => vi.restoreAllMocks())

  it('prefixes every level with [plugin:<name>] and keeps stdout free', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})

    const logger = createPluginLogger('echo')
    logger.info('hello', 1)
    logger.warn('careful')
    logger.error('boom', new Error('x'))
    logger.debug('whisper')

    // info and debug go to stderr (console.error): stdout belongs to the host protocol.
    expect(error).toHaveBeenCalledWith('[plugin:echo]', 'hello', 1)
    expect(warn).toHaveBeenCalledWith('[plugin:echo]', 'careful')
    expect(error).toHaveBeenCalledWith('[plugin:echo]', 'boom', expect.any(Error))
    expect(error).toHaveBeenCalledWith('[plugin:echo]', 'whisper')
    expect(info).not.toHaveBeenCalled()
    expect(debug).not.toHaveBeenCalled()
  })
})

describe('plugin context shape', () => {
  it('exposes events (on/off/once), logger and the two registries', async () => {
    const plugin = definePlugin({
      name: 'shape-check',
      version: '1.0.0',
      setup(ctx) {
        expect(typeof ctx.events.on).toBe('function')
        expect(typeof ctx.events.off).toBe('function')
        expect(typeof ctx.events.once).toBe('function')
        expect(typeof ctx.logger.info).toBe('function')
        expect(Array.isArray(ctx.mcpTools)).toBe(true)
        expect(Array.isArray(ctx.cliCommands)).toBe(true)
      },
    })
    await expect(Promise.resolve(plugin.setup(makeCtx()))).resolves.toBeUndefined()
  })
})
