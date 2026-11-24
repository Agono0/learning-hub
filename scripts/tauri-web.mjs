#!/usr/bin/env node
/**
 * Builds/serves apps/web for the Tauri shell (called by tauri.conf.json's
 * beforeDevCommand / beforeBuildCommand — cross-platform, no shell env syntax).
 *
 *   node scripts/tauri-web.mjs dev    → `next dev` in Tauri mode (hot reload on
 *                                       Windows AND on an Android device/emulator)
 *   node scripts/tauri-web.mjs build  → static export to apps/web/.next-tauri
 *
 * For Android dev, the Tauri CLI sets TAURI_DEV_HOST to this machine's LAN
 * address; the dev server binds there so the device can reach it.
 */
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const mode = process.argv[2]
if (mode !== 'dev' && mode !== 'build') {
  console.error('usage: tauri-web.mjs <dev|build>')
  process.exit(2)
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const web = join(root, 'apps/web')
const env = { ...process.env, LEARNING_HUB_TARGET: 'tauri' }

function run(cmd, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    )
  })
}

await run('node', [join(root, 'scripts/vendor-sqlite-wasm.mjs')], root)

if (mode === 'dev') {
  const host = process.env.TAURI_DEV_HOST || 'localhost'
  await run('npx', ['next', 'dev', '--hostname', host, '--port', '3000'], web)
} else if (process.env.LH_SKIP_WEB_BUILD === '1' || process.env.TAURI_SKIP_WEB_BUILD === '1') {
  const outDir = join(web, '.next-tauri')
  if (!existsSync(outDir)) {
    console.error(`[tauri-web] LH_SKIP_WEB_BUILD is set but ${outDir} does not exist`)
    process.exit(1)
  }
  console.log(`[tauri-web] LH_SKIP_WEB_BUILD is set — using existing ${outDir}`)
} else {
  await run('npx', ['next', 'build'], web)
  const version = process.env.LH_APP_VERSION || ''
  if (version) {
    const { writeFileSync } = await import('node:fs')
    const outDir = join(web, '.next-tauri')
    writeFileSync(
      join(outDir, 'version.json'),
      JSON.stringify(
        {
          version,
          channel: process.env.LH_UPDATE_CHANNEL || 'nightly',
        },
        null,
        2,
      ) + '\n',
      'utf8',
    )
  }
}
