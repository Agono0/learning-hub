/**
 * Learning HUB — Online Engagement DB Repository.
 *
 * Manages device-local identity, online preferences, registered worker servers,
 * and the append-only inbox.
 */
import { rowLimit } from '../limits'
import { desc, eq } from 'drizzle-orm'
import { onlineIdentity, onlineInbox, onlinePrefs, onlineServers } from '../schema'
import { getDb, type LearningHubDB } from '../index'
import { withTransaction } from '../transaction'

export const DEFAULT_ONLINE_SERVER = 'https://learning-hub-engagement.workers.dev'

// ─── Online Identity ────────────────────────────────────────────────────────

export function getOnlineIdentity(database?: LearningHubDB): typeof onlineIdentity.$inferSelect {
  const conn = database ?? getDb()
  const row = conn.select().from(onlineIdentity).limit(1).get()
  if (row) return row

  // Create default offline identity
  const defaultUserId = `usr_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
  const [created] = conn
    .insert(onlineIdentity)
    .values({
      mode: 'offline',
      userId: defaultUserId,
      alias: 'Learner',
      registeredAt: new Date().toISOString(),
    })
    .returning()
    .all()

  return created!
}

export function updateOnlineIdentity(
  updates: Partial<typeof onlineIdentity.$inferInsert>,
  database?: LearningHubDB,
): typeof onlineIdentity.$inferSelect {
  const conn = database ?? getDb()
  const current = getOnlineIdentity(conn)

  conn.update(onlineIdentity).set(updates).where(eq(onlineIdentity.id, current.id)).run()

  return conn.select().from(onlineIdentity).where(eq(onlineIdentity.id, current.id)).get()!
}

// ─── Online Preferences ─────────────────────────────────────────────────────

export function getOnlinePrefs(database?: LearningHubDB): typeof onlinePrefs.$inferSelect {
  const conn = database ?? getDb()
  const row = conn.select().from(onlinePrefs).limit(1).get()
  if (row) return row

  const [created] = conn
    .insert(onlinePrefs)
    .values({
      showOnLeaderboard: true,
      allowBuddyRequests: true,
      sharePresence: true,
    })
    .returning()
    .all()

  return created!
}

export function updateOnlinePrefs(
  updates: Partial<typeof onlinePrefs.$inferInsert>,
  database?: LearningHubDB,
): typeof onlinePrefs.$inferSelect {
  const conn = database ?? getDb()
  const current = getOnlinePrefs(conn)

  conn.update(onlinePrefs).set(updates).where(eq(onlinePrefs.id, current.id)).run()

  return conn.select().from(onlinePrefs).where(eq(onlinePrefs.id, current.id)).get()!
}

// ─── Worker Servers ─────────────────────────────────────────────────────────

export function getDefaultOnlineServer(database?: LearningHubDB): string {
  const conn = database ?? getDb()
  const server = conn
    .select()
    .from(onlineServers)
    .where(eq(onlineServers.isDefault, true))
    .limit(1)
    .get()

  return server?.url || DEFAULT_ONLINE_SERVER
}

/**
 * Saves a worker server and (optionally) makes it the default, atomically.
 * Saving a URL that is already known updates that row instead of adding a
 * duplicate, so toggling between servers doesn't grow the table.
 */
export function setOnlineServer(
  name: string,
  url: string,
  isDefault = true,
  database?: LearningHubDB,
): typeof onlineServers.$inferSelect {
  const conn = database ?? getDb()
  const cleanUrl = url.trim().replace(/\/+$/, '')

  return withTransaction((tx) => {
    if (isDefault) tx.update(onlineServers).set({ isDefault: false }).run()

    const existing = tx.select().from(onlineServers).where(eq(onlineServers.url, cleanUrl)).get()
    if (existing) {
      tx.update(onlineServers)
        .set({ name, isDefault: isDefault || existing.isDefault })
        .where(eq(onlineServers.id, existing.id))
        .run()
      return tx.select().from(onlineServers).where(eq(onlineServers.id, existing.id)).get()!
    }

    const [created] = tx
      .insert(onlineServers)
      .values({ name, url: cleanUrl, isDefault, createdAt: new Date().toISOString() })
      .returning()
      .all()
    return created!
  }, conn)
}

// ─── Inbox Messages (Append-only) ───────────────────────────────────────────

export function listInboxMessages(
  limit = 20,
  database?: LearningHubDB,
): (typeof onlineInbox.$inferSelect)[] {
  const conn = database ?? getDb()
  return conn
    .select()
    .from(onlineInbox)
    .orderBy(desc(onlineInbox.receivedAt))
    .limit(rowLimit(limit))
    .all()
}

export function addInboxMessage(
  msg: {
    kind: 'nudge' | 'invite' | 'achievement'
    senderAlias: string
    content: string
    meta?: Record<string, unknown>
  },
  database?: LearningHubDB,
): typeof onlineInbox.$inferSelect {
  const conn = database ?? getDb()
  const nowIso = new Date().toISOString()

  const [created] = conn
    .insert(onlineInbox)
    .values({
      kind: msg.kind,
      senderAlias: msg.senderAlias,
      content: msg.content,
      meta: msg.meta,
      read: false,
      receivedAt: nowIso,
    })
    .returning()
    .all()

  return created!
}

export function markInboxRead(id: number, database?: LearningHubDB): boolean {
  const conn = database ?? getDb()
  return (
    conn.update(onlineInbox).set({ read: true }).where(eq(onlineInbox.id, id)).run().changes > 0
  )
}
