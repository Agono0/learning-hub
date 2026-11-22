/**
 * 035 — task-fts (S3-67): FTS5 shadow table for SP task search, mirroring the
 * 003 fts-search house pattern exactly (probe → virtual table → sync triggers
 * → DELETE+INSERT backfill; runs identically on better-sqlite3 and the wasm
 * driver; bails out safely if FTS5 is ever absent — search degrades to LIKE).
 *
 * Indexed text: title + notes (the fields core/tasks/search.ts ranks on).
 * Sync triggers keep `fts_task_items` aligned with `task_items` on
 * insert/update/delete. Backfill is DELETE+INSERT (idempotent re-run).
 *
 * Non-drizzle object: excluded from the DDL-clone test helpers and from
 * backup whitelists (FTS rows are derived — AGENTS.md "Change the database").
 */
import type { Migration } from './runner'

export const taskFts: Migration = {
  id: 35,
  name: 'task-fts',
  up(ctx) {
    try {
      ctx.raw.exec('CREATE VIRTUAL TABLE IF NOT EXISTS fts_fts5probe USING fts5(x)')
      ctx.raw.exec('DROP TABLE IF EXISTS fts_fts5probe')
    } catch {
      return
    }

    if (ctx.hasTable('task_items')) {
      ctx.raw.exec(
        `CREATE VIRTUAL TABLE IF NOT EXISTS fts_task_items USING fts5(ref UNINDEXED, text)`,
      )
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_task_items_ai`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_task_items_au`)
      ctx.raw.exec(`DROP TRIGGER IF EXISTS fts_task_items_ad`)
      ctx.raw.exec(`CREATE TRIGGER fts_task_items_ai AFTER INSERT ON "task_items" BEGIN
        INSERT INTO fts_task_items(ref, text) VALUES (new.id, new.title || ' ' || coalesce(new.notes, ''));
      END;`)
      ctx.raw.exec(`CREATE TRIGGER fts_task_items_au AFTER UPDATE ON "task_items" BEGIN
        DELETE FROM fts_task_items WHERE ref = old.id;
        INSERT INTO fts_task_items(ref, text) VALUES (new.id, new.title || ' ' || coalesce(new.notes, ''));
      END;`)
      ctx.raw.exec(`CREATE TRIGGER fts_task_items_ad AFTER DELETE ON "task_items" BEGIN
        DELETE FROM fts_task_items WHERE ref = old.id;
      END;`)
      ctx.raw.exec(`DELETE FROM fts_task_items;`)
      ctx.raw.exec(
        `INSERT INTO fts_task_items(ref, text) SELECT id, title || ' ' || coalesce(notes, '') FROM task_items;`,
      )
    }
  },
}
