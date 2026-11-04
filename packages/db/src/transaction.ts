/**
 * Learning HUB — standard transaction atomicity helpers.
 *
 * Transactions are strictly synchronous (better-sqlite3 AND the sqlite-wasm
 * shim share drizzle-orm/better-sqlite3's sync session, so the same contract
 * holds on both drivers).
 * Passing an async function throws `TypeError: Transaction function cannot return a promise`.
 * All asynchronous operations must precede withTransaction.
 *
 * Uses `{ behavior: 'immediate' }` (BEGIN IMMEDIATE) to acquire the write lock immediately,
 * preventing SQLite lock-upgrade deadlocks under concurrent multi-process access.
 */
import type { BetterSQLiteTransaction } from 'drizzle-orm/better-sqlite3'
import type { ExtractTablesWithRelations } from 'drizzle-orm/relations'
import * as schema from './schema'
import { getDb, type LearningHubDB } from './index'

/** Transaction handle `withTransaction` callbacks receive (sync SQLite transaction). */
export type Transaction = BetterSQLiteTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>

/** Excludes promise-like types, so an async callback is a compile-time error. */
export type NonPromise<T> = T extends PromiseLike<any> ? never : T

/**
 * Run an atomic transaction synchronously using better-sqlite3 with BEGIN IMMEDIATE behavior.
 * Automatically commits on return and rolls back on exception.
 */
export function withTransaction<T>(
  cb: (tx: Transaction) => NonPromise<T>,
  database?: LearningHubDB,
): T {
  const targetDb: LearningHubDB = database ?? getDb()
  // The `as T` is sound by construction: `NonPromise<T>` is `T` for every
  // callable callback (async ones are `never` and cannot return at all), but
  // TS cannot see through the conditional type to satisfy drizzle's generic.
  return targetDb.transaction((tx) => cb(tx) as T, { behavior: 'immediate' })
}

/**
 * Alias for withTransaction.
 */
export const writeTransaction = withTransaction
