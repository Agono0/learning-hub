/**
 * @file engine.ts
 * @description Shared Material Channels (lh-share/v2) — pure domain logic.
 *
 * Extends the one-shot lh-share/v1 envelope into versioned channels: a
 * creator publishes a deck or course as a channel, then publishes updates;
 * subscribers pull new versions and merge them into their local copies
 * WITHOUT losing their own work. The merge rules are the heart of the
 * design and follow the user's product decision that updates must account
 * for personal notes and progress:
 *
 * 1. Learner state is sacred: scheduling state (FSRS), notes, progress and
 *    locally created items are never modified by an incoming update.
 * 2. Channel-owned fields (the published content itself) update in place
 *    when the learner has not diverged from the channel version they hold.
 * 3. A conflict arises only when the learner edited the same channel-owned
 *    content the publisher changed; conflicts are recorded and the learner's
 *    version wins by default (never silently overwritten).
 * 4. Updates are idempotent: applying the same version twice changes nothing
 *    the second time.
 *
 * Visibility follows the approved product decision: creators choose per
 * channel between 'link' (anyone with the channel link may subscribe) and
 * 'invite' (subscription requires an invite token issued by the creator).
 * Author identity is a learner-chosen handle, never a real name.
 */

import { z } from 'zod'

import { computeEnvelopeChecksum } from '../share/index'

/* ==========================================================================
 * SCHEMAS
 * ========================================================================== */

export const ChannelVisibilitySchema = z.enum(['link', 'invite'])
export type ChannelVisibility = z.infer<typeof ChannelVisibilitySchema>

export const ChannelContentTypeSchema = z.enum(['deck', 'course'])
export type ChannelContentType = z.infer<typeof ChannelContentTypeSchema>

/** One published item inside a channel payload (card, lesson, ...). */
export const ChannelItemSchema = z.object({
  /** Stable id assigned by the publisher; never reused across versions. */
  id: z.string().min(1),
  /** Publisher-owned content; updates flow to subscribers. */
  content: z.record(z.string(), z.unknown()),
  /** Monotonic per-item revision, bumped by the publisher on every change. */
  revision: z.number().int().nonnegative(),
})
export type ChannelItem = z.infer<typeof ChannelItemSchema>

/** One version in a channel's history. */
export const ChannelVersionSchema = z.object({
  version: z.number().int().positive(),
  publishedAt: z.string(),
  changelog: z.string().max(500).default(''),
  /** Checksum over this version's items, for integrity verification. */
  checksum: z.string().min(4),
  items: z.array(ChannelItemSchema),
})
export type ChannelVersion = z.infer<typeof ChannelVersionSchema>

/** The public manifest of a channel: what a subscriber fetches. */
export const ChannelManifestSchema = z.object({
  v: z.literal(2),
  schema: z.literal('lh-share/v2'),
  channelId: z.string().min(1),
  type: ChannelContentTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(1000).default(''),
  /** Learner-chosen handle; never a real name. */
  authorHandle: z.string().min(1).max(50),
  visibility: ChannelVisibilitySchema,
  createdAt: z.string(),
  currentVersion: z.number().int().positive(),
  versions: z.array(ChannelVersionSchema).min(1),
})
export type ChannelManifest = z.infer<typeof ChannelManifestSchema>

/** A learner's local subscription record. */
export const SubscriptionSchema = z.object({
  channelId: z.string().min(1),
  /** Version the learner currently holds locally. */
  localVersion: z.number().int().nonnegative(),
  subscribedAt: z.string(),
  lastSyncAt: z.string().nullable(),
})
export type Subscription = z.infer<typeof SubscriptionSchema>

/** One local item with learner-owned state kept apart from channel content. */
export const LocalItemSchema = z.object({
  /** Channel item id this local item mirrors, or null for learner-created. */
  channelItemId: z.string().nullable(),
  /** The channel content as last synced (the merge base). */
  channelContent: z.record(z.string(), z.unknown()).nullable(),
  /** Revision of channelContent as last synced. */
  channelRevision: z.number().int().nonnegative().nullable(),
  /** Learner's current content; may diverge from channelContent. */
  localContent: z.record(z.string(), z.unknown()),
  /** Learner-owned state an update must never touch (notes, scheduling, progress). */
  learnerState: z.record(z.string(), z.unknown()).default({}),
})
export type LocalItem = z.infer<typeof LocalItemSchema>

/** The result of applying one channel update to local state. */
export const MergeResultSchema = z.object({
  addedCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  removedCount: z.number().int().nonnegative(),
  conflictCount: z.number().int().nonnegative(),
  /** Channel item ids where the learner's edits won over the update. */
  conflicts: z.array(z.string()),
  /** New local version after the merge. */
  newVersion: z.number().int().positive(),
})
export type MergeResult = z.infer<typeof MergeResultSchema>

/* ==========================================================================
 * PUBLISHING
 * ========================================================================== */

/** Create a new channel manifest at version 1. */
export function createChannel(input: {
  channelId: string
  type: ChannelContentType
  title: string
  authorHandle: string
  visibility: ChannelVisibility
  items: { id: string; content: Record<string, unknown> }[]
  description?: string
  changelog?: string
  now?: string
}): ChannelManifest {
  const now = input.now ?? new Date().toISOString()
  const items: ChannelItem[] = input.items.map((i) => ({
    id: i.id,
    content: i.content,
    revision: 1,
  }))
  const version: ChannelVersion = {
    version: 1,
    publishedAt: now,
    changelog: input.changelog ?? 'Initial publication',
    checksum: computeEnvelopeChecksum(items),
    items,
  }
  return ChannelManifestSchema.parse({
    v: 2,
    schema: 'lh-share/v2',
    channelId: input.channelId,
    type: input.type,
    title: input.title,
    description: input.description ?? '',
    authorHandle: input.authorHandle,
    visibility: input.visibility,
    createdAt: now,
    currentVersion: 1,
    versions: [version],
  })
}

/**
 * Publish a new version. `changes` lists the items as they should exist in
 * the new version; revisions bump automatically for changed items. Items
 * absent from `changes` are removed from the channel.
 */
export function publishUpdate(
  manifest: ChannelManifest,
  changes: { id: string; content: Record<string, unknown> }[],
  changelog: string,
  now?: string,
): ChannelManifest {
  const latest = manifest.versions[manifest.versions.length - 1]
  const prevById = new Map(latest.items.map((i) => [i.id, i]))
  const items: ChannelItem[] = changes.map((c) => {
    const prev = prevById.get(c.id)
    const changed = !prev || JSON.stringify(prev.content) !== JSON.stringify(c.content)
    return {
      id: c.id,
      content: c.content,
      revision: prev ? (changed ? prev.revision + 1 : prev.revision) : 1,
    }
  })
  const version: ChannelVersion = {
    version: manifest.currentVersion + 1,
    publishedAt: now ?? new Date().toISOString(),
    changelog: changelog.slice(0, 500),
    checksum: computeEnvelopeChecksum(items),
    items,
  }
  return ChannelManifestSchema.parse({
    ...manifest,
    currentVersion: version.version,
    versions: [...manifest.versions, version],
  })
}

/* ==========================================================================
 * SUBSCRIPTION & MERGE
 * ========================================================================== */

export function subscribeToChannel(channelId: string, now?: string): Subscription {
  return {
    channelId,
    localVersion: 0,
    subscribedAt: now ?? new Date().toISOString(),
    lastSyncAt: null,
  }
}

/** Does this subscription have a pending update? */
export function hasPendingUpdate(subscription: Subscription, manifest: ChannelManifest): boolean {
  return manifest.currentVersion > subscription.localVersion
}

function contentEquals(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Merge one channel version into local items.
 *
 * Rules (see file header): learner state untouched; channel content updates
 * only where the learner has not diverged; learner-diverged items on a
 * changed channel item are conflicts and the learner's version wins;
 * items the publisher removed stay local (they may hold learner work) but
 * are detached from the channel (channelItemId kept, marked by absence in
 * the new version — reported as removedCount for UI surfacing).
 */
export function applyChannelUpdate(
  localItems: LocalItem[],
  version: ChannelVersion,
): { items: LocalItem[]; result: MergeResult } {
  const incoming = new Map(version.items.map((i) => [i.id, i]))
  const items: LocalItem[] = []
  const conflicts: string[] = []
  let addedCount = 0
  let updatedCount = 0
  let removedCount = 0
  const seen = new Set<string>()

  for (const local of localItems) {
    if (local.channelItemId === null) {
      items.push(local) // learner-created: untouched
      continue
    }
    seen.add(local.channelItemId)
    const inc = incoming.get(local.channelItemId)
    if (!inc) {
      removedCount += 1
      items.push(local) // publisher removed it; keep the local copy and its learner state
      continue
    }
    const learnerDiverged =
      local.channelContent !== null && !contentEquals(local.channelContent, local.localContent)
    const channelChanged = local.channelRevision === null || inc.revision > local.channelRevision
    if (!channelChanged) {
      items.push(local) // nothing new for this item (idempotent re-apply lands here)
      continue
    }
    if (learnerDiverged) {
      conflicts.push(local.channelItemId)
      items.push({
        ...local,
        // Record the new base so the conflict is not re-reported for the
        // same channel revision; the learner's content still wins.
        channelContent: inc.content,
        channelRevision: inc.revision,
      })
      continue
    }
    // Clean fast-forward: adopt the new channel content, keep learner state.
    items.push({
      ...local,
      channelContent: inc.content,
      channelRevision: inc.revision,
      localContent: inc.content,
    })
    updatedCount += 1
  }

  // Brand-new items from the publisher.
  for (const inc of version.items) {
    if (seen.has(inc.id)) continue
    items.push({
      channelItemId: inc.id,
      channelContent: inc.content,
      channelRevision: inc.revision,
      localContent: inc.content,
      learnerState: {},
    })
    addedCount += 1
  }

  return {
    items,
    result: {
      addedCount,
      updatedCount,
      removedCount,
      conflictCount: conflicts.length,
      conflicts,
      newVersion: version.version,
    },
  }
}

/**
 * Resolve a recorded conflict by choosing the channel version after all
 * (the learner explicitly accepts the publisher's content for that item).
 */
export function acceptChannelVersion(local: LocalItem, version: ChannelVersion): LocalItem {
  if (local.channelItemId === null) return local
  const inc = version.items.find((i) => i.id === local.channelItemId)
  if (!inc) return local
  return {
    ...local,
    channelContent: inc.content,
    channelRevision: inc.revision,
    localContent: inc.content,
  }
}

/** Verify a manifest's integrity: every version's checksum must hold. */
export function verifyManifest(manifest: ChannelManifest): { ok: boolean; badVersions: number[] } {
  const bad: number[] = []
  for (const v of manifest.versions) {
    if (computeEnvelopeChecksum(v.items) !== v.checksum) bad.push(v.version)
  }
  return { ok: bad.length === 0, badVersions: bad }
}
