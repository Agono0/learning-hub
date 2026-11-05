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
 *
 *   node scripts/tauri-android.mjs dev            (device/emulator, hot reload)
 *   node scripts/tauri-android.mjs build --apk    (release APK)
 */
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
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

console.log(
  `[tauri-android] ANDROID_HOME=${env.ANDROID_HOME ?? '?'} NDK_HOME=${env.NDK_HOME ?? '?'} JAVA_HOME=${env.JAVA_HOME ?? '?'}`,
)

const child = spawn('npx', ['tauri', 'android', ...process.argv.slice(2)], {
  cwd: join(root, 'apps/native'),
  env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
child.on('exit', (code) => process.exit(code ?? 1))
