/**
 * 037 — drill lineage on arena_sessions. A run issued as a weak-card drill
 * (?rematch=<runId>) records which settled run it rematches, so settlement
 * can report per-card improvement against the original grades. Additive and
 * backfill-safe: existing runs get NULL (not a drill).
 */
import type { Migration } from './runner'

export const arenaSessionDrillOf: Migration = {
  id: 37,
  name: 'arena-session-drill-of',
  up(ctx) {
    ctx.addColumn('arena_sessions', 'drill_of_run_id', 'TEXT')
  },
}
