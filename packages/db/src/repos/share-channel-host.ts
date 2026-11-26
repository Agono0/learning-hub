/**
 * Local channel hosting: persists ChannelManifests so this instance serves as
 * a real channel host (HTTP transport fetches the manifest from it), and as
 * the anchor for subscription pull requests.
 */
import { desc, eq } from 'drizzle-orm'
import { ChannelManifestSchema, publishUpdate, type ChannelManifest } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { shareChannelManifests } from '../schema'

type Db = LearningHubDB

function parseManifest(json: string): ChannelManifest {
  return ChannelManifestSchema.parse(JSON.parse(json))
}

/** Host a new channel manifest. Fails if the channelId is already hosted. */
export function hostChannel(
  manifest: ChannelManifest,
  db: Db = getDb(),
): { ok: boolean; error?: string; manifest?: ChannelManifest } {
  const checked = ChannelManifestSchema.parse(manifest)
  const existing = db
    .select({ channelId: shareChannelManifests.channelId })
    .from(shareChannelManifests)
    .where(eq(shareChannelManifests.channelId, checked.channelId))
    .get()
  if (existing) return { ok: false, error: `channel '${checked.channelId}' is already hosted` }
  db.insert(shareChannelManifests)
    .values({ channelId: checked.channelId, manifestJson: JSON.stringify(checked) })
    .run()
  return { ok: true, manifest: checked }
}

export function getHostedChannel(channelId: string, db: Db = getDb()): ChannelManifest | undefined {
  const row = db
    .select()
    .from(shareChannelManifests)
    .where(eq(shareChannelManifests.channelId, channelId))
    .get()
  return row ? parseManifest(row.manifestJson) : undefined
}

/** List hosted channels, newest activity first. */
export function listHostedChannels(
  db: Db = getDb(),
): { channelId: string; title: string; currentVersion: number; updatedAt: string }[] {
  return db
    .select()
    .from(shareChannelManifests)
    .orderBy(desc(shareChannelManifests.updatedAt))
    .all()
    .map((r) => {
      const m = parseManifest(r.manifestJson)
      return {
        channelId: m.channelId,
        title: m.title,
        currentVersion: m.currentVersion,
        updatedAt: r.updatedAt,
      }
    })
}

/** Publish the next version of a hosted channel. */
export function publishHostedChannelVersion(
  input: {
    channelId: string
    items: { id: string; content: Record<string, unknown> }[]
    changelog: string
    now?: string
  },
  db: Db = getDb(),
): { ok: boolean; error?: string; manifest?: ChannelManifest } {
  return db.transaction((tx) => {
    const row = tx
      .select()
      .from(shareChannelManifests)
      .where(eq(shareChannelManifests.channelId, input.channelId))
      .get()
    if (!row) return { ok: false, error: `channel '${input.channelId}' is not hosted here` }
    const manifest = parseManifest(row.manifestJson)
    const updated = publishUpdate(manifest, input.items, input.changelog, input.now)
    tx.update(shareChannelManifests)
      .set({ manifestJson: JSON.stringify(updated), updatedAt: new Date().toISOString() })
      .where(eq(shareChannelManifests.channelId, input.channelId))
      .run()
    return { ok: true, manifest: updated }
  })
}

export function unhostChannel(
  channelId: string,
  db: Db = getDb(),
): { ok: boolean; error?: string } {
  const res = db
    .delete(shareChannelManifests)
    .where(eq(shareChannelManifests.channelId, channelId))
    .run()
  return res.changes > 0 ? { ok: true } : { ok: false, error: 'channel not hosted here' }
}
