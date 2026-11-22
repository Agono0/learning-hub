import { describe, expect, it } from 'vitest'
import {
  assertHttps,
  compareVersions,
  latestJsonSchema,
  pickPatch,
  platformSchema,
  updateManifestSchema,
  updatePointerSchema,
  updateSettingsSchema,
  type UpdateManifest,
} from '../src/update/index.js'

const SHA = 'a'.repeat(64)

/** A minimal valid manifest used as the accept-case base for mutation tests. */
function validManifest(overrides: Partial<UpdateManifest> = {}): UpdateManifest {
  return {
    manifestVersion: 1,
    channel: 'nightly',
    version: '20261122-abc1234',
    buildSha: 'abc1234567',
    createdAt: '2026-11-22T03:14:15.926Z',
    minNativeVersion: '0.5.2',
    requiresNative: false,
    files: [{ path: 'index.html', sha256: SHA, size: 1024 }],
    patches: [
      {
        fromVersion: '20261121-def5678',
        url: 'https://releases.example.com/patch-20261122.bin',
        sha256: 'b'.repeat(64),
        size: 51200,
      },
    ],
    fullPackageUrl: 'https://releases.example.com/LearningHUB_0.5.2_x64-setup.exe',
    ...overrides,
  }
}

describe('update schemas', () => {
  describe('updateManifestSchema', () => {
    it('accepts a fully valid manifest', () => {
      const result = updateManifestSchema.safeParse(validManifest())
      expect(result.success).toBe(true)
    })

    it('rejects a bad sha256 (uppercase, wrong length, non-hex)', () => {
      const upper = validManifest({
        files: [{ path: 'index.html', sha256: SHA.toUpperCase(), size: 1024 }],
      })
      expect(updateManifestSchema.safeParse(upper).success).toBe(false)

      const short = validManifest({
        files: [{ path: 'index.html', sha256: 'a'.repeat(63), size: 1024 }],
      })
      expect(updateManifestSchema.safeParse(short).success).toBe(false)

      const nonHex = validManifest({
        files: [{ path: 'index.html', sha256: 'g'.repeat(64), size: 1024 }],
      })
      expect(updateManifestSchema.safeParse(nonHex).success).toBe(false)
    })

    it('rejects http:// URLs (full package and patch)', () => {
      const httpFull = validManifest({
        fullPackageUrl: 'http://releases.example.com/setup.exe',
      })
      expect(updateManifestSchema.safeParse(httpFull).success).toBe(false)

      const httpPatch = validManifest({
        patches: [
          {
            fromVersion: '20261121-def5678',
            url: 'http://releases.example.com/patch.bin',
            sha256: SHA,
            size: 51200,
          },
        ],
      })
      expect(updateManifestSchema.safeParse(httpPatch).success).toBe(false)
    })

    it('rejects an unknown channel', () => {
      const result = updateManifestSchema.safeParse(validManifest({ channel: 'canary' as never }))
      expect(result.success).toBe(false)
    })

    it('rejects an empty file list and more than 5 patches', () => {
      expect(updateManifestSchema.safeParse(validManifest({ files: [] })).success).toBe(false)

      const patch = {
        fromVersion: '1.0.0',
        url: 'https://releases.example.com/p.bin',
        sha256: SHA,
        size: 1,
      }
      expect(
        updateManifestSchema.safeParse(validManifest({ patches: Array(6).fill(patch) })).success,
      ).toBe(false)
      expect(
        updateManifestSchema.safeParse(validManifest({ patches: Array(5).fill(patch) })).success,
      ).toBe(true)
    })

    it('rejects missing required fields and wrong manifestVersion', () => {
      const { manifestVersion: _mv, ...noVersion } = validManifest()
      expect(updateManifestSchema.safeParse({ ...noVersion, manifestVersion: 2 }).success).toBe(
        false,
      )
      const { files: _f, ...noFiles } = validManifest()
      expect(updateManifestSchema.safeParse(noFiles).success).toBe(false)
      expect(
        updateManifestSchema.safeParse(validManifest({ createdAt: 'yesterday' })).success,
      ).toBe(false)
      expect(updateManifestSchema.safeParse(validManifest({ buildSha: 'abc12' })).success).toBe(
        false,
      )
    })

    it('round-trips through JSON without changing the parsed value', () => {
      const parsed = updateManifestSchema.parse(validManifest())
      const reparsed = updateManifestSchema.parse(JSON.parse(JSON.stringify(parsed)))
      expect(reparsed).toEqual(parsed)
    })
  })

  describe('updatePointerSchema (nightly.json)', () => {
    it('accepts a valid pointer and makes notes optional', () => {
      const pointer = {
        channel: 'nightly',
        version: '20261122-abc1234',
        manifestUrl: 'https://releases.example.com/nightly/manifest.json',
        publishedAt: '2026-11-22T03:14:15.926Z',
      }
      expect(updatePointerSchema.safeParse(pointer).success).toBe(true)
      expect(
        updatePointerSchema.safeParse({ ...pointer, notes: 'fix: focus timer drift' }).success,
      ).toBe(true)
    })

    it('rejects http manifest urls and unknown channels', () => {
      expect(
        updatePointerSchema.safeParse({
          channel: 'stable',
          version: '1.0.0',
          manifestUrl: 'http://releases.example.com/manifest.json',
          publishedAt: '2026-11-22T03:14:15.926Z',
        }).success,
      ).toBe(false)
      expect(
        updatePointerSchema.safeParse({
          channel: 'dev',
          version: '1.0.0',
          manifestUrl: 'https://releases.example.com/manifest.json',
          publishedAt: '2026-11-22T03:14:15.926Z',
        }).success,
      ).toBe(false)
    })
  })

  describe('latestJsonSchema (Tauri official updater)', () => {
    it('accepts the Windows updater document shape', () => {
      const latest = {
        version: '0.5.2',
        notes: 'Nightly build 20261122-abc1234',
        pub_date: '2026-11-22T03:14:15.926Z',
        platforms: {
          'windows-x86_64': {
            url: 'https://releases.example.com/LearningHUB_0.5.2_x64-setup.exe',
            signature: 'dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWdu...',
          },
        },
      }
      const result = latestJsonSchema.safeParse(latest)
      expect(result.success).toBe(true)
    })

    it('rejects http artifact urls and missing platforms', () => {
      expect(
        latestJsonSchema.safeParse({
          version: '0.5.2',
          notes: '',
          pub_date: '2026-11-22T03:14:15.926Z',
          platforms: {
            'windows-x86_64': { url: 'http://insecure.example.com/setup.exe', signature: 'x' },
          },
        }).success,
      ).toBe(false)
      expect(
        latestJsonSchema.safeParse({
          version: '0.5.2',
          notes: '',
          pub_date: '2026-11-22T03:14:15.926Z',
        }).success,
      ).toBe(false)
    })
  })

  describe('updateSettingsSchema', () => {
    it('applies calm defaults from an empty object', () => {
      const settings = updateSettingsSchema.parse({})
      expect(settings).toEqual({
        channel: 'nightly',
        autoCheckIntervalHours: 6,
        wifiOnly: true,
        autoApply: false,
      })
    })

    it('keeps ask-first locked (autoApply cannot be true)', () => {
      expect(updateSettingsSchema.safeParse({ autoApply: true }).success).toBe(false)
    })

    it('bounds the auto-check interval', () => {
      expect(updateSettingsSchema.safeParse({ autoCheckIntervalHours: 0 }).success).toBe(false)
      expect(updateSettingsSchema.safeParse({ autoCheckIntervalHours: 169 }).success).toBe(false)
      expect(updateSettingsSchema.safeParse({ autoCheckIntervalHours: 168 }).success).toBe(true)
    })
  })

  describe('platformSchema', () => {
    it('accepts the published platform keys only', () => {
      expect(platformSchema.safeParse('windows-x86_64').success).toBe(true)
      expect(platformSchema.safeParse('android-arm64-v8a').success).toBe(true)
      expect(platformSchema.safeParse('android-universal').success).toBe(true)
      expect(platformSchema.safeParse('darwin-aarch64').success).toBe(false)
      expect(platformSchema.safeParse('win32').success).toBe(false)
    })
  })
})

describe('assertHttps', () => {
  it('accepts https urls and rejects http, relative and garbage input', () => {
    expect(assertHttps('https://releases.example.com/manifest.json')).toBe(true)
    expect(assertHttps('https://releases.example.com')).toBe(true)
    expect(assertHttps('http://releases.example.com/manifest.json')).toBe(false)
    expect(assertHttps('ftp://releases.example.com')).toBe(false)
    expect(assertHttps('/relative/path.json')).toBe(false)
    expect(assertHttps('not a url')).toBe(false)
    expect(assertHttps('')).toBe(false)
  })
})

describe('compareVersions', () => {
  it('orders plain numeric release versions', () => {
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1)
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1)
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
  })

  it('treats missing segments as zero (1.2 == 1.2.0)', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1.2.0', '1.2')).toBe(0)
    expect(compareVersions('1.2', '1.2.1')).toBe(-1)
  })

  it('orders classic semver prereleases below their release', () => {
    expect(compareVersions('1.2.3-beta.1', '1.2.3')).toBe(-1)
    expect(compareVersions('1.2.3', '1.2.3-beta.1')).toBe(1)
    expect(compareVersions('1.2.3-beta.1', '1.2.3-beta.2')).toBe(-1)
    expect(compareVersions('1.2.3-beta.2', '1.2.3-rc.1')).toBe(-1)
    expect(compareVersions('1.2.3-1', '1.2.3-alpha')).toBe(-1) // numeric < alphanumeric
  })

  it('sorts CI nightly tags (nightly-YYYYMMDD-<sha>) after their base version', () => {
    expect(compareVersions('20261122-abc1234', '20261122')).toBe(1)
    expect(compareVersions('20261122', '20261122-abc1234')).toBe(-1)
    // The tag prefix the CI workflow prepends must not change the order.
    expect(compareVersions('nightly-20261122-abc1234', '20261122')).toBe(1)
    expect(compareVersions('nightly-20261122-abc1234', '20261122-abc1234')).toBe(0)
  })

  it('orders nightly builds by date, then by sha', () => {
    expect(compareVersions('20261121-abc1234', '20261122-abc1234')).toBe(-1)
    expect(compareVersions('20261122-abc1234', '20261122-def5678')).toBe(-1)
    expect(compareVersions('nightly-20261122-def5678', 'nightly-20261121-abc1234')).toBe(1)
    expect(compareVersions('20261122-abc1234', '20261122-abc1234')).toBe(0)
  })

  it('ranks nightly builds above older-style release numbers', () => {
    expect(compareVersions('0.5.2', '20261122-abc1234')).toBe(-1)
    expect(compareVersions('20261122-abc1234', '0.5.2')).toBe(1)
  })

  it('ignores build metadata and tolerates prefixes/case', () => {
    expect(compareVersions('1.2.3+build.5', '1.2.3')).toBe(0)
    expect(compareVersions('v1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('V1.2.3-RC.1', '1.2.3-rc.1')).toBe(0)
  })

  it('is defensive against garbage input', () => {
    expect(compareVersions('', '1.0.0')).toBe(-1)
    expect(compareVersions('garbage', 'garbage')).toBe(0)
    expect(compareVersions('99999999999999999999.1', '99999999999999999999.2')).toBe(-1)
  })

  it('is antisymmetric across the whole ordering set', () => {
    const versions = [
      '1.0.0',
      '1.2',
      '1.2.0-beta.1',
      '1.2.0',
      '20261121-abc1234',
      '20261122-abc1234',
      '20261122-def5678',
      '2.0.0',
    ]
    for (const a of versions) {
      for (const b of versions) {
        const ab = compareVersions(a, b)
        const ba = compareVersions(b, a)
        expect(ab).toBe(-ba)
        if (a === b) expect(ab).toBe(0)
      }
    }
  })
})

describe('pickPatch', () => {
  const manifest = validManifest()

  it('matches the patch for the exact installed version', () => {
    const patch = pickPatch(manifest, '20261121-def5678')
    expect(patch).not.toBeNull()
    expect(patch?.url).toBe('https://releases.example.com/patch-20261122.bin')
  })

  it('matches through tag/prefix variants of the same version', () => {
    expect(pickPatch(manifest, 'nightly-20261121-def5678')).not.toBeNull()
  })

  it('returns null (full-package fallback) when no patch matches', () => {
    expect(pickPatch(manifest, '20261120-0000000')).toBeNull()
    expect(pickPatch(manifest, '1.0.0')).toBeNull()
    expect(pickPatch(manifest, manifest.version)).toBeNull()
  })
})
