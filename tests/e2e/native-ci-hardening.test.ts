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
    expect(update).toContain('apk_sha_is_verified(&expected_sha256)')
  })

  it('Android package allowlists are validated before reaching the Kotlin bridge', () => {
    expect(focus).toContain('pub fn sanitize_packages')
    expect(focus.match(/sanitize_packages\(packages\)\?/g)).toHaveLength(2)
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
