/** Local persistence for channel collections. */
import { desc, eq } from 'drizzle-orm'
import { ChannelCollectionSchema, type ChannelCollection } from '@learning-hub/core'
import { getDb, type LearningHubDB } from '../index'
import { channelCollections } from '../schema'

type Db = LearningHubDB

function parse(json: string): ChannelCollection {
  return ChannelCollectionSchema.parse(JSON.parse(json))
}

/** Create or replace a stored collection. */
export function saveCollection(
  collection: ChannelCollection,
  db: Db = getDb(),
): { ok: boolean; error?: string; collection?: ChannelCollection } {
  const checked = ChannelCollectionSchema.parse(collection)
  db.insert(channelCollections)
    .values({
      id: checked.id,
      collectionJson: JSON.stringify(checked),
      title: checked.title,
      ownerHandle: checked.ownerHandle,
      updatedAt: checked.updatedAt,
    })
    .onConflictDoUpdate({
      target: channelCollections.id,
      set: {
        collectionJson: JSON.stringify(checked),
        title: checked.title,
        ownerHandle: checked.ownerHandle,
        updatedAt: checked.updatedAt,
      },
    })
    .run()
  return { ok: true, collection: checked }
}

export function getCollection(id: string, db: Db = getDb()): ChannelCollection | undefined {
  const row = db.select().from(channelCollections).where(eq(channelCollections.id, id)).get()
  return row ? parse(row.collectionJson) : undefined
}

export function listCollections(
  db: Db = getDb(),
): { id: string; title: string; ownerHandle: string; channelCount: number; updatedAt: string }[] {
  return db
    .select()
    .from(channelCollections)
    .orderBy(desc(channelCollections.updatedAt))
    .all()
    .map((r) => ({
      id: r.id,
      title: r.title,
      ownerHandle: r.ownerHandle,
      channelCount: parse(r.collectionJson).channels.length,
      updatedAt: r.updatedAt,
    }))
}

export function deleteCollection(id: string, db: Db = getDb()): { ok: boolean; error?: string } {
  const res = db.delete(channelCollections).where(eq(channelCollections.id, id)).run()
  return res.changes > 0 ? { ok: true } : { ok: false, error: 'collection not found' }
}
