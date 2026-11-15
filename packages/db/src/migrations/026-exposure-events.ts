/**
 * 026 — Ambient Exposure Ledger:
 * Appends `exposure_events` table for incidental vocabulary and technical term
 * encounters across reading, notes, and lessons (Krashen 1982, 1985; Nation 2001).
 * Append-only table conforming to AGENTS.md Rule 8.
 */
import type { Migration } from './runner'

export const exposureEventsMigration: Migration = {
  id: 26,
  name: 'exposure-events',
  up(ctx) {
    ctx.raw.exec(`
      CREATE TABLE IF NOT EXISTS "exposure_events" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        "token" TEXT NOT NULL,
        "normalized" TEXT NOT NULL,
        "source_type" TEXT NOT NULL DEFAULT 'reading',
        "source_id" INTEGER,
        "context_snippet" TEXT,
        "created_at" TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "exposure_events_normalized_idx" ON "exposure_events" ("normalized");
      CREATE INDEX IF NOT EXISTS "exposure_events_created_idx" ON "exposure_events" ("created_at");
    `)
  },
}
