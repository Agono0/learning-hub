/**
 * 016 — 3D Low-Poly World, Verified Study Coins & Timers:
 * - `user_avatars` for 3D character customizations, equipped gear, and unlocked items.
 * - `forest_plots` for trees planted in the 3D world from verified focus sessions.
 * - `study_coin_ledger` append-only cryptographic transaction ledger.
 * - `market_items` catalog of characters, hats, trees, and timer themes.
 * - `user_world_settings` for camera mode, timer theme, and integration mode preferences.
 */
import type { Migration } from './runner'
import { DEFAULT_MARKET_CATALOG } from '@learning-hub/core/world'
import { computeLedgerSignature, GENESIS_LEDGER_HASH } from '@learning-hub/core/world'

export const forestWorldEconomy: Migration = {
  id: 16,
  name: 'forest-world-economy',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "user_avatars" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "user_id" TEXT NOT NULL UNIQUE DEFAULT 'default',
      "character_id" TEXT NOT NULL DEFAULT 'char_apprentice',
      "equipped_head" TEXT,
      "equipped_hand" TEXT,
      "equipped_skin" TEXT NOT NULL DEFAULT 'default',
      "unlocked_characters" TEXT NOT NULL DEFAULT '["char_apprentice"]',
      "unlocked_items" TEXT NOT NULL DEFAULT '[]',
      "unlocked_trees" TEXT NOT NULL DEFAULT '["tree_oak","tree_pine"]',
      "updated_at" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "user_avatars_user_idx" ON "user_avatars" ("user_id");

    CREATE TABLE IF NOT EXISTS "forest_plots" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "user_id" TEXT NOT NULL DEFAULT 'default',
      "tree_type" TEXT NOT NULL DEFAULT 'tree_oak',
      "growthStage" TEXT NOT NULL DEFAULT 'mature',
      "pos_x" REAL NOT NULL DEFAULT 0,
      "pos_y" REAL NOT NULL DEFAULT 0,
      "pos_z" REAL NOT NULL DEFAULT 0,
      "focus_session_id" TEXT,
      "duration_minutes" INTEGER NOT NULL DEFAULT 25,
      "created_at" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "forest_plots_user_idx" ON "forest_plots" ("user_id");
    CREATE INDEX IF NOT EXISTS "forest_plots_created_idx" ON "forest_plots" ("created_at");

    CREATE TABLE IF NOT EXISTS "study_coin_ledger" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "user_id" TEXT NOT NULL DEFAULT 'default',
      "amount" INTEGER NOT NULL,
      "balance_after" INTEGER NOT NULL,
      "reason" TEXT NOT NULL,
      "reference_id" TEXT,
      "signature" TEXT NOT NULL,
      "created_at" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "study_coin_ledger_user_idx" ON "study_coin_ledger" ("user_id");
    CREATE INDEX IF NOT EXISTS "study_coin_ledger_created_idx" ON "study_coin_ledger" ("created_at");

    CREATE TABLE IF NOT EXISTS "market_items" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "category" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT NOT NULL,
      "price_coins" INTEGER NOT NULL,
      "rarity" TEXT NOT NULL DEFAULT 'common',
      "preview_props" TEXT,
      "is_default" INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS "market_items_category_idx" ON "market_items" ("category");

    CREATE TABLE IF NOT EXISTS "user_world_settings" (
      "user_id" TEXT PRIMARY KEY NOT NULL DEFAULT 'default',
      "view_mode" TEXT NOT NULL DEFAULT 'hybrid',
      "timer_theme" TEXT NOT NULL DEFAULT 'tree',
      "integration_mode" TEXT NOT NULL DEFAULT 'dedicated',
      "soundscape" TEXT NOT NULL DEFAULT 'birds',
      "low_poly_quality" TEXT NOT NULL DEFAULT 'high',
      "updated_at" TEXT NOT NULL
    );`)

    // Seed default market items
    for (const item of DEFAULT_MARKET_CATALOG) {
      const previewJson = item.previewProps
        ? JSON.stringify(item.previewProps).replace(/'/g, "''")
        : null
      const desc = item.description.replace(/'/g, "''")
      const name = item.name.replace(/'/g, "''")
      ctx.raw
        .exec(`INSERT OR IGNORE INTO "market_items" ("id", "category", "name", "description", "price_coins", "rarity", "preview_props", "is_default")
        VALUES ('${item.id}', '${item.category}', '${name}', '${desc}', ${item.priceCoins}, '${item.rarity}', ${previewJson ? `'${previewJson}'` : 'NULL'}, ${item.isDefault ? 1 : 0});`)
    }

    // Seed default user avatar if not existing
    const now = new Date().toISOString()
    ctx.raw
      .exec(`INSERT OR IGNORE INTO "user_avatars" ("user_id", "character_id", "equipped_head", "equipped_hand", "equipped_skin", "unlocked_characters", "unlocked_items", "unlocked_trees", "updated_at")
      VALUES ('default', 'char_apprentice', NULL, NULL, 'default', '["char_apprentice"]', '[]', '["tree_oak","tree_pine"]', '${now}');`)

    // Seed default world settings if not existing
    ctx.raw
      .exec(`INSERT OR IGNORE INTO "user_world_settings" ("user_id", "view_mode", "timer_theme", "integration_mode", "soundscape", "low_poly_quality", "updated_at")
      VALUES ('default', 'hybrid', 'tree', 'dedicated', 'birds', 'high', '${now}');`)

    // Seed welcome coins if ledger is empty for default user
    const tx = {
      userId: 'default',
      amount: 50,
      balanceAfter: 50,
      reason: 'welcome_bonus',
      referenceId: 'welcome',
      createdAt: now,
    }
    const sig = computeLedgerSignature(GENESIS_LEDGER_HASH, tx)
    ctx.raw
      .exec(`INSERT INTO "study_coin_ledger" ("user_id", "amount", "balance_after", "reason", "reference_id", "signature", "created_at")
      SELECT 'default', 50, 50, 'welcome_bonus', 'welcome', '${sig}', '${now}'
      WHERE NOT EXISTS (SELECT 1 FROM "study_coin_ledger" WHERE "user_id" = 'default');`)
  },
}
