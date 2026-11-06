/**
 * 014 — Adaptive Knowledge Graph & Anki Sync:
 * - `concept_dependencies` stores curriculum prerequisite edges with strength weights.
 * - `anki_sync_mappings` maps Learning HUB cards to Anki note & card IDs.
 */
import type { Migration } from './runner'

export const knowledgeGraph: Migration = {
  id: 14,
  name: 'knowledge-graph',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "concept_dependencies" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "source_concept" TEXT NOT NULL,
      "target_concept" TEXT NOT NULL,
      "strength" REAL NOT NULL DEFAULT 1.0,
      "created_at" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "concept_dep_source_idx" ON "concept_dependencies" ("source_concept");
    CREATE INDEX IF NOT EXISTS "concept_dep_target_idx" ON "concept_dependencies" ("target_concept");

    CREATE TABLE IF NOT EXISTS "anki_sync_mappings" (
      "card_id" INTEGER PRIMARY KEY NOT NULL REFERENCES "cards"("id") ON DELETE CASCADE,
      "anki_note_id" INTEGER NOT NULL,
      "anki_card_id" INTEGER,
      "sync_mode" TEXT NOT NULL DEFAULT 'live_loopback',
      "last_sync_at" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "anki_mappings_note_idx" ON "anki_sync_mappings" ("anki_note_id");`)
  },
}
