/**
 * 019 — Omniverse embeddings: a generic `embeddings` table that indexes ANY
 * knowledge surface (notes, cards, lessons, highlights, journal entries,
 * sources, ideas…) for cosine "related content" and semantic search.
 *
 * `card_embeddings` predates this and stays untouched (compat); new writers
 * use this table. Vectors are JSON number arrays produced on-device by
 * MiniLM (see apps/web/src/lib/embeddings-client.ts) — nothing leaves the
 * machine.
 */
import type { Migration } from './runner'

export const embeddingsOmni: Migration = {
  id: 19,
  name: 'embeddings-omni',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "embeddings" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "kind" TEXT NOT NULL,
      "ref_id" INTEGER NOT NULL,
      "dim" INTEGER NOT NULL,
      "vector" TEXT NOT NULL,
      "model" TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
      "updated_at" TEXT NOT NULL
    );`)
    ctx.raw.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS embeddings_kind_ref_idx ON "embeddings" ("kind", "ref_id");`,
    )
    ctx.raw.exec(
      `CREATE INDEX IF NOT EXISTS embeddings_kind_model_idx ON "embeddings" ("kind", "model");`,
    )
  },
}
