import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { unzipSync } from 'fflate'
import { afterAll, describe, expect, it } from 'vitest'
import { updateManifestSchema } from '../src/update/index.js'
import {
  buildPatchBundle,
  derivePatchBaseUrl,
  diffManifests,
  generateManifest,
  hashTree,
  main,
  parseArgs,
  sha256Hex,
} from '../../../scripts/update-manifest.mjs'

const FULL_URL = 'https://releases.example.com/download/nightly/setup.exe'
const PATCH_BASE = 'https://releases.example.com/download/nightly/'

/** Roots created during this run; removed when tests finish. */
const tempRoots: string[] = []
afterAll(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
})

/** Create a fresh temp dir, register it for cleanup, return its absolute path. */
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'update-manifest-'))
  tempRoots.push(dir)
  return dir
}

/** Write text files (parent dirs auto-created) under `root`. */
async function writeFiles(root: string, files: Record<string, string | Uint8Array>) {
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel)
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, content)
  }
}

/** Build an export dir with two files; returns { dir, manifestV1 } basis. */
async function fixtureExport(version: string) {
  const dir = await tempDir()
  await writeFiles(dir, {
    'index.html': `<html>v=${version}</html>`,
    '_next/static/app.js': `console.log("${version}")`,
  })
  return dir
}

/** Minimal valid manifest object for a dir hash (v1 of a chain). */
async function manifestFor(dir: string, version: string) {
  const { manifest } = await generateManifest({
    dir,
    version,
    buildSha: 'abc1234567',
    minNativeVersion: '0.5.2',
    fullPackageUrl: FULL_URL,
    createdAt: '2026-11-22T03:14:15.926Z',
  })
  return manifest
}

describe('update-manifest script (O1-07)', () => {
  describe('hashTree', () => {
    it('hashes nested files with lowercase sha256, sizes and sorted paths', async () => {
      const dir = await tempDir()
      const body = 'hello OTA'
      await writeFiles(dir, {
        'b/second.txt': body,
        'a first.txt': 'a',
        'c/nested/deep.bin': new Uint8Array([1, 2, 3, 4, 255]),
      })
      const files = await hashTree(dir)
      expect(files.map((f) => f.path)).toEqual(['a first.txt', 'b/second.txt', 'c/nested/deep.bin'])
      const second = files[1]
      expect(second.sha256).toBe(createHash('sha256').update(body).digest('hex'))
      expect(second.sha256).toMatch(/^[0-9a-f]{64}$/)
      expect(second.size).toBe(body.length)
    })

    it('throws on an empty export dir', async () => {
      const dir = await tempDir()
      await expect(hashTree(dir)).rejects.toThrow(/empty manifest/i)
    })
  })

  describe('generateManifest', () => {
    it('produces a schema-valid manifest for a fresh export', async () => {
      const dir = await fixtureExport('v1')
      const { manifest, patchArtifacts } = await generateManifest({
        dir,
        version: '20261122-abc1234',
        buildSha: 'abc1234567',
        minNativeVersion: '0.5.2',
        fullPackageUrl: FULL_URL,
        createdAt: '2026-11-22T03:14:15.926Z',
      })
      expect(() => updateManifestSchema.parse(manifest)).not.toThrow()
      expect(manifest.manifestVersion).toBe(1)
      expect(manifest.channel).toBe('nightly')
      expect(manifest.requiresNative).toBe(false)
      expect(manifest.files).toHaveLength(2)
      expect(manifest.patches).toEqual([])
      expect(patchArtifacts).toEqual([])
      expect(manifest.createdAt).toBe('2026-11-22T03:14:15.926Z')
    })

    it('emits a patch bundle with only added/changed files vs the previous manifest', async () => {
      const dirV1 = await fixtureExport('v1')
      const manifestV1 = await manifestFor(dirV1, '20261121-old1')
      const manifestPath = path.join(await tempDir(), 'manifest-1.json')
      await writeFile(manifestPath, JSON.stringify(manifestV1))

      // New build: index.html changed, app.js unchanged, changelog added.
      const dirV2 = await tempDir()
      await writeFiles(dirV2, {
        'index.html': '<html>v=v2 CHANGED</html>',
        '_next/static/app.js': 'console.log("v1")', // identical to v1
        'CHANGELOG.md': '## v2\n- fixes',
      })

      const { manifest, patchArtifacts } = await generateManifest({
        dir: dirV2,
        version: '20261122-new1',
        buildSha: 'def7654321',
        minNativeVersion: '0.5.2',
        fullPackageUrl: FULL_URL,
        prev: [manifestPath],
        createdAt: '2026-11-22T10:00:00.000Z',
      })

      expect(manifest.patches).toHaveLength(1)
      const patch = manifest.patches[0]
      expect(patch.fromVersion).toBe('20261121-old1')
      expect(patch.url).toBe(`${PATCH_BASE}patch-20261121-old1-20261122-new1.zip`)
      expect(patch.size).toBe(patchArtifacts[0].bytes.length)
      expect(patch.sha256).toBe(sha256Hex(patchArtifacts[0].bytes))
      expect(() => updateManifestSchema.parse(manifest)).not.toThrow()

      // The bundle contains the changed + added files (with the NEW contents), not unchanged ones.
      const unzipped = unzipSync(patchArtifacts[0].bytes)
      const names = Object.keys(unzipped).sort()
      expect(names).toEqual(['CHANGELOG.md', 'index.html'])
      expect(Buffer.from(unzipped['index.html']).toString()).toContain('CHANGED')
      expect(Buffer.from(unzipped['CHANGELOG.md']).toString()).toContain('## v2')
    })

    it('caps patches at 5 previous manifests (O1-19 chain)', async () => {
      const dir = await fixtureExport('final')
      const prevPaths: string[] = []
      for (let i = 0; i < 7; i++) {
        const prevDir = await fixtureExport(`build-${i}`)
        const manifest = await manifestFor(prevDir, `2026111${i}-old${i}`)
        const p = path.join(await tempDir(), `manifest-${i}.json`)
        await writeFile(p, JSON.stringify(manifest))
        prevPaths.push(p)
      }
      const { manifest } = await generateManifest({
        dir,
        version: '20261122-new7',
        buildSha: 'abc1234567',
        minNativeVersion: '0.5.2',
        fullPackageUrl: FULL_URL,
        prev: prevPaths,
      })
      expect(manifest.patches).toHaveLength(5)
      // Newest-first: the first 5 --prev manifests win.
      expect(manifest.patches.map((p) => p.fromVersion)).toEqual([
        '20261110-old0',
        '20261111-old1',
        '20261112-old2',
        '20261113-old3',
        '20261114-old4',
      ])
    })

    it('is deterministic for identical input (same createdAt, files, sorted hashes)', async () => {
      const a = await fixtureExport('same')
      const b = await fixtureExport('same')
      const opts = {
        version: '20261122-abc1234',
        buildSha: 'abc1234567',
        minNativeVersion: '0.5.2',
        fullPackageUrl: FULL_URL,
        createdAt: '2026-11-22T03:14:15.926Z',
      }
      const first = await generateManifest({ dir: a, ...opts })
      const second = await generateManifest({ dir: b, ...opts })
      expect(second.manifest).toEqual(first.manifest)
    })

    it('rejects non-https URLs, unknown channels and empty builds', async () => {
      const dir = await fixtureExport('x')
      await expect(
        generateManifest({
          dir,
          version: 'v',
          buildSha: 'abc1234567',
          minNativeVersion: '0.5.2',
          fullPackageUrl: 'http://insecure.example.com/setup.exe',
        }),
      ).rejects.toThrow(/https/i)

      await expect(
        generateManifest({
          dir,
          version: 'v',
          buildSha: 'abc1234567',
          minNativeVersion: '0.5.2',
          channel: 'canary' as never,
          fullPackageUrl: FULL_URL,
        }),
      ).rejects.toThrow(/channel/i)

      const empty = await tempDir()
      await expect(
        generateManifest({
          dir: empty,
          version: 'v',
          buildSha: 'abc1234567',
          minNativeVersion: '0.5.2',
          fullPackageUrl: FULL_URL,
        }),
      ).rejects.toThrow(/no files/i)
    })
  })

  describe('buildPatchBundle + diffManifests', () => {
    it('rejects paths that escape the export dir (hostile prev manifest)', async () => {
      const dir = await tempDir()
      await writeFiles(dir, { 'safe.txt': 'ok' })
      await expect(
        buildPatchBundle(dir, [{ path: '../escape.txt', sha256: 'a'.repeat(64), size: 1 }]),
      ).rejects.toThrow(/escapes/i)
    })

    it('diffManifests flags added and changed files, ignores deletions', () => {
      const prev = {
        manifestVersion: 1 as const,
        channel: 'nightly',
        version: 'old',
        buildSha: 'abc1234567',
        createdAt: '2026-11-21T00:00:00.000Z',
        minNativeVersion: '0.5.2',
        requiresNative: false,
        files: [
          { path: 'same.js', sha256: 'b'.repeat(64), size: 1 },
          { path: 'changed.js', sha256: 'c'.repeat(64), size: 2 },
          { path: 'deleted.js', sha256: 'd'.repeat(64), size: 3 },
        ],
        patches: [],
        fullPackageUrl: FULL_URL,
      }
      const next = [
        { path: 'same.js', sha256: 'b'.repeat(64), size: 1 },
        { path: 'changed.js', sha256: 'e'.repeat(64), size: 2 },
        { path: 'added.js', sha256: 'f'.repeat(64), size: 4 },
      ]
      expect(diffManifests(prev, next).map((f) => f.path)).toEqual(['changed.js', 'added.js'])
    })
  })

  describe('parseArgs', () => {
    it('parses kebab flags, =values, repeated --prev and boolean forms', () => {
      const opts = parseArgs([
        '--dir',
        'apps/web/.next-tauri',
        '--out=dist/manifest.json',
        '--version',
        '20261122-abc1234',
        '--build-sha',
        'abc1234567',
        '--min-native-version',
        '0.5.2',
        '--requires-native=false',
        '--full-package-url',
        FULL_URL,
        '--prev',
        'a.json',
        '--prev',
        'b.json',
      ])
      expect(opts.dir).toBe('apps/web/.next-tauri')
      expect(opts.out).toBe('dist/manifest.json')
      expect(opts.requiresNative).toBe(false)
      expect(opts.prev).toEqual(['a.json', 'b.json'])
      expect(opts.channel).toBe('nightly')

      expect(parseArgs(['--requires-native', '--dir', 'd']).requiresNative).toBe(true)
      expect(parseArgs(['--requires-native', 'true', '--dir', 'd']).requiresNative).toBe(true)
    })

    it('throws on missing options, bad channels, non-https urls and bad build sha', () => {
      const base = [
        '--dir',
        'd',
        '--out',
        'o.json',
        '--version',
        'v',
        '--min-native-version',
        '0.5.2',
      ]
      expect(() => parseArgs([...base, '--full-package-url', FULL_URL])).toThrow(/build-sha/i)
      expect(() =>
        parseArgs([...base, '--build-sha', 'ab', '--full-package-url', FULL_URL]),
      ).toThrow(/build-sha/i)
      expect(() =>
        parseArgs([...base, '--build-sha', 'abc1234567', '--full-package-url', 'http://x/y']),
      ).toThrow(/https/i)
      expect(() =>
        parseArgs([
          ...base,
          '--build-sha',
          'abc1234567',
          '--full-package-url',
          FULL_URL,
          '--channel',
          'canary',
        ]),
      ).toThrow(/channel/i)
      expect(() => parseArgs(['--nope'])).toThrow(/unknown/i)
      expect(() =>
        parseArgs([
          ...base,
          '--build-sha',
          'abc1234567',
          '--full-package-url',
          FULL_URL,
          '--patch-base-url',
          'http://x/',
        ]),
      ).toThrow(/https/i)
    })
  })

  describe('main (end-to-end)', () => {
    it('writes manifest.json + patch zips that parse back to the schema', async () => {
      const work = await tempDir()
      const dirV1 = await fixtureExport('v1')
      const manifestV1 = await manifestFor(dirV1, '20261121-old1')
      const prevPath = path.join(work, 'prev', 'manifest.json')
      await mkdir(path.dirname(prevPath), { recursive: true })
      await writeFile(prevPath, JSON.stringify(manifestV1))

      const dirV2 = await tempDir()
      await writeFiles(dirV2, {
        'index.html': '<html>v2</html>',
        '_next/static/app.js': 'console.log("v1")',
      })
      const outPath = path.join(work, 'out', 'manifest.json')

      const { manifest, outPath: written } = await main([
        '--dir',
        dirV2,
        '--out',
        outPath,
        '--version',
        '20261122-new1',
        '--build-sha',
        'def7654321',
        '--min-native-version',
        '0.5.2',
        '--full-package-url',
        FULL_URL,
        '--prev',
        prevPath,
      ])
      expect(written).toBe(path.resolve(outPath))

      const onDisk = JSON.parse(await readFile(written, 'utf8'))
      expect(() => updateManifestSchema.parse(onDisk)).not.toThrow()
      expect(onDisk).toEqual(manifest)

      const zipPath = path.join(path.dirname(written), 'patch-20261121-old1-20261122-new1.zip')
      const zipBytes = new Uint8Array(await readFile(zipPath))
      expect(sha256Hex(zipBytes)).toBe(manifest.patches[0].sha256)
      expect(Object.keys(unzipSync(zipBytes))).toContain('index.html')
    })
  })

  describe('derivePatchBaseUrl', () => {
    it('returns the directory part and null for bare hosts', () => {
      expect(derivePatchBaseUrl(FULL_URL)).toBe(PATCH_BASE)
      expect(derivePatchBaseUrl('https://host/file')).toBe('https://host/')
      expect(derivePatchBaseUrl('https://host')).toBeNull()
    })
  })
})
