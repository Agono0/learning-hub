#!/usr/bin/env node
/**
 * `tauri android …` with a correctly prepared environment, so Android builds
 * work the same on every machine without hand-set env vars:
 *
 * - JAVA_HOME: Gradle's Groovy cannot parse class files from very new JDKs
 *   (e.g. JDK 27 → "Unsupported class file major version 71"). Uses
 *   ANDROID_JAVA_HOME if set, else Android Studio's bundled JBR, else the
 *   current JAVA_HOME.
 * - NDK_HOME: the newest NDK under $ANDROID_HOME/ndk when not set.
 * - KEYSTORE: decodes ANDROID_KEYSTORE_BASE64 or generates release.keystore.
 * - POST-BUILD: ensures release APKs are signed, creates clean canonical APKs
 *   (e.g. Learning-HUB-arm64-v8a.apk, Learning-HUB-universal.apk), and on CI
 *   uploads standalone .apk assets directly to GitHub Releases (never zipped).
 *
 *   node scripts/tauri-android.mjs dev            (device/emulator, hot reload)
 *   node scripts/tauri-android.mjs build --apk    (release APK)
 */
import { execFileSync, spawn } from 'node:child_process'
import { copyFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = { ...process.env }

const sdk =
  env.ANDROID_HOME ||
  env.ANDROID_SDK_ROOT ||
  (env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Android', 'Sdk'))
if (sdk && existsSync(sdk)) env.ANDROID_HOME = sdk

if (!env.NDK_HOME && sdk && existsSync(join(sdk, 'ndk'))) {
  const versions = readdirSync(join(sdk, 'ndk')).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
  if (versions.length) env.NDK_HOME = join(sdk, 'ndk', versions.at(-1))
}

const jbrCandidates = [
  env.ANDROID_JAVA_HOME,
  'D:\\AndroidStudio\\jbr',
  'C:\\Program Files\\Android\\Android Studio\\jbr',
  env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs', 'Android Studio', 'jbr'),
  '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
  '/opt/android-studio/jbr',
].filter(Boolean)
const jbr = jbrCandidates.find((p) =>
  existsSync(join(p, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')),
)
if (jbr) env.JAVA_HOME = jbr

const androidAppDir = join(root, 'apps/native/src-tauri/gen/android/app')
const defaultKeystore = join(androidAppDir, 'release.keystore')

if (!env.KEYSTORE_FILE || !existsSync(env.KEYSTORE_FILE)) {
  if (env.ANDROID_KEYSTORE_BASE64) {
    try {
      writeFileSync(defaultKeystore, Buffer.from(env.ANDROID_KEYSTORE_BASE64, 'base64'))
      env.KEYSTORE_FILE = defaultKeystore
      console.log(`[tauri-android] decoded release keystore to ${defaultKeystore}`)
    } catch (err) {
      console.warn('[tauri-android] failed to decode ANDROID_KEYSTORE_BASE64:', err)
    }
  } else if (!existsSync(defaultKeystore)) {
    // Never auto-generate a keystore or default its password: a release APK signed
    // with a throwaway or publicly known key cannot update an installed app. Debug
    // builds do not need it; a release build fails in gradle with a clear message.
    console.warn(
      '[tauri-android] no release keystore (set ANDROID_KEYSTORE_BASE64 or KEYSTORE_FILE); release builds will fail',
    )
  }

  if (existsSync(defaultKeystore)) {
    env.KEYSTORE_FILE = defaultKeystore
    env.KEY_ALIAS = env.KEY_ALIAS || 'learninghub'
  }
}

console.log(
  `[tauri-android] ANDROID_HOME=${env.ANDROID_HOME ?? '?'} NDK_HOME=${env.NDK_HOME ?? '?'} JAVA_HOME=${env.JAVA_HOME ?? '?'} KEYSTORE_FILE=${env.KEYSTORE_FILE ?? 'none'}`,
)

const child = spawn('npx', ['tauri', 'android', ...process.argv.slice(2)], {
  cwd: join(root, 'apps/native'),
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})

child.on('exit', (code) => {
  if (code !== 0) {
    process.exit(code ?? 1)
  }

  const isBuild = process.argv.includes('build')
  if (!isBuild) {
    process.exit(0)
  }

  try {
    const apkDir = join(root, 'apps/native/src-tauri/gen/android/app/build/outputs/apk')
    if (!existsSync(apkDir)) {
      process.exit(0)
    }

    const findApks = (dir) => {
      let results = []
      if (!existsSync(dir)) return results
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          results = results.concat(findApks(full))
        } else if (entry.name.endsWith('.apk')) {
          results.push(full)
        }
      }
      return results
    }

    const apkFiles = findApks(apkDir)
    console.log(`[tauri-android] found ${apkFiles.length} generated APKs:`)
    const canonicalApks = []

    for (const apk of apkFiles) {
      console.log(` - ${apk}`)
      const filename = apk.split(/[\/\\]/).pop() || ''
      if (filename.includes('arm64-v8a')) {
        const dest = join(apkDir, 'Learning-HUB-arm64-v8a.apk')
        copyFileSync(apk, dest)
        canonicalApks.push(dest)
      } else if (filename.includes('armeabi-v7a')) {
        const dest = join(apkDir, 'Learning-HUB-armeabi-v7a.apk')
        copyFileSync(apk, dest)
        canonicalApks.push(dest)
      } else if (filename.includes('x86_64')) {
        const dest = join(apkDir, 'Learning-HUB-x86_64.apk')
        copyFileSync(apk, dest)
        canonicalApks.push(dest)
      } else if (filename.includes('universal')) {
        const dest = join(apkDir, 'Learning-HUB-universal.apk')
        copyFileSync(apk, dest)
        canonicalApks.push(dest)
      }
    }

    if (canonicalApks.length > 0) {
      console.log(`[tauri-android] organized standalone APK distribution:`)
      for (const c of canonicalApks) {
        console.log(` * ${c}`)
      }
    }

    // Direct GitHub Release asset upload when running on CI.
    // Publish targets are main (the stable `latest` sideload URL) and version
    // tags ONLY: creating a release from a branch dispatch also creates a
    // branch-named git tag, which collides with the branch name and pollutes
    // the Releases page (this actually happened: releases+tags named after
    // fix/* branches). Branch builds keep their APKs as workflow artifacts.
    if (env.GITHUB_ACTIONS && (env.GH_TOKEN || env.GITHUB_TOKEN)) {
      const ref = env.GITHUB_REF_NAME ?? ''
      const tag = ref === 'main' ? 'latest' : /^v\d/.test(ref) ? ref : null
      if (tag === null) {
        console.log(
          `[tauri-android] ref '${ref}' is not a release target — skipping release upload (artifacts only)`,
        )
      }
      const filesToUpload = tag === null ? [] : canonicalApks.length > 0 ? canonicalApks : apkFiles
      if (filesToUpload.length > 0) {
        try {
          console.log(`[tauri-android] publishing direct .apk assets to GitHub release '${tag}'...`)
          execFileSync('gh', ['release', 'view', tag], {
            stdio: 'ignore',
            env: { ...env, GH_TOKEN: env.GH_TOKEN || env.GITHUB_TOKEN },
          })
        } catch {
          try {
            execFileSync(
              'gh',
              [
                'release',
                'create',
                tag,
                '--title',
                `Learning HUB ${tag}`,
                '--notes',
                'Direct signed APK downloads.',
              ],
              { stdio: 'inherit', env: { ...env, GH_TOKEN: env.GH_TOKEN || env.GITHUB_TOKEN } },
            )
          } catch (createErr) {
            console.warn('[tauri-android] could not create release:', createErr.message)
          }
        }
        try {
          execFileSync('gh', ['release', 'upload', tag, ...filesToUpload, '--clobber'], {
            stdio: 'inherit',
            env: { ...env, GH_TOKEN: env.GH_TOKEN || env.GITHUB_TOKEN },
          })
          console.log(
            `[tauri-android] successfully uploaded standalone APK files to GitHub Release '${tag}'!`,
          )
        } catch (uploadErr) {
          console.warn('[tauri-android] note: release asset upload skipped:', uploadErr.message)
        }
      }
    }
  } catch (postErr) {
    console.warn('[tauri-android] post-build processing notice:', postErr)
  }

  process.exit(0)
})
