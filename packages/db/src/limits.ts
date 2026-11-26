/**
 * Row-limit guard for repository queries.
 *
 * SQLite treats `LIMIT -1` as "no limit" and binds `NaN`/`undefined` as NULL (also no limit), so a
 * caller that forwards unvalidated input (CLI flag, MCP argument, query string) can turn a
 * bounded list into a full-table read. `rowLimit` always returns a finite integer in [0, max].
 * Non-finite or negative input falls back to `fallback`.
 */
export const MAX_ROW_LIMIT = 10_000

export function rowLimit(limit: number, fallback = 50, max = MAX_ROW_LIMIT): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit) || limit < 0) {
    return Math.min(fallback, max)
  }
  return Math.min(Math.floor(limit), max)
}
