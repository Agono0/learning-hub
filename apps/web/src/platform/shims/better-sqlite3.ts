/**
 * Tauri-target stand-in for the native `better-sqlite3` addon.
 *
 * `drizzle-orm/better-sqlite3` imports the addon at module top-level (only to
 * support `drizzle('path.db')`). The hub worker never takes that path — it
 * hands drizzle the sqlite-wasm shim — so the import just has to resolve.
 * Aliased in next.config.ts for LEARNING_HUB_TARGET=tauri only.
 */
export default class BetterSqlite3Unavailable {
  constructor() {
    throw new Error(
      'better-sqlite3 is not available in the Tauri webview — use the sqlite-wasm driver',
    )
  }
}
