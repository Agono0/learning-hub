/**
 * 036 — arena daily modifier on arena_sessions. The modifier active when a
 * run is issued is stored so settlement replays with the same tuning even
 * across a midnight boundary. Additive and backfill-safe: existing runs
 * (none before this column existed on any shipped build) get NULL = no
 * modifier.
 */
import type { Migration } from './runner'

export const arenaSessionModifier: Migration = {
  id: 36,
  name: 'arena-session-modifier',
  up(ctx) {
    ctx.addColumn('arena_sessions', 'modifier', 'TEXT')
  },
}
