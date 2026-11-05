/**
 * 004 — FSRS-6 per-deck presets, global personalized weights, and append-only
 * `revlog_undos` tombstones.
 *
 * Keeps `revlog` strictly append-only (Hard Rule #8) while excluding undone
 * reviews from `v_true_retention`, `v_daily_reviews`, and FSRS optimization.
 */
import type { Migration } from './runner'

export const fsrsAndUndo: Migration = {
  id: 4,
  name: 'fsrs-and-undo',
  up(ctx) {
    ctx.addColumn('decks', 'desired_retention', 'REAL')
    ctx.addColumn('decks', 'fsrs_weights', 'TEXT')
    ctx.addColumn('user_settings', 'fsrs_weights', 'TEXT')

    if (ctx.hasTable('revlog')) {
      ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "revlog_undos" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "revlog_id" INTEGER NOT NULL,
        "card_id" INTEGER NOT NULL,
        "undone_at" TEXT NOT NULL
      );`)
      ctx.createIndex('revlog_undos_revlog_idx', 'revlog_undos', ['revlog_id'], { unique: true })
      ctx.createIndex('revlog_undos_card_idx', 'revlog_undos', ['card_id'])

      ctx.raw.exec('DROP VIEW IF EXISTS v_true_retention;')
      ctx.raw.exec(`CREATE VIEW v_true_retention AS
        SELECT count(*) AS total,
               sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS retained,
               round(100.0 * sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) / count(*), 1) AS retention_pct
        FROM revlog
        WHERE state >= 2
          AND NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id);`)

      ctx.raw.exec('DROP VIEW IF EXISTS v_daily_reviews;')
      ctx.raw.exec(`CREATE VIEW v_daily_reviews AS
        SELECT substr(reviewed_at, 1, 10) AS day, count(*) AS reviews,
               sum(CASE WHEN rating > 1 THEN 1 ELSE 0 END) AS correct,
               round(avg(time_ms)) AS avg_time_ms
        FROM revlog
        WHERE NOT EXISTS (SELECT 1 FROM revlog_undos u WHERE u.revlog_id = revlog.id)
        GROUP BY substr(reviewed_at, 1, 10);`)
    }
  },
}
