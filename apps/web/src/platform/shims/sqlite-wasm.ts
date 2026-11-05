/**
 * Tauri-target loader for `@sqlite.org/sqlite-wasm`.
 *
 * The package's browser build contains `new Worker(new URL(<dynamic>))` code
 * paths (the Worker1 promiser and the OPFS async proxy) that Turbopack refuses
 * to bundle. We use neither — the hub worker runs sqlite in-thread on the
 * opfs-sahpool VFS — so instead of bundling, the untouched dist files are
 * served as static assets (copied to public/vendor/sqlite-wasm by
 * scripts/vendor-sqlite-wasm.mjs) and imported at runtime. sqlite3.wasm is
 * located next to index.mjs via its own `import.meta.url`.
 *
 * Aliased in next.config.ts for LEARNING_HUB_TARGET=tauri only.
 */
const VENDOR_URL = '/vendor/sqlite-wasm/index.mjs'

export default async function sqlite3InitModule(...args: unknown[]): Promise<unknown> {
  const url = new URL(VENDOR_URL, self.location.origin).href
  const mod = (await import(/* turbopackIgnore: true */ /* webpackIgnore: true */ url)) as {
    default: (...a: unknown[]) => Promise<unknown>
  }
  return mod.default(...args)
}
