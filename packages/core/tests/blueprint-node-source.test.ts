import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  BLUEPRINTS_DIR_ENV,
  createNodeBlueprintSource,
  isInside,
  resolveBlueprintDir,
} from '../../../plugins/study-blueprints/node-source'
import studyBlueprints from '../../../plugins/study-blueprints/index'
import { loadPlugins, listPlugins, resetPlugins } from '../src/plugin-loader'
import { resetBlueprintCounters } from '../src/blueprint'

const valid = JSON.stringify({
  schemaVersion: 1,
  id: 'disk-one',
  name: 'Disk One',
  version: '1.0.0',
  summary: 'From disk.',
  phases: [{ id: 'a', title: 'A', kind: 'learn', minutes: 1, instructions: 'Do it.' }],
})

let root: string
let dir: string
let outside: string

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'bp-node-'))
})
afterAll(() => rmSync(root, { recursive: true, force: true }))
beforeEach(() => {
  rmSync(path.join(root, 'bp'), { recursive: true, force: true })
  rmSync(path.join(root, 'outside'), { recursive: true, force: true })
  dir = path.join(root, 'bp')
  outside = path.join(root, 'outside')
  mkdirSync(dir)
  mkdirSync(outside)
  resetPlugins()
  resetBlueprintCounters()
})

describe('resolveBlueprintDir', () => {
  it('defaults to ./blueprints under the working directory', () => {
    expect(resolveBlueprintDir({}, '/srv/hub')).toBe('/srv/hub/blueprints')
    expect(resolveBlueprintDir({ [BLUEPRINTS_DIR_ENV]: '   ' }, '/srv/hub')).toBe(
      '/srv/hub/blueprints',
    )
  })

  it('uses the env var, resolving a relative value against the working directory', () => {
    expect(resolveBlueprintDir({ [BLUEPRINTS_DIR_ENV]: 'data/bps' }, '/srv/hub')).toBe(
      '/srv/hub/data/bps',
    )
    expect(resolveBlueprintDir({ [BLUEPRINTS_DIR_ENV]: '/etc/bps' }, '/srv/hub')).toBe('/etc/bps')
  })

  it('isInside rejects the base itself, siblings and parents', () => {
    expect(isInside('/a/b', '/a/b/c.json')).toBe(true)
    expect(isInside('/a/b', '/a/b')).toBe(false)
    expect(isInside('/a/b', '/a/bc/c.json')).toBe(false)
    expect(isInside('/a/b', '/a/c.json')).toBe(false)
    expect(isInside('/a/b', '/a/b/../c.json')).toBe(false)
  })
})

describe('createNodeBlueprintSource', () => {
  it('lists plain .json files only, sorted', async () => {
    writeFileSync(path.join(dir, 'b.json'), valid)
    writeFileSync(path.join(dir, 'a.JSON'), valid)
    writeFileSync(path.join(dir, 'notes.txt'), 'x')
    mkdirSync(path.join(dir, 'sub.json'))
    const r = await createNodeBlueprintSource(dir).list()
    expect(r.files).toEqual(['a.JSON', 'b.json'])
    expect(r.skipped).toEqual([{ name: 'sub.json', reason: 'not a regular file' }])
  })

  it('a missing directory lists nothing and does not throw', async () => {
    const r = await createNodeBlueprintSource(path.join(root, 'nope')).list()
    expect(r).toEqual({ files: [], skipped: [] })
  })

  it('does not list symlinks, whether they point inside, outside or nowhere', async () => {
    writeFileSync(path.join(outside, 'secret.json'), valid)
    writeFileSync(path.join(dir, 'real.json'), valid)
    symlinkSync(path.join(outside, 'secret.json'), path.join(dir, 'out.json'))
    symlinkSync(path.join(dir, 'real.json'), path.join(dir, 'in.json'))
    symlinkSync(path.join(root, 'missing.json'), path.join(dir, 'dangling.json'))
    const r = await createNodeBlueprintSource(dir).list()
    expect(r.files).toEqual(['real.json'])
    expect(r.skipped.map((s) => s.name).sort()).toEqual(['dangling.json', 'in.json', 'out.json'])
    expect(r.skipped.every((s) => s.reason.includes('symbolic links'))).toBe(true)
  })

  it('reads a valid file', async () => {
    writeFileSync(path.join(dir, 'a.json'), valid)
    expect(await createNodeBlueprintSource(dir).read('a.json', 10_000)).toBe(valid)
  })

  it('refuses to read through a symlink even if the caller names it directly', async () => {
    writeFileSync(path.join(outside, 'secret.json'), valid)
    symlinkSync(path.join(outside, 'secret.json'), path.join(dir, 'out.json'))
    await expect(createNodeBlueprintSource(dir).read('out.json', 10_000)).rejects.toThrow(/escapes/)
  })

  it('refuses path traversal and absolute paths in names', async () => {
    writeFileSync(path.join(outside, 'secret.json'), valid)
    const src = createNodeBlueprintSource(dir)
    for (const name of [
      '../outside/secret.json',
      path.join(outside, 'secret.json'),
      'sub/a.json',
      'a\0.json',
    ])
      await expect(src.read(name, 10_000)).rejects.toThrow(/unsafe file name/)
  })

  it('treats a symlinked base directory as the operator’s choice and uses its real path as the boundary', async () => {
    writeFileSync(path.join(outside, 'x.json'), valid)
    const linkBase = path.join(root, 'linkbase')
    rmSync(linkBase, { force: true })
    symlinkSync(outside, linkBase)
    const src = createNodeBlueprintSource(linkBase)
    // the operator chose this base, so its real path is the boundary
    expect((await src.list()).files).toEqual(['x.json'])
    expect(await src.read('x.json', 10_000)).toBe(valid)
    rmSync(linkBase, { force: true })
  })

  it('refuses oversized files instead of truncating them', async () => {
    writeFileSync(path.join(dir, 'big.json'), 'x'.repeat(5000))
    await expect(createNodeBlueprintSource(dir).read('big.json', 1000)).rejects.toThrow(
      /larger than 1000 bytes/,
    )
  })

  it('reads a file exactly at the limit', async () => {
    writeFileSync(path.join(dir, 'edge.json'), 'x'.repeat(1000))
    expect((await createNodeBlueprintSource(dir).read('edge.json', 1000)).length).toBe(1000)
  })

  it('refuses a directory named like a file', async () => {
    mkdirSync(path.join(dir, 'd.json'))
    await expect(createNodeBlueprintSource(dir).read('d.json', 1000)).rejects.toThrow()
  })
})

describe('study-blueprints plugin at boot', () => {
  const run = async (env: string | undefined) => {
    const prev = process.env[BLUEPRINTS_DIR_ENV]
    if (env === undefined) delete process.env[BLUEPRINTS_DIR_ENV]
    else process.env[BLUEPRINTS_DIR_ENV] = env
    try {
      const pluginDir = path.resolve(__dirname, '../../../plugins/study-blueprints')
      return await loadPlugins([pluginDir])
    } finally {
      if (prev === undefined) delete process.env[BLUEPRINTS_DIR_ENV]
      else process.env[BLUEPRINTS_DIR_ENV] = prev
    }
  }

  it('is a valid plugin definition', () => {
    expect(studyBlueprints.name).toBe('study-blueprints')
  })

  it('registers samples plus good files, skips bad ones, and does not fail the host', async () => {
    writeFileSync(path.join(dir, 'good.json'), valid)
    writeFileSync(path.join(dir, 'bad.json'), '{nope')
    writeFileSync(path.join(outside, 'secret.json'), valid.replace('disk-one', 'leaked'))
    symlinkSync(path.join(outside, 'secret.json'), path.join(dir, 'leak.json'))
    await run(dir)
    const names = listPlugins().map((p) => p.plugin.name)
    expect(names).toContain('study-blueprints')
    expect(names).toContain('blueprint-retrieval-sprint')
    expect(names).toContain('blueprint-disk-one')
    expect(names).not.toContain('blueprint-leaked')
  })

  it('still starts when the directory does not exist', async () => {
    await run(path.join(root, 'does-not-exist'))
    expect(listPlugins().map((p) => p.plugin.name)).toContain('blueprint-feynman-loop')
  })

  it('loads only at boot: a file added later is not picked up until the next boot', async () => {
    await run(dir)
    writeFileSync(path.join(dir, 'late.json'), valid)
    expect(listPlugins().map((p) => p.plugin.name)).not.toContain('blueprint-disk-one')
    resetPlugins()
    resetBlueprintCounters()
    await run(dir)
    expect(listPlugins().map((p) => p.plugin.name)).toContain('blueprint-disk-one')
  })
})

describe('client/server boundary', () => {
  const coreDir = path.resolve(__dirname, '../src/blueprint')
  const importsOf = (file: string) =>
    [...readFileSync(file, 'utf8').matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map(
      (m) => m[1]!,
    )

  it('core blueprint modules import no Node built-ins and nothing from plugins/', () => {
    const files = readdirSync(coreDir).filter((f) => f.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(5)
    for (const f of files)
      for (const spec of importsOf(path.join(coreDir, f))) {
        expect(spec, `${f} imports ${spec}`).not.toMatch(/^node:/)
        expect(spec, `${f} imports ${spec}`).not.toMatch(/plugins\//)
        expect(spec, `${f} imports ${spec}`).not.toMatch(/^(fs|path|os|child_process)$/)
      }
  })

  it('the web studio imports no Node built-ins and nothing from plugins/', () => {
    const studio = path.resolve(
      __dirname,
      '../../../apps/web/src/components/blueprints/BlueprintStudio.tsx',
    )
    for (const spec of importsOf(studio)) {
      expect(spec).not.toMatch(/^node:/)
      expect(spec).not.toMatch(/plugins\//)
    }
  })
})
