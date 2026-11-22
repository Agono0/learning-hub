import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  formatKb,
  generateApkDelta,
  main,
  parseArgs,
} from '../../../scripts/generate-apk-delta.mjs'

const tempRoots: string[] = []
afterAll(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })))
})

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'apk-delta-'))
  tempRoots.push(dir)
  return dir
}

/**
 * Write a fake `bsdiff` binary (a node script with a shebang + exec bit) that
 * behaves according to `mode` — the tests only run on POSIX CI, where an
 * executable script is a valid --bsdiff-bin target.
 */
async function fakeBsdiff(dir: string, mode: 'ok' | 'empty' | 'fail'): Promise<string> {
  const bin = path.join(dir, `bsdiff-${mode}.js`)
  const body =
    mode === 'fail'
      ? '#!/usr/bin/env node\nconsole.error("boom"); process.exit(1)\n'
      : mode === 'empty'
        ? `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(process.argv[3], '')\n`
        : `#!/usr/bin/env node\nrequire('node:fs').writeFileSync(process.argv[3], 'PATCHDATA'.repeat(64))\n`
  await writeFile(bin, body)
  await chmod(bin, 0o755)
  return bin
}

/** Two non-empty fixture APK stand-ins. */
async function fixtureApks(dir: string) {
  const base = path.join(dir, 'app-arm64-v8a-old.apk')
  const target = path.join(dir, 'app-arm64-v8a-new.apk')
  await writeFile(base, Buffer.alloc(4096, 1))
  await writeFile(target, Buffer.alloc(6144, 2))
  return { base, target }
}

describe('generate-apk-delta script (O1-21)', () => {
  describe('parseArgs', () => {
    it('parses flags and defaults the bsdiff binary', () => {
      const opts = parseArgs(['--base', 'a.apk', '--target', 'b.apk', '--out', 'dist/'])
      expect(opts.base).toBe('a.apk')
      expect(opts.bsdiffBin).toBe('bsdiff')
      expect(opts.label).toBeUndefined()
      expect(
        parseArgs(['--base=a.apk', '--target=b.apk', '--out=o', '--label=arm64-v8a']).label,
      ).toBe('arm64-v8a')
    })

    it('throws on missing required options and unknown flags', () => {
      expect(() => parseArgs(['--base', 'a.apk'])).toThrow(/target/i)
      expect(() =>
        parseArgs(['--base', 'a', '--target', 'b', '--out', 'o', '--nope', 'x']),
      ).toThrow(/unknown/i)
    })
  })

  describe('generateApkDelta', () => {
    it.skipIf(process.platform === 'win32')(
      'produces a patch + report with bytes, KB and ratio',
      async () => {
        const dir = await tempDir()
        const { base, target } = await fixtureApks(dir)
        const out = path.join(dir, 'out')
        const report = await generateApkDelta({
          base,
          target,
          out,
          label: 'arm64-v8a',
          bsdiffBin: await fakeBsdiff(dir, 'ok'),
        })
        expect(report.label).toBe('arm64-v8a')
        expect(report.base.bytes).toBe(4096)
        expect(report.target.bytes).toBe(6144)
        expect(report.patch.bytes).toBe(64 * 10)
        expect(report.patch.path).toBe(path.join(out, 'delta-arm64-v8a.patch'))
        expect(report.ratio).toBeCloseTo(report.patch.bytes / 6144, 4)
      },
    )

    it('throws when base or target is missing/empty (never ships a blind delta)', async () => {
      const dir = await tempDir()
      const { base, target } = await fixtureApks(dir)
      await expect(
        generateApkDelta({ base: path.join(dir, 'missing.apk'), target, out: dir }),
      ).rejects.toThrow(/base APK missing/i)
      const empty = path.join(dir, 'empty.apk')
      await writeFile(empty, '')
      // Base is validated FIRST (correct precedence: inputs in argument
      // order), so an empty base reports the base error.
      await expect(generateApkDelta({ base: empty, target, out: dir })).rejects.toThrow(
        /base APK missing/i,
      )
      // …and a missing TARGET with a valid base reports the target error.
      await expect(
        generateApkDelta({ base, target: path.join(dir, 'missing-target.apk'), out: dir }),
      ).rejects.toThrow(/target APK missing/i)
    })

    it.skipIf(process.platform === 'win32')(
      'throws when bsdiff fails or emits an empty patch (fallback to full APK)',
      async () => {
        const dir = await tempDir()
        const { base, target } = await fixtureApks(dir)
        // A FAILING bsdiff (exit 1) is the honest "broken delta" case…
        await expect(
          generateApkDelta({ base, target, out: dir, bsdiffBin: await fakeBsdiff(dir, 'fail') }),
        ).rejects.toThrow(/bsdiff failed/i)
        // …and an EMPTY patch is refused before it can ship.
        await expect(
          generateApkDelta({ base, target, out: dir, bsdiffBin: await fakeBsdiff(dir, 'empty') }),
        ).rejects.toThrow(/empty patch/i)
      },
    )
  })

  describe('main (end-to-end)', () => {
    it.skipIf(process.platform === 'win32')(
      'writes the report JSON and prints the keep/skip hint',
      async () => {
        const dir = await tempDir()
        const { base, target } = await fixtureApks(dir)
        const reportPath = path.join(dir, 'delta-report.json')
        const report = await main([
          '--base',
          base,
          '--target',
          target,
          '--out',
          path.join(dir, 'out'),
          '--report',
          reportPath,
          '--label',
          'arm64-v8a',
          '--bsdiff-bin',
          await fakeBsdiff(dir, 'ok'),
        ])
        const onDisk = JSON.parse(await readFile(reportPath, 'utf8'))
        expect(onDisk).toEqual(report)
        expect(onDisk.ratio).toBeLessThan(0.5)
      },
    )
  })

  describe('formatKb', () => {
    it('formats calm KB strings', () => {
      expect(formatKb(1024)).toBe('1.0 KB')
      expect(formatKb(51200)).toBe('50.0 KB')
      expect(formatKb(0)).toBe('0.0 KB')
    })
  })
})
