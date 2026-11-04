/**
 * Learning HUB — DE-RISK SPIKE: drizzle instance on top of the sqlite-wasm shim.
 *
 * PROVEN APPROACH (no custom session needed): `drizzle-orm/better-sqlite3`
 * consumes ONLY two members of the client —
 *
 *   - `client.prepare(sql)` → statement used as `.run(...params)`,
 *     `.all(...params)`, `.get(...params)` and `.raw().get/.all(...params)`
 *     (savepoints in nested transactions go through `session.run(sql.raw(...))`
 *     → prepare + run).
 *   - `client.transaction(fn)` → wrapped fn with `.deferred` / `.immediate` /
 *     `.exclusive` variants (drizzle always calls
 *     `nativeTx[config.behavior ?? 'deferred'](tx)`).
 *
 * The shim implements both surfaces exactly, so the stock
 * `drizzle(client, { schema })` driver accepts it structurally — the only
 * concession is the TS cast below (drizzle's parameter is typed as the native
 * better-sqlite3 class; at runtime nothing checks the prototype).
 */
import { drizzle } from 'drizzle-orm/better-sqlite3'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type Database from 'better-sqlite3'
import * as schema from '../schema'
import type { SqliteWasmDatabase } from './sqlite-wasm'

/** Drizzle db type over the wasm shim (same shape as the app's LearningHubDB). */
export type WasmLearningHubDB = BetterSQLite3Database<typeof schema> & {
  $client: SqliteWasmDatabase
}

/**
 * Build a drizzle instance over the better-sqlite3-compatible wasm shim.
 * Mirrors `drizzle(sqlite, { schema })` from packages/db/src/index.ts.
 */
export function createWasmLearningHubDb(handle: SqliteWasmDatabase): WasmLearningHubDB {
  // drizzle-orm/better-sqlite3's construct() duck-types the client; the cast is
  // type-level only. construct() sets `db.$client = handle` itself.
  return drizzle(handle as unknown as Database.Database, {
    schema,
  }) as unknown as WasmLearningHubDB
}
