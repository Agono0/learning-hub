/**
 * 020 — Web-push subscriptions: browser push endpoints so reminders arrive
 * even when the app is closed (pairs with the M18 service worker). VAPID keys
 * are provided out-of-band (env / settings), subscriptions live here.
 */
import type { Migration } from './runner'

export const pushSubscriptions: Migration = {
  id: 20,
  name: 'push-subscriptions',
  up(ctx) {
    ctx.raw.exec(`CREATE TABLE IF NOT EXISTS "push_subscriptions" (
      "id" INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      "endpoint" TEXT NOT NULL UNIQUE,
      "keys_json" TEXT NOT NULL,
      "created_at" TEXT NOT NULL
    );`)
  },
}
