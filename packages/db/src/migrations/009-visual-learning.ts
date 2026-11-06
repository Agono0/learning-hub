/**
 * 009 — Visual Learning schema expansion:
 * - `mindmaps` table for spatial concepts and hierarchical diagrams.
 * - `card_attempt_images` append-only audit trail of handwritten / sketch answers.
 */
import type { Migration } from './runner'

export const visualLearning: Migration = {
  id: 9,
  name: 'visual-learning',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "mindmaps" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "title" TEXT NOT NULL,
      "nodes_json" TEXT NOT NULL,
      "edges_json" TEXT NOT NULL DEFAULT '[]',
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    );`)

    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "card_attempt_images" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "card_id" INTEGER NOT NULL REFERENCES "cards"("id"),
      "review_id" INTEGER,
      "image_data" TEXT NOT NULL,
      "created_at" TEXT NOT NULL
    );`)
    ctx.createIndex('card_attempt_images_card_id_idx', 'card_attempt_images', ['card_id'])
  },
}
