import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..', '..')
const read = (rel: string) => readFileSync(path.join(root, rel), 'utf8')
const ANDROID = 'apps/native/src-tauri/gen/android/app/src/main'
const KT = `${ANDROID}/java/dev/learninghub/app`

describe('Android shell hardening', () => {
  it('opts out of adb/cloud backup of app data', () => {
    expect(read(`${ANDROID}/AndroidManifest.xml`)).toMatch(
      /<application[^>]*android:allowBackup="false"/,
    )
  })

  it('FileProvider paths do not expose external storage', () => {
    expect(read(`${ANDROID}/res/xml/file_paths.xml`)).not.toMatch(
      /external(-files|-cache|-media)?-path/,
    )
  })

  it('MainActivity only follows installer status intents for its own sessions', () => {
    const src = read(`${KT}/MainActivity.kt`)
    expect(src).toContain('mySessions')
    expect(src).toContain('FLAG_GRANT_READ_URI_PERMISSION')
  })

  it('installApk accepts only the downloaded update APK in app data', () => {
    const src = read(`${KT}/MaxUpdatePlugin.kt`)
    expect(src).toContain('canonicalPath')
    expect(src).toContain('android-update-')
  })

  it('the Rust update commands confine paths without trusting lexical starts_with', () => {
    const src = read('apps/native/src-tauri/src/update.rs')
    expect(src).toContain('fn path_within')
    expect(src).toContain('fn is_update_apk_path')
    expect(src).not.toContain('!dest_path.starts_with(&base)')
    expect(src).toContain('is_update_apk_path(&slot_updates_dir(&app)')
  })
})

describe('native command argument trust', () => {
  const update = read('apps/native/src-tauri/src/update.rs')
  const focus = read('apps/native/src-tauri/src/focus.rs')

  it('delta apply and APK download only trust signature-verified manifests', () => {
    expect(update).toContain('struct VerifiedRegistry')
    expect(update).toMatch(/update_fetch_verified_manifest[\s\S]*?reg\.remember\(&manifest\)/)
    expect(update).toContain('manifest_is_verified(&target)')
    expect(update).toContain('apk_is_verified(&expected_sha256, total)')
  })

  it('the generic downloader cannot mint installer-trusted APK names, and patches must be listed', () => {
    expect(update).toContain('is_reserved_download_name(&dest_path)')
    expect(update).toContain('patch_is_listed(&target, &patch_url, &patch_sha256, patch_size)')
  })

  it('patch zip entries are read with a bound derived from the signed manifest size', () => {
    expect(update).toContain('fn read_bounded')
    expect(update).toContain('read_bounded(&mut entry, target_file.size)')
    expect(update).not.toContain(
      '.read_to_end(&mut bytes)\n            .map_err(|e| UpdateError::Parse(format!("patch entry',
    )
  })

  it('the JS caller passes the manifest APK size as total, not a transport length', () => {
    expect(read('apps/web/src/platform/updater.ts')).toContain('total: pkg.size')
  })

  it('Dependabot keeps the pinned workflow actions current', () => {
    expect(read('.github/dependabot.yml')).toMatch(/package-ecosystem:\s*github-actions/)
  })

  it('Android package allowlists are validated before reaching the Kotlin bridge', () => {
    expect(focus).toContain('pub fn sanitize_packages')
    expect(focus.match(/sanitize_packages\(packages\)\?/g)).toHaveLength(2)
  })
})

describe('signing and dependencies', () => {
  it('release signing has no built-in password or auto-generated keystore', () => {
    for (const f of [
      'scripts/tauri-android.mjs',
      'apps/native/src-tauri/gen/android/app/build.gradle.kts',
    ]) {
      const src = read(f)
      expect(src, f).not.toContain('learninghub123')
      expect(src, f).not.toMatch(/-genkeypair/)
    }
    expect(read('apps/native/src-tauri/gen/android/app/build.gradle.kts')).toContain(
      'Release signing is not configured',
    )
  })

  it('Cargo.lock carries the patched url and cookie releases', () => {
    const lock = read('apps/native/src-tauri/Cargo.lock')
    const ver = (name: string) =>
      lock.match(new RegExp(`name = "${name}"\\nversion = "([^"]+)"`))?.[1] ?? '0'
    const gte = (v: string, min: string) => {
      const a = v.split('.').map(Number)
      const b = min.split('.').map(Number)
      for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
      return true
    }
    expect(gte(ver('url'), '2.5.9')).toBe(true)
    expect(gte(ver('cookie'), '0.18.3')).toBe(true)
  })
})

describe('MCP registry', () => {
  it('plugin tools get the same argument size cap as built-ins', () => {
    expect(read('apps/mcp/src/index.ts')).toContain('checkArgsSize(args)')
  })
})

describe('release workflow hardening', () => {
  const dir = path.join(root, '.github/workflows')
  // ci.yml is owned by another change; every other workflow must comply.
  const files = readdirSync(dir).filter((f) => f.endsWith('.yml') && f !== 'ci.yml')

  it.each(files)('%s pins every action to a full commit SHA', (f) => {
    const uses = [...read(`.github/workflows/${f}`).matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)].map(
      (m) => m[1]!,
    )
    expect(uses.length).toBeGreaterThan(0)
    for (const u of uses) expect(u).toMatch(/@[0-9a-f]{40}$/)
  })

  it.each(files)('%s is read-only at workflow level', (f) => {
    const src = read(`.github/workflows/${f}`)
    const top = src.match(/^permissions:\n((?:[ \t]+.*\n|[ \t]*#.*\n)+)/m)
    expect(top, 'top-level permissions block').not.toBeNull()
    expect(top![1]).not.toMatch(/:\s*write/)
  })
})
