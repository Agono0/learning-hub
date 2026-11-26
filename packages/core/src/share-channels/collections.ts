import { z } from 'zod'
import { ChannelManifestSchema, type ChannelManifest } from './engine'

/**
 * Channel collections: a named, portable bundle of channel manifests. A
 * creator shares one collection JSON instead of N manifests; subscribers
 * paste it once and subscribe to every channel in it. Collections are
 * snapshots — they travel like manifests (copy/paste, static hosting) and
 * refresh through each channel's own sync path.
 */

export const COLLECTION_SCHEMA = 'lh-share-collection/v1'

export const ChannelCollectionSchema = z.object({
  schema: z.literal(COLLECTION_SCHEMA),
  id: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  ownerHandle: z.string().min(1).max(50),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
  channels: z.array(ChannelManifestSchema).min(1),
})
export type ChannelCollection = z.infer<typeof ChannelCollectionSchema>

export interface CollectionInput {
  id: string
  title: string
  description?: string
  ownerHandle: string
  channels: ChannelManifest[]
  now?: string
}

export function createCollection(input: CollectionInput): ChannelCollection {
  const now = input.now ?? new Date().toISOString()
  return ChannelCollectionSchema.parse({
    schema: COLLECTION_SCHEMA,
    id: input.id,
    title: input.title,
    description: input.description ?? '',
    ownerHandle: input.ownerHandle,
    createdAt: now,
    updatedAt: now,
    channels: input.channels,
  })
}

/** Replace the stored snapshot for a channel (or add it), bumping updatedAt. */
export function upsertCollectionChannel(
  collection: ChannelCollection,
  manifest: ChannelManifest,
  now?: string,
): ChannelCollection {
  const checked = ChannelManifestSchema.parse(manifest)
  const rest = collection.channels.filter((c) => c.channelId !== checked.channelId)
  return ChannelCollectionSchema.parse({
    ...collection,
    updatedAt: now ?? new Date().toISOString(),
    channels: [...rest, checked],
  })
}

export function removeCollectionChannel(
  collection: ChannelCollection,
  channelId: string,
  now?: string,
): { ok: boolean; error?: string; collection?: ChannelCollection } {
  const next = collection.channels.filter((c) => c.channelId !== channelId)
  if (next.length === collection.channels.length) {
    return { ok: false, error: `channel '${channelId}' is not in this collection` }
  }
  if (next.length === 0) {
    return { ok: false, error: 'a collection cannot be empty — delete it instead' }
  }
  return {
    ok: true,
    collection: ChannelCollectionSchema.parse({
      ...collection,
      updatedAt: now ?? new Date().toISOString(),
      channels: next,
    }),
  }
}

/** What subscribe-all would do, without touching state. */
export function planCollectionSubscription(
  collection: ChannelCollection,
  alreadySubscribed: string[],
): { toSubscribe: string[]; alreadyHave: string[] } {
  const have = new Set(alreadySubscribed)
  const toSubscribe = collection.channels.map((c) => c.channelId).filter((id) => !have.has(id))
  return {
    toSubscribe,
    alreadyHave: collection.channels.map((c) => c.channelId).filter((id) => have.has(id)),
  }
}
