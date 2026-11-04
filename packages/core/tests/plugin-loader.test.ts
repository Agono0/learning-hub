import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import {
  getPluginContributions,
  listPlugins,
  loadPlugins,
  registerPlugin,
  resetPlugins,
} from '../src/plugin-loader'
import { eventBus } from '../src/events'
import { definePlugin, type PluginContext } from '../src/plugin'

const fixtureRoot = fileURLToPath(new URL('./fixtures/plugin-loader-root', import.meta.url))

beforeEach(() => {
  resetPlugins()
  delete (globalThis as { __fixtureJsCtx?: unknown }).__fixtureJsCtx
})

describe('registerPlugin — programmatic / npm-installed plugins', () => {
  it('registers a valid plugin and runs setup with a populated context', async () => {
    const sawEvents = [] as string[]
    const entry = await registerPlugin(
      definePlugin({
        name: 'npm-plugin',
        version: '2.1.0',
        description: 'installed via npm',
        setup(ctx) {
          // the plugin's `events` view IS the shared platform bus
          expect(ctx.events).toBe(eventBus)
          expect(typeof ctx.logger.info).toBe('function')
          expect(Array.isArray(ctx.mcpTools)).toBe(true)
          expect(Array.isArray(ctx.cliCommands)).toBe(true)
          sawEvents.push('setup-ran')
        },
      }),
    )
    expect(sawEvents).toEqual(['setup-ran'])
    expect(entry?.plugin.name).toBe('npm-plugin')
    expect(entry?.source).toBe('programmatic')
    expect(listPlugins().map((p) => p.plugin.name)).toEqual(['npm-plugin'])
  })

  it('async setup is awaited before the plugin is considered registered', async () => {
    const entry = await registerPlugin({
      name: 'async-plugin',
      version: '1.0.0',
      async setup(ctx: PluginContext) {
        await new Promise((resolve) => setTimeout(resolve, 5))
        ctx.cliCommands.push({ name: 'async-command', description: 'delayed', run: () => {} })
      },
    })
    expect(entry).not.toBeNull()
    expect(getPluginContributions().cliCommands.map((c) => c.name)).toEqual(['async-command'])
  })

  it('contributions pushed during setup are aggregated in registration order', async () => {
    await registerPlugin({
      name: 'first', version: '1', setup(ctx: PluginContext) {
        ctx.mcpTools.push({ name: 'tool_one', description: 'one', inputSchema: {}, handler: () => ({ content: [] }) })
      },
    })
    await registerPlugin({
      name: 'second', version: '1', setup(ctx: PluginContext) {
        ctx.mcpTools.push({ name: 'tool_two', description: 'two', inputSchema: {}, handler: () => ({ content: [] }) })
        ctx.cliCommands.push({ name: 'cmd_two', description: 'two', run: () => {} })
      },
    })
    const { mcpTools, cliCommands } = getPluginContributions()
    expect(mcpTools.map((t) => t.name)).toEqual(['tool_one', 'tool_two'])
    expect(cliCommands.map((c) => c.name)).toEqual(['cmd_two'])
  })

  it('a plugin can subscribe to platform events through ctx.events', async () => {
    const seen: { current: number; best: number }[] = []
    const unsubs: (() => void)[] = []
    try {
      await registerPlugin({
        name: 'listener-plugin', version: '1',
        setup(ctx: PluginContext) {
          unsubs.push(ctx.events.on('streak.updated', (p) => seen.push({ current: p.current, best: p.best })))
        },
      })
      eventBus.emit('streak.updated', { current: 4, best: 9 })
      expect(seen).toEqual([{ current: 4, best: 9 }])
    } finally {
      for (const off of unsubs) off()
    }
  })

  it('an invalid candidate is logged and skipped — never thrown', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(await registerPlugin({ name: 'half-plugin', version: '1' })).toBeNull() // no setup
      expect(await registerPlugin(null)).toBeNull()
      expect(await registerPlugin('not a plugin')).toBeNull()
      expect(listPlugins()).toEqual([])
      expect(errorSpy).toHaveBeenCalledTimes(3)
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain('[plugins]')
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('a throwing setup is logged and skipped; later plugins still register', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const failed = await registerPlugin({
        name: 'exploding-plugin', version: '1',
        setup() {
          throw new Error('setup boom')
        },
      })
      expect(failed).toBeNull()

      const healthy = await registerPlugin({ name: 'healthy-plugin', version: '1', setup: () => {} })
      expect(healthy?.plugin.name).toBe('healthy-plugin')
      expect(listPlugins().map((p) => p.plugin.name)).toEqual(['healthy-plugin'])
      expect(String(errorSpy.mock.calls[0]?.[0])).toContain('exploding-plugin')
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('duplicate names are skipped (first registration wins, load is idempotent)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await registerPlugin({ name: 'dup', version: '1.0.0', setup: () => {} })
      const second = await registerPlugin({ name: 'dup', version: '2.0.0', setup: () => {} })
      expect(second).toBeNull()
      expect(listPlugins()).toHaveLength(1)
      expect(listPlugins()[0]?.plugin.version).toBe('1.0.0')
      expect(warnSpy).toHaveBeenCalledTimes(1)
    } finally {
      warnSpy.mockRestore()
    }
  })
})

describe('loadPlugins — directory scanning', () => {
  it('loads .mjs, .ts and definePlugin-based .ts plugins, skipping broken siblings', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const loaded = await loadPlugins([fixtureRoot])
      const names = loaded.map((p) => p.plugin.name)
      expect(names).toContain('fixture-js')
      expect(names).toContain('fixture-ts')
      expect(names).toContain('fixture-ts-dep')
      expect(names).not.toContain('fixture-broken') // import failed → skipped, others fine

      // sources point at the entry files the loader probed (path separators normalized)
      const jsEntry = loaded.find((p) => p.plugin.name === 'fixture-js')
      expect(jsEntry?.source.replace(/\\/g, '/').endsWith('good-js/index.mjs')).toBe(true)
      const tsEntry = loaded.find((p) => p.plugin.name === 'fixture-ts')
      expect(tsEntry?.source.replace(/\\/g, '/').endsWith('good-ts/index.ts')).toBe(true)

      // contributions from the fixtures landed in the registries
      const { mcpTools, cliCommands } = getPluginContributions()
      expect(mcpTools.map((t) => t.name)).toContain('fixture_ts_tool')
      expect(cliCommands.map((c) => c.name)).toEqual(
        expect.arrayContaining(['fixture-js-command', 'fixture-ts-dep-command']),
      )

      // setup received a real ctx (recorded by the .mjs fixture)
      expect((globalThis as { __fixtureJsCtx?: unknown }).__fixtureJsCtx).toBeDefined()

      // the broken import was reported, not thrown
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('broken-import'),
        expect.anything(),
      )
      // a subdirectory without an entry file is silently skipped (group dirs
      // legitimately contain non-plugin folders like node_modules) — no warn
      expect(warnSpy.mock.calls.some((call) => String(call[0]).includes('only-assets'))).toBe(false)
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
    }
  })

  it('loads a single-plugin directory directly', async () => {
    const loaded = await loadPlugins([`${fixtureRoot}/good-js`])
    expect(loaded.map((p) => p.plugin.name)).toEqual(['fixture-js'])
  })

  it('a missing directory is a warning, not a failure', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const loaded = await loadPlugins(['this-dir-does-not-exist-xyz'])
      expect(loaded).toEqual([])
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('does not exist'))
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('re-running loadPlugins does not double-register (dedupe by name)', async () => {
    await loadPlugins([`${fixtureRoot}/good-js`])
    const secondRun = await loadPlugins([`${fixtureRoot}/good-js`])
    expect(secondRun.map((p) => p.plugin.name)).toEqual(['fixture-js'])
    expect(listPlugins()).toHaveLength(1)
    expect(getPluginContributions().cliCommands).toHaveLength(1) // no duplicate contribution
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})
