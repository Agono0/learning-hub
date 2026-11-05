#!/usr/bin/env node
/**
 * Copy the @sqlite.org/sqlite-wasm browser build into apps/web/public so the
 * Tauri target can load it as a static asset (see
 * apps/web/src/platform/shims/sqlite-wasm.ts). Runs before every Tauri build;
 * the output directory is gitignored.
 */
import { copyFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'apps/web/package.json'))
const dist = join(dirname(require.resolve('@sqlite.org/sqlite-wasm/package.json')), 'dist')
const out = join(root, 'apps/web/public/vendor/sqlite-wasm')

mkdirSync(out, { recursive: true })
for (const file of ['index.mjs', 'sqlite3.wasm', 'sqlite3-opfs-async-proxy.js']) {
  copyFileSync(join(dist, file), join(out, file))
}
console.log(`[vendor-sqlite-wasm] copied to ${out}`)
