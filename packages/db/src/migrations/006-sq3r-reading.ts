/**
 * 006 — SQ3R guided reading sessions (`sq3r_sessions`: Survey, Question, Read,
 * Recite, Review state linked 1:1 with `sources`).
 */
import type { Migration } from './runner'

export const sq3rReading: Migration = {
  id: 6,
  name: 'sq3r-reading',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "sq3r_sessions" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "source_id" INTEGER NOT NULL REFERENCES "sources"("id") ON DELETE CASCADE,
      "survey_headings" TEXT DEFAULT '[]' NOT NULL,
      "questions" TEXT DEFAULT '[]' NOT NULL,
      "recite_notes" TEXT DEFAULT '' NOT NULL,
      "completed_steps" TEXT DEFAULT '[]' NOT NULL,
      "updated_at" TEXT NOT NULL
    );`)
    ctx.createIndex('sq3r_sessions_source_idx', 'sq3r_sessions', ['source_id'], {
      unique: true,
    })
  },
}
