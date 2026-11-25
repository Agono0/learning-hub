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

/* ==========================================================================
 * INVITE TOKENS (invite-only channels)
 * ========================================================================== */

/**
 * Issue an invite token for an invite-only channel. The token derives from
 * the channel id plus the creator's invite secret, so the creator can rotate
 * access by changing the secret (which invalidates all outstanding tokens).
 * Deterministic and offline-verifiable, matching the manual-mode guarantee.
 */
export function issueInviteToken(channelId: string, inviteSecret: string): string {
  return computeEnvelopeChecksum(`lh-invite:${channelId}:${inviteSecret}`)
}

/** Verify an invite token presented by a subscriber. */
export function verifyInviteToken(channelId: string, inviteSecret: string, token: string): boolean {
  return issueInviteToken(channelId, inviteSecret) === token.trim()
}

/**
 * Gate a subscription attempt on the channel's visibility. Link channels
 * accept anyone holding the manifest; invite channels require a valid token.
 * Returns a human-readable reason when refused.
 */
export function canSubscribe(
  manifest: ChannelManifest,
  inviteToken?: string,
  inviteSecret?: string,
): { allowed: boolean; reason?: string } {
  if (manifest.visibility === 'link') return { allowed: true }
  if (!inviteToken) {
    return {
      allowed: false,
      reason: 'This channel is invite-only; ask the creator for an invite token.',
    }
  }
  if (!inviteSecret) {
    // Subscriber-side check: without the creator's secret we cannot verify
    // locally, so the presence of a token is all the client can assert. The
    // creator verifies on their side with the secret.
    return { allowed: true }
  }
  return verifyInviteToken(manifest.channelId, inviteSecret, inviteToken)
    ? { allowed: true }
    : { allowed: false, reason: 'Invite token does not match this channel.' }
}

/* ==========================================================================
 * VERSION DIFFS & BATCH APPLICATION
 * ========================================================================== */

/** A human-readable summary of what changed between two versions. */
export interface VersionDiff {
  addedIds: string[]
  removedIds: string[]
  changedIds: string[]
  unchangedIds: string[]
}

/**
 * Diff two versions of a channel. Used to surface "what changed" to a
 * subscriber before they apply an update, and to sanity-check a changelog.
 */
export function diffVersions(from: ChannelVersion, to: ChannelVersion): VersionDiff {
  const fromMap = new Map(from.items.map((i) => [i.id, i]))
  const toMap = new Map(to.items.map((i) => [i.id, i]))
  const addedIds: string[] = []
  const changedIds: string[] = []
  const unchangedIds: string[] = []
  for (const item of to.items) {
    const prev = fromMap.get(item.id)
    if (!prev) addedIds.push(item.id)
    else if (prev.revision !== item.revision) changedIds.push(item.id)
    else unchangedIds.push(item.id)
  }
  const removedIds = from.items.filter((i) => !toMap.has(i.id)).map((i) => i.id)
  return { addedIds, removedIds, changedIds, unchangedIds }
}

/** All versions a subscriber is behind, oldest first. */
export function pendingVersions(
  subscription: Subscription,
  manifest: ChannelManifest,
): ChannelVersion[] {
  return manifest.versions.filter((v) => v.version > subscription.localVersion)
}

/**
 * Apply every pending version in order and fold the merge results. Because
 * each single-version merge is idempotent and learner-state-preserving, the
 * batch is too: intermediate conflicts are reported once per item (the last
 * version's state wins the base, the learner's content still wins the item).
 */
export function applyAllPendingVersions(
  localItems: LocalItem[],
  subscription: Subscription,
  manifest: ChannelManifest,
): { items: LocalItem[]; result: MergeResult; appliedVersions: number[] } {
  const pending = pendingVersions(subscription, manifest)
  let items = localItems
  const totals: MergeResult = {
    addedCount: 0,
    updatedCount: 0,
    removedCount: 0,
    conflictCount: 0,
    conflicts: [],
    newVersion: subscription.localVersion || 1,
  }
  const applied: number[] = []
  const conflictSet = new Set<string>()
  for (const version of pending) {
    const step = applyChannelUpdate(items, version)
    items = step.items
    totals.addedCount += step.result.addedCount
    totals.updatedCount += step.result.updatedCount
    totals.removedCount += step.result.removedCount
    for (const c of step.result.conflicts) conflictSet.add(c)
    totals.newVersion = version.version
    applied.push(version.version)
  }
  totals.conflictCount = conflictSet.size
  totals.conflicts = [...conflictSet].sort()
  return { items, result: totals, appliedVersions: applied }
}

/* ==========================================================================
 * V1 ENVELOPE MIGRATION
 * ========================================================================== */

/**
 * Upgrade a one-shot lh-share/v1 envelope into a v2 channel manifest at
 * version 1, so existing shared decks/courses can become living channels
 * without a fresh export. Item ids come from the envelope data's own id
 * fields when present, else positional ids are assigned deterministically.
 */
export function migrateV1Envelope(input: {
  envelope: {
    type: 'deck' | 'course'
    metadata: { title: string; author?: string; description?: string }
    data: Record<string, unknown>
  }
  channelId: string
  authorHandle: string
  visibility: ChannelVisibility
  now?: string
}): ChannelManifest {
  const rawItems = Array.isArray(input.envelope.data.items) ? input.envelope.data.items : []
  const items = rawItems.map((raw, idx) => {
    const obj = (raw ?? {}) as Record<string, unknown>
    const id = typeof obj.id === 'string' && obj.id.length > 0 ? obj.id : `item-${idx + 1}`
    return { id, content: obj }
  })
  return createChannel({
    channelId: input.channelId,
    type: input.envelope.type,
    title: input.envelope.metadata.title,
    authorHandle: input.authorHandle,
    visibility: input.visibility,
    items: items.length > 0 ? items : [{ id: 'item-1', content: input.envelope.data }],
    description: input.envelope.metadata.description,
    changelog: 'Migrated from an lh-share/v1 envelope',
    now: input.now,
  })
}

/* ==========================================================================
 * TYPED PAYLOADS (deck cards, course lessons)
 * ========================================================================== */

/** Payload shape for one card inside a deck channel. */
export const DeckCardPayloadSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
  hint: z.string().optional(),
  tags: z.array(z.string()).default([]),
})
export type DeckCardPayload = z.infer<typeof DeckCardPayloadSchema>

/** Payload shape for one lesson inside a course channel. */
export const CourseLessonPayloadSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  objectives: z.array(z.string()).default([]),
  estimatedMinutes: z.number().int().positive().optional(),
})
export type CourseLessonPayload = z.infer<typeof CourseLessonPayloadSchema>

export interface PayloadIssue {
  itemId: string
  message: string
}

/**
 * Validate every item payload in a version against the schema for the
 * channel's content type. Returns one issue per invalid item; empty means
 * the whole version is well-formed. Channels are transport-agnostic about
 * content, but creators and subscribers both benefit from catching malformed
 * payloads before they spread.
 */
export function validateVersionPayloads(
  type: ChannelContentType,
  version: ChannelVersion,
): PayloadIssue[] {
  const schema = type === 'deck' ? DeckCardPayloadSchema : CourseLessonPayloadSchema
  const issues: PayloadIssue[] = []
  for (const item of version.items) {
    const parsed = schema.safeParse(item.content)
    if (!parsed.success) {
      issues.push({
        itemId: item.id,
        message: parsed.error.issues
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; '),
      })
    }
  }
  return issues
}

/** Validate all versions in a manifest; returns issues keyed by version. */
export function validateManifestPayloads(manifest: ChannelManifest): {
  ok: boolean
  issues: { version: number; itemId: string; message: string }[]
} {
  const issues: { version: number; itemId: string; message: string }[] = []
  for (const v of manifest.versions) {
    for (const issue of validateVersionPayloads(manifest.type, v)) {
      issues.push({ version: v.version, ...issue })
    }
  }
  return { ok: issues.length === 0, issues }
}
