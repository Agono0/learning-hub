/**
 * 017 — Marketplace companions & decor:
 * - `user_avatars.equipped_companion` for the pet that follows the scholar
 *   in the 3D world.
 * - Seeds the new companion/decor catalog entries into existing databases
 *   (migration 016 already seeded the original catalog; INSERT OR IGNORE keeps
 *   it idempotent and preserves purchased rows). Companion and decor purchases
 *   themselves reuse the existing `unlocked_items` JSON array — no new table.
 */
import { DEFAULT_MARKET_CATALOG } from '@learning-hub/core/world'
import type { Migration } from './runner'

export const companionDecor: Migration = {
  id: 17,
  name: 'companion-decor',
  up(ctx) {
    ctx.addColumn('user_avatars', 'equipped_companion', 'TEXT')

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
  },
}
