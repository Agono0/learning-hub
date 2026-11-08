/**
 * 025 — Upsert keys for databases created from a pre-release draft of 024.
 *
 * Some development databases got `tmr_cues` / `palace_3d_scenes` from an early
 * schema draft (surrogate `id` primary key, NO unique key on `card_id` /
 * `palace_id`). Migration 024 uses `CREATE TABLE IF NOT EXISTS`, so it left those
 * tables alone, and every `ON CONFLICT (card_id)` / `ON CONFLICT (palace_id)`
 * upsert then failed with "ON CONFLICT clause does not match any PRIMARY KEY or
 * UNIQUE constraint".
 *
 * Feature-detected and idempotent: when the key column is already the primary
 * key (every fresh database) nothing happens. Otherwise duplicate rows are
 * collapsed to the newest one per key (cue counters summed, so no replay history
 * is lost) and the unique index the upserts need is created. Never drops a table
 * or column (ADR rule).
 */
import type { Migration, MigrationContext } from './runner'

/** True when `column` is (part of) the table's primary key. */
function isPrimaryKey(ctx: MigrationContext, table: string, column: string): boolean {
  const cols = ctx.raw.pragma(`table_info("${table}")`) as { name: string; pk: number }[]
  return cols.some((c) => c.name === column && c.pk > 0)
}

/** True when some UNIQUE index covers exactly `column`. */
function hasUniqueIndexOn(ctx: MigrationContext, table: string, column: string): boolean {
  const indexes = ctx.raw.pragma(`index_list("${table}")`) as { name: string; unique: number }[]
  return indexes.some((ix) => {
    if (!ix.unique) return false
    const cols = ctx.raw.pragma(`index_info("${ix.name.replace(/"/g, '""')}")`) as {
      name: string
    }[]
    return cols.length === 1 && cols[0]!.name === column
  })
}

function needsKey(ctx: MigrationContext, table: string, column: string): boolean {
  return (
    ctx.hasTable(table) &&
    ctx.hasColumn(table, column) &&
    !isPrimaryKey(ctx, table, column) &&
    !hasUniqueIndexOn(ctx, table, column)
  )
}

export const cognitiveUpsertKeys: Migration = {
  id: 25,
  name: 'cognitive-upsert-keys',
  up(ctx) {
    if (needsKey(ctx, 'tmr_cues', 'card_id')) {
      // Keep the newest row per card, carrying the summed cue counters into it.
      ctx.raw.exec(`
        UPDATE tmr_cues SET
          times_cued_awake = (SELECT SUM(t2.times_cued_awake) FROM tmr_cues t2 WHERE t2.card_id = tmr_cues.card_id),
          times_cued_sleep = (SELECT SUM(t2.times_cued_sleep) FROM tmr_cues t2 WHERE t2.card_id = tmr_cues.card_id)
        WHERE rowid IN (SELECT MAX(rowid) FROM tmr_cues GROUP BY card_id HAVING COUNT(*) > 1);
        DELETE FROM tmr_cues WHERE rowid NOT IN (SELECT MAX(rowid) FROM tmr_cues GROUP BY card_id);
      `)
      ctx.createIndex('tmr_cues_card_unique_idx', 'tmr_cues', ['card_id'], { unique: true })
    }
    if (needsKey(ctx, 'palace_3d_scenes', 'palace_id')) {
      // A scene is replaced wholesale on save — the newest one wins.
      ctx.raw.exec(
        'DELETE FROM palace_3d_scenes WHERE rowid NOT IN (SELECT MAX(rowid) FROM palace_3d_scenes GROUP BY palace_id);',
      )
      ctx.createIndex('palace_3d_scenes_palace_unique_idx', 'palace_3d_scenes', ['palace_id'], {
        unique: true,
      })
    }
  },
}
