/**
 * 013 — Desktop & Mobile Power Tools:
 * - `quick_captures` stores instant inbox captures from the global desktop hotkey / HUD.
 * - `card_embeddings` stores high-dimensional vector embeddings for semantic search.
 */
import type { Migration } from './runner'

export const powerTools: Migration = {
  id: 13,
  name: 'power-tools',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "quick_captures" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "text" TEXT NOT NULL,
      "source_url" TEXT,
      "source_title" TEXT,
      "tags" TEXT,
      "processed" INTEGER NOT NULL DEFAULT 0,
      "created_at" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "quick_captures_processed_idx" ON "quick_captures" ("processed");

    CREATE TABLE IF NOT EXISTS "card_embeddings" (
      "card_id" INTEGER PRIMARY KEY NOT NULL REFERENCES "cards"("id") ON DELETE CASCADE,
      "embedding" TEXT NOT NULL,
      "model" TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
      "updated_at" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "card_embeddings_model_idx" ON "card_embeddings" ("model");`)
  },
}
