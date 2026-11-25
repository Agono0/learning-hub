import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DIRECTORY_LIMITS,
  SAMPLE_BLUEPRINTS,
  bootBlueprints,
  readBlueprintDirectory,
  resetBlueprintCounters,
  type BlueprintFileSource,
} from '../src/blueprint'
import { listPlugins, registerPlugin, resetPlugins } from '../src/plugin-loader'
import { definePlugin } from '../src/plugin'

const bp = (id: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    schemaVersion: 1,
    id,
    name: id,
    version: '1.0.0',
    summary: 'A test blueprint.',
    phases: [{ id: 'a', title: 'A', kind: 'learn', minutes: 1, instructions: 'Do it.' }],
    ...extra,
  })

function fake(
  files: Record<string, string | Error>,
  skipped: { name: string; reason: string }[] = [],
): BlueprintFileSource & { reads: string[] } {
  const reads: string[] = []
  return {
    label: 'memory://test',
    reads,
    async list() {
      return { files: Object.keys(files), skipped }
    },
    async read(name) {
      reads.push(name)
      const v = files[name]
      if (v instanceof Error) throw v
      return v!
    },
  }
}

const quiet = { info: () => undefined, warn: () => undefined }

beforeEach(() => {
  resetPlugins()
  resetBlueprintCounters()
})
afterEach(() => {
  resetPlugins()
  resetBlueprintCounters()
})

describe('readBlueprintDirectory', () => {
  it('reads valid files in sorted order', async () => {
    const r = await readBlueprintDirectory(fake({ 'b.json': bp('bb'), 'a.json': bp('aa') }))
    expect(r.blueprints.map((x) => x.file)).toEqual(['a.json', 'b.json'])
    expect(r.skipped).toEqual([])
  })

  it('skips invalid JSON, invalid blueprints and unreadable files with a reason, and keeps going', async () => {
    const r = await readBlueprintDirectory(
      fake({
        'a.json': '{not json',
        'b.json': JSON.stringify({ schemaVersion: 1 }),
        'c.json': new Error('EACCES'),
        'd.json': bp('good'),
        'e.json': JSON.stringify({ ...JSON.parse(bp('evil')), exec: 'rm -rf /' }),
      }),
    )
    expect(r.blueprints.map((x) => x.blueprint.id)).toEqual(['good'])
    const reasons = Object.fromEntries(r.skipped.map((s) => [s.file, s.reason]))
    expect(reasons['a.json']).toBe('not valid JSON')
    expect(reasons['b.json']).toContain('invalid blueprint')
    expect(reasons['c.json']).toContain('EACCES')
    expect(reasons['e.json']).toContain('invalid blueprint')
  })

  it('passes through entries the source refused (symlinks and so on)', async () => {
    const r = await readBlueprintDirectory(
      fake({}, [{ name: 'link.json', reason: 'symbolic links are not followed' }]),
    )
    expect(r.skipped).toEqual([{ file: 'link.json', reason: 'symbolic links are not followed' }])
  })

  it('stops reading after the file-count limit and does not even read the rest', async () => {
    const files: Record<string, string> = {}
    for (let i = 0; i < DIRECTORY_LIMITS.maxFiles + 5; i++)
      files[`f${String(i).padStart(3, '0')}.json`] = bp(`id-${i}`)
    const src = fake(files)
    const r = await readBlueprintDirectory(src)
    expect(r.blueprints).toHaveLength(DIRECTORY_LIMITS.maxFiles)
    expect(r.skipped).toHaveLength(5)
    expect(src.reads).toHaveLength(DIRECTORY_LIMITS.maxFiles)
  })

  it('rejects a file over the per-file limit even if the source did not', async () => {
    const r = await readBlueprintDirectory(
      fake({ 'big.json': bp('big', { summary: 'x'.repeat(200) }) }),
      { maxFileBytes: 100 },
    )
    expect(r.blueprints).toEqual([])
    expect(r.skipped[0]!.reason).toContain('larger than 100 bytes')
  })

  it('counts bytes, not characters, and enforces the total limit', async () => {
    const one = bp('one')
    const bytes = new TextEncoder().encode(one).length
    const r = await readBlueprintDirectory(
      fake({ 'a.json': bp('one'), 'b.json': bp('two'), 'c.json': bp('thr') }),
      {
        maxTotalBytes: bytes * 2 + 1,
      },
    )
    expect(r.blueprints).toHaveLength(2)
    expect(r.skipped[0]!.reason).toContain('total size limit')
  })

  it('never throws when listing fails', async () => {
    const src: BlueprintFileSource = {
      label: 'x',
      async list() {
        throw new Error('EIO')
      },
      async read() {
        return ''
      },
    }
    const r = await readBlueprintDirectory(src)
    expect(r.blueprints).toEqual([])
    expect(r.skipped[0]!.reason).toContain('EIO')
  })

  it('does not evaluate anything: strings that look like code stay data', async () => {
    const g = globalThis as unknown as { __pwned?: boolean }
    const r = await readBlueprintDirectory(
      fake({ 'a.json': bp('x', { summary: '"); globalThis.__pwned = true; ("' }) }),
    )
    expect(r.blueprints[0]!.blueprint.summary).toContain('__pwned')
    expect(g.__pwned).toBeUndefined()
  })
})

describe('bootBlueprints', () => {
  it('registers the samples even without a directory', async () => {
    const report = await bootBlueprints(null, quiet)
    expect(report.loaded).toEqual(SAMPLE_BLUEPRINTS.map((b) => b.id))
    expect(listPlugins().map((p) => p.plugin.name)).toContain('blueprint-feynman-loop')
  })

  it('registers valid directory blueprints as plugins with contributions', async () => {
    const report = await bootBlueprints(fake({ 'mine.json': bp('mine') }), quiet)
    expect(report.loaded).toContain('mine')
    const mine = listPlugins().find((p) => p.plugin.name === 'blueprint-mine')!
    expect(mine.cliCommands).toHaveLength(1)
    expect(mine.mcpTools[0]!.name).toBe('blueprint_mine_plan')
  })

  it('cannot override a sample', async () => {
    const report = await bootBlueprints(
      fake({ 'x.json': bp('feynman-loop', { summary: 'hijacked' }) }),
      quiet,
    )
    expect(report.skipped[0]!.reason).toContain('already in use')
    const feyn = listPlugins().find((p) => p.plugin.name === 'blueprint-feynman-loop')!
    expect(feyn.plugin.description).not.toBe('hijacked')
  })

  it('cannot override another directory blueprint or an existing plugin of the same name', async () => {
    await registerPlugin(
      definePlugin({ name: 'blueprint-taken', version: '1.0.0', setup: () => undefined }),
    )
    const report = await bootBlueprints(
      fake({
        'a.json': bp('dup'),
        'b.json': bp('dup', { summary: 'second' }),
        'c.json': bp('taken'),
      }),
      quiet,
    )
    expect(report.loaded).toContain('dup')
    expect(report.loaded).not.toContain('taken')
    expect(report.skipped.map((s) => s.file).sort()).toEqual(['b.json', 'c.json'])
    expect(listPlugins().find((p) => p.plugin.name === 'blueprint-dup')!.plugin.description).toBe(
      'A test blueprint.',
    )
    expect(
      listPlugins().find((p) => p.plugin.name === 'blueprint-taken')!.plugin.description,
    ).toBeUndefined()
  })

  it('a blueprint id cannot spoof a non-blueprint plugin name', async () => {
    await registerPlugin(
      definePlugin({ name: 'card-linter', version: '1.0.0', setup: () => undefined }),
    )
    const report = await bootBlueprints(fake({ 'a.json': bp('card-linter') }), quiet)
    // registered as blueprint-card-linter, never as card-linter
    expect(report.loaded).toContain('card-linter')
    expect(listPlugins().filter((p) => p.plugin.name === 'card-linter')).toHaveLength(1)
    expect(listPlugins().some((p) => p.plugin.name === 'blueprint-card-linter')).toBe(true)
  })

  it('never throws, even when the source blows up on every call', async () => {
    const src: BlueprintFileSource = {
      label: 'bad',
      async list() {
        throw new Error('boom')
      },
      async read() {
        throw new Error('boom')
      },
    }
    const report = await bootBlueprints(src, quiet)
    expect(report.loaded).toHaveLength(3)
    expect(report.skipped[0]!.reason).toContain('boom')
  })

  it('logs one line per skipped file', async () => {
    const warns: string[] = []
    await bootBlueprints(fake({ 'bad.json': '{x' }), {
      info: () => undefined,
      warn: (m: string) => void warns.push(m),
    })
    expect(warns).toEqual(['[blueprints] skipped bad.json: not valid JSON'])
  })
})
