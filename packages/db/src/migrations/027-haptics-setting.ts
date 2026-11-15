/**
 * 027 — haptics-enabled user setting (MASTER-FIX-PLAN F-06).
 * Tactile feedback shipped always-on with one consumer and no opt-out; this
 * adds the persisted setting (default ON — the shipped behavior — so nothing
 * changes for existing users until they turn it off). Additive and
 * backfill-safe: existing rows receive the default. Never edit after it has
 * shipped to any device (AGENTS.md rule 4).
 */
import type { Migration } from './runner'

export const hapticsSetting: Migration = {
  id: 27,
  name: 'haptics-setting',
  up(ctx) {
    ctx.addColumn('user_settings', 'haptics_enabled', 'INTEGER NOT NULL DEFAULT 1')
  },
}
