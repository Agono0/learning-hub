/**
 * 015 — Multiplayer Guilds, 1v1 Duels & Seasonal Progression:
 * - `guilds` and `guild_members` for collaborative study clans and pooled XP.
 * - `seasonal_progress` for 30-tier season pass tracking.
 * - `review_duels` for 1v1 rapid-recall duel match history.
 */
import type { Migration } from './runner'

export const guildsSeasons: Migration = {
  id: 15,
  name: 'guilds-seasons',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "guilds" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "name" TEXT NOT NULL UNIQUE,
      "tag" TEXT NOT NULL,
      "description" TEXT,
      "total_xp" INTEGER NOT NULL DEFAULT 0,
      "level" INTEGER NOT NULL DEFAULT 1,
      "avatar_emoji" TEXT NOT NULL DEFAULT '🛡️',
      "created_at" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "guilds_total_xp_idx" ON "guilds" ("total_xp");

    CREATE TABLE IF NOT EXISTS "guild_members" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "guild_id" INTEGER NOT NULL REFERENCES "guilds"("id") ON DELETE CASCADE,
      "alias" TEXT NOT NULL,
      "role" TEXT NOT NULL DEFAULT 'member',
      "xp_contributed" INTEGER NOT NULL DEFAULT 0,
      "joined_at" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "guild_members_guild_idx" ON "guild_members" ("guild_id");
    CREATE INDEX IF NOT EXISTS "guild_members_alias_idx" ON "guild_members" ("alias");

    CREATE TABLE IF NOT EXISTS "seasonal_progress" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "season_id" TEXT NOT NULL DEFAULT 'season-1',
      "season_xp" INTEGER NOT NULL DEFAULT 0,
      "tier" INTEGER NOT NULL DEFAULT 0,
      "claimed_rewards" TEXT DEFAULT '[]',
      "updated_at" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "seasonal_progress_season_idx" ON "seasonal_progress" ("season_id");

    CREATE TABLE IF NOT EXISTS "review_duels" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "player1_alias" TEXT NOT NULL,
      "player2_alias" TEXT NOT NULL,
      "winner_alias" TEXT,
      "player1_score" INTEGER NOT NULL DEFAULT 0,
      "player2_score" INTEGER NOT NULL DEFAULT 0,
      "completed_at" TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "review_duels_completed_idx" ON "review_duels" ("completed_at");`)
  },
}
