/**
 * Shared Material Channels (lh-share/v2) MCP Tools
 *
 * Lets external AI agents create, publish, inspect, verify and merge
 * versioned shared-material channels: decks and courses whose updates
 * propagate to subscribers without overwriting learner state.
 */

import { z } from 'zod'
import { json, tool, type RegisteredTool } from '../tool-kit'
import {
  ChannelCollectionSchema,
  ProposalOperationSchema,
  applyAllPendingVersions,
  applyChannelUpdate,
  canSubscribe,
  diffVersions,
  issueInviteToken,
  migrateV1Envelope,
  ChannelItemSchema,
  ChannelManifestSchema,
  ChannelVisibilitySchema,
  ChannelContentTypeSchema,
  createChannel,
  hasPendingUpdate,
  LocalItemSchema,
  publishUpdate,
  subscribeToChannel,
  verifyManifest,
  type SyncRecord,
} from '@learning-hub/core'
import {
  DbChannelSyncStore,
  listChannelSubscriptions,
  listSyncRecords,
  refreshSubscriptionManifestView,
  setSubscriptionHost,
  syncSubscriptionOverHttp,
  syncAllSubscriptions,
  importChannelDeck,
  importChannelCourse,
  publishDeckAsChannel,
  publishCourseAsChannel,
  publishDeckUpdateFromLibrary,
  hostChannel,
  getHostedChannel,
  listHostedChannels,
  publishHostedChannelVersion,
  unhostChannel,
  createChannelProposal,
  listChannelProposals,
  decideChannelProposal,
  hostedChannelAnalytics,
  subscriptionSyncStats,
  saveCollection,
  getCollection,
  listCollections,
  deleteCollection,
} from '@learning-hub/db'

export const shareChannelTools: RegisteredTool[] = [
  tool(
    'share_channel_create',
    'Creates a new lh-share/v2 channel manifest at version 1. Visibility is creator-selectable: link (anyone with the link) or invite (invite token required). Author identity is a learner-chosen handle.',
    {
      channelId: z.string().min(1).describe('Unique channel id, e.g. ch-bio-101.'),
      type: ChannelContentTypeSchema.describe('deck or course.'),
      title: z.string().min(1).max(200),
      authorHandle: z.string().min(1).max(50).describe('Learner-chosen handle, never a real name.'),
      visibility: ChannelVisibilitySchema,
      items: z
        .array(z.object({ id: z.string().min(1), content: z.record(z.string(), z.unknown()) }))
        .min(1)
        .describe('Initial items; ids stay stable across versions.'),
      description: z.string().max(1000).optional(),
      changelog: z.string().max(500).optional(),
    },
    async (input) => {
      return json({ manifest: createChannel(input) })
    },
  ),
  tool(
    'share_channel_publish_update',
    'Publishes a new channel version. Pass the full item list as it should exist in the new version; revisions bump only for changed items, absent items are removed from the channel.',
    {
      manifest: ChannelManifestSchema,
      items: z
        .array(z.object({ id: z.string().min(1), content: z.record(z.string(), z.unknown()) }))
        .describe('The complete item list for the new version.'),
      changelog: z.string().max(500),
    },
    async ({ manifest, items, changelog }) => {
      return json({ manifest: publishUpdate(manifest, items, changelog) })
    },
  ),
  tool(
    'share_channel_apply_update',
    'Merges a channel version into subscriber-local items. Learner state (notes, scheduling, progress) is never touched; undiverged items fast-forward; diverged items record conflicts with the learner version winning; publisher removals are kept locally. Idempotent.',
    {
      localItems: z.array(LocalItemSchema),
      version: z.object({
        version: z.number().int().positive(),
        publishedAt: z.string(),
        changelog: z.string().max(500).default(''),
        checksum: z.string().min(4),
        items: z.array(ChannelItemSchema),
      }),
    },
    async ({ localItems, version }) => {
      return json(applyChannelUpdate(localItems, version))
    },
  ),
  tool(
    'share_channel_verify',
    'Verifies a manifest: every version checksum must hold. Returns the list of tampered versions.',
    {
      manifest: ChannelManifestSchema,
    },
    async ({ manifest }) => {
      return json(verifyManifest(manifest))
    },
  ),
  tool(
    'share_channel_subscription_status',
    'Reports whether a subscription has a pending update against a manifest.',
    {
      channelId: z.string().min(1),
      localVersion: z.number().int().nonnegative(),
      manifest: ChannelManifestSchema,
    },
    async ({ channelId, localVersion, manifest }) => {
      const sub = subscribeToChannel(channelId)
      return json({
        channelId,
        localVersion,
        currentVersion: manifest.currentVersion,
        pending: hasPendingUpdate({ ...sub, localVersion }, manifest),
        versionsBehind: Math.max(0, manifest.currentVersion - localVersion),
      })
    },
  ),
  tool(
    'share_channel_diff',
    'Diffs two versions of a channel: added, removed, changed and unchanged item ids. Use to surface what changed before a subscriber applies an update.',
    {
      manifest: ChannelManifestSchema,
      fromVersion: z.number().int().positive(),
      toVersion: z.number().int().positive(),
    },
    async ({ manifest, fromVersion, toVersion }) => {
      const from = manifest.versions.find((v) => v.version === fromVersion)
      const to = manifest.versions.find((v) => v.version === toVersion)
      if (!from || !to) return json({ error: 'version not found in manifest' })
      return json(diffVersions(from, to))
    },
  ),
  tool(
    'share_channel_apply_all_pending',
    'Applies every version a subscription is behind, in order, folding merge results and deduping conflicts. Learner state is preserved across the whole batch.',
    {
      localItems: z.array(LocalItemSchema),
      localVersion: z.number().int().nonnegative(),
      channelId: z.string().min(1),
      manifest: ChannelManifestSchema,
    },
    async ({ localItems, localVersion, channelId, manifest }) => {
      const sub = { ...subscribeToChannel(channelId), localVersion }
      return json(applyAllPendingVersions(localItems, sub, manifest))
    },
  ),
  tool(
    'share_channel_migrate_v1',
    'Upgrades a one-shot lh-share/v1 envelope into a v2 channel manifest at version 1, preserving item ids where present.',
    {
      envelope: z.object({
        type: ChannelContentTypeSchema,
        metadata: z.object({
          title: z.string().min(1),
          author: z.string().optional(),
          description: z.string().optional(),
        }),
        data: z.record(z.string(), z.unknown()),
      }),
      channelId: z.string().min(1),
      authorHandle: z.string().min(1).max(50),
      visibility: ChannelVisibilitySchema,
    },
    async (input) => {
      return json({ manifest: migrateV1Envelope(input) })
    },
  ),
  tool(
    'share_channel_issue_invite',
    'Issues a deterministic invite token for an invite-only channel from the channel id and the creator invite secret. Rotating the secret revokes all outstanding tokens.',
    {
      channelId: z.string().min(1),
      inviteSecret: z
        .string()
        .min(8)
        .describe('Creator-only secret; never shared with subscribers.'),
    },
    async ({ channelId, inviteSecret }) => {
      return json({ channelId, inviteToken: issueInviteToken(channelId, inviteSecret) })
    },
  ),
  tool(
    'share_channel_check_access',
    'Checks whether a subscription attempt is allowed under the channel visibility: link channels accept anyone; invite channels require a token.',
    {
      manifest: ChannelManifestSchema,
      inviteToken: z.string().optional(),
    },
    async ({ manifest, inviteToken }) => {
      return json(canSubscribe(manifest, inviteToken))
    },
  ),
  tool(
    'share_channel_describe',
    'Summarizes a manifest for display: title, author handle, visibility, version count, latest changelog, item counts per version.',
    {
      manifest: ChannelManifestSchema,
    },
    async ({ manifest }) => {
      const latest = manifest.versions[manifest.versions.length - 1]
      return json({
        channelId: manifest.channelId,
        type: manifest.type,
        title: manifest.title,
        description: manifest.description,
        authorHandle: manifest.authorHandle,
        visibility: manifest.visibility,
        currentVersion: manifest.currentVersion,
        latestChangelog: latest.changelog,
        latestItemCount: latest.items.length,
        versions: manifest.versions.map((v) => ({
          version: v.version,
          publishedAt: v.publishedAt,
          changelog: v.changelog,
          itemCount: v.items.length,
        })),
      })
    },
  ),
  tool(
    'share_channel_subscribe',
    'Subscribes to a channel locally: verifies checksums, checks the visibility gate (invite token for invite-only channels), seeds local items from the current version snapshot and records the subscription with its host in the local database.',
    {
      manifest: ChannelManifestSchema,
      inviteToken: z.string().min(1).optional().describe('Required for invite-only channels.'),
      hostBaseUrl: z
        .string()
        .url()
        .optional()
        .describe('Where the channel is hosted; recorded for later syncs.'),
    },
    async ({ manifest, inviteToken, hostBaseUrl }) => {
      const check = verifyManifest(manifest)
      if (!check.ok) {
        return json({
          ok: false,
          error: `checksum mismatch in versions: ${check.badVersions.join(', ')}`,
        })
      }
      const access = canSubscribe(manifest, inviteToken)
      if (!access.allowed) return json({ ok: false, error: access.reason })
      const store = new DbChannelSyncStore()
      if (store.getSubscription(manifest.channelId)) {
        return json({ ok: false, error: 'already subscribed to this channel' })
      }
      const fresh = subscribeToChannel(manifest.channelId)
      const seeded = applyAllPendingVersions([], fresh, manifest)
      store.saveLocalItems(manifest.channelId, seeded.items)
      store.saveSubscription({ ...fresh, localVersion: seeded.result.newVersion })
      refreshSubscriptionManifestView({
        channelId: manifest.channelId,
        title: manifest.title,
        authorHandle: manifest.authorHandle,
        contentType: manifest.type,
        visibility: manifest.visibility,
        seenVersion: manifest.currentVersion,
      })
      if (hostBaseUrl) setSubscriptionHost(manifest.channelId, hostBaseUrl)
      return json({
        ok: true,
        subscription: store.getSubscription(manifest.channelId),
        itemCount: seeded.items.length,
        localVersion: seeded.result.newVersion,
      })
    },
  ),
  tool(
    'share_channel_list_subscriptions',
    'Lists local channel subscriptions with manifest view fields (title, author handle, visibility) and a hasPending flag when the publisher has versions the learner has not applied.',
    {},
    async () => {
      return json({ subscriptions: listChannelSubscriptions() })
    },
  ),
  tool(
    'share_channel_sync',
    'Syncs one subscription against its recorded host: fetches the manifest, refreshes the dashboard view, and applies pending versions through the learner-state-preserving merge. Every attempt is written to the sync log.',
    {
      channelId: z.string().min(1),
      hostBaseUrl: z
        .string()
        .url()
        .optional()
        .describe('Overrides the recorded host for this sync.'),
    },
    async ({ channelId, hostBaseUrl }) => {
      const store = new DbChannelSyncStore()
      if (!store.getSubscription(channelId)) {
        return json({ ok: false, error: 'no local subscription for this channel' })
      }
      const row = listChannelSubscriptions().find((r) => r.channelId === channelId)
      const record: SyncRecord = await syncSubscriptionOverHttp(
        store,
        channelId,
        hostBaseUrl ?? row?.hostBaseUrl ?? null,
        fetch,
      )
      return json({ ok: record.outcome !== 'failed', record })
    },
  ),
  tool(
    'share_channel_sync_all',
    'Syncs every local subscription against its recorded host and returns a summary plus one record per channel.',
    {},
    async () => {
      const store = new DbChannelSyncStore()
      const summary = await syncAllSubscriptions(store, listChannelSubscriptions(), fetch)
      return json({ ok: true, summary, records: summary.records })
    },
  ),
  tool(
    'share_channel_sync_records',
    'Lists recent sync records for a channel, newest first: outcome, versions moved, merge counts and error details for failures.',
    {
      channelId: z.string().min(1),
      limit: z.number().int().positive().max(100).optional(),
    },
    async ({ channelId, limit }) => {
      return json({ records: listSyncRecords(channelId, { limit }) })
    },
  ),
  tool(
    'share_channel_import',
    'Imports a subscription into the local library: deck channels become a reviewable deck (re-imports update card content in place by sourceKey and keep FSRS state); course channels become a curriculum course (re-imports refresh in place by slug). Idempotent.',
    { channelId: z.string().min(1) },
    async ({ channelId }) => {
      const row = listChannelSubscriptions().find((r) => r.channelId === channelId)
      if (!row) return json({ ok: false, error: 'no local subscription for this channel' })
      const result =
        row.contentType === 'course' ? importChannelCourse(channelId) : importChannelDeck(channelId)
      return json(result)
    },
  ),
  tool(
    'share_channel_publish_from_library',
    'Publishes an existing library deck or course as a channel (or the next version of one, when manifest is passed with deckId). Item ids derive from stable card ids / lesson slugs so subscriber merge state survives republishes. Returns the manifest plus a truthful change summary for updates.',
    {
      channelId: z.string().min(1),
      authorHandle: z.string().min(1).max(50),
      visibility: ChannelVisibilitySchema,
      deckId: z.number().int().positive().optional(),
      courseId: z.number().int().positive().optional(),
      title: z.string().min(1).max(200).optional(),
      changelog: z.string().max(500).optional(),
      manifest: ChannelManifestSchema.optional(),
    },
    async (input) => {
      if (input.deckId === undefined && input.courseId === undefined) {
        return json({ ok: false, error: 'pass deckId or courseId' })
      }
      const result =
        input.manifest && input.deckId !== undefined
          ? publishDeckUpdateFromLibrary({
              deckId: input.deckId,
              manifest: input.manifest,
              changelog: input.changelog ?? '',
            })
          : input.deckId !== undefined
            ? publishDeckAsChannel({
                deckId: input.deckId,
                channelId: input.channelId,
                title: input.title ?? `Channel ${input.channelId}`,
                authorHandle: input.authorHandle,
                visibility: input.visibility,
                ...(input.changelog !== undefined ? { changelog: input.changelog } : {}),
              })
            : publishCourseAsChannel({
                courseId: input.courseId!,
                channelId: input.channelId,
                authorHandle: input.authorHandle,
                visibility: input.visibility,
                ...(input.changelog !== undefined ? { changelog: input.changelog } : {}),
              })
      return json(result)
    },
  ),
  tool(
    'share_channel_host',
    'Hosts a channel manifest on this instance, making it fetchable over HTTP and eligible for proposals. Fails if the channelId is already hosted.',
    { manifest: ChannelManifestSchema },
    async ({ manifest }) => json(hostChannel(manifest)),
  ),
  tool(
    'share_channel_list_hosted',
    'Lists channels hosted on this instance (channelId, title, currentVersion, updatedAt).',
    {},
    async () => json({ ok: true, channels: listHostedChannels() }),
  ),
  tool(
    'share_channel_hosted_manifest',
    'Returns the full manifest of a locally hosted channel.',
    { channelId: z.string().min(1) },
    async ({ channelId }) => {
      const manifest = getHostedChannel(channelId)
      if (!manifest) return json({ ok: false, error: 'channel not hosted here' })
      return json({ ok: true, manifest })
    },
  ),
  tool(
    'share_channel_publish_hosted_update',
    'Publishes the next version of a locally hosted channel. Items absent from the list are removed from the channel.',
    {
      channelId: z.string().min(1),
      items: z
        .array(z.object({ id: z.string().min(1), content: z.record(z.string(), z.unknown()) }))
        .min(1),
      changelog: z.string().max(500),
    },
    async (input) => json(publishHostedChannelVersion(input)),
  ),
  tool(
    'share_channel_unhost',
    'Stops hosting a channel on this instance.',
    { channelId: z.string().min(1) },
    async ({ channelId }) => json(unhostChannel(channelId)),
  ),
  tool(
    'share_channel_propose',
    'Creates a subscription pull request: proposes upsert/remove operations against a hosted channel. The owner accepts or declines; accepting publishes the next version.',
    {
      channelId: z.string().min(1),
      authorHandle: z.string().min(1).max(50),
      title: z.string().min(1).max(200),
      note: z.string().max(2000).optional(),
      operations: z.array(ProposalOperationSchema).min(1).max(500),
    },
    async (input) =>
      json(
        createChannelProposal({
          channelId: input.channelId,
          authorHandle: input.authorHandle,
          title: input.title,
          operations: input.operations,
          ...(input.note !== undefined ? { note: input.note } : {}),
        }),
      ),
  ),
  tool(
    'share_channel_list_proposals',
    'Lists proposals for a channel, optionally filtered by status.',
    {
      channelId: z.string().min(1),
      status: z.enum(['open', 'accepted', 'declined']).optional(),
    },
    async ({ channelId, status }) =>
      json({ ok: true, proposals: listChannelProposals(channelId, status) }),
  ),
  tool(
    'share_channel_decide_proposal',
    'Accepts or declines an open proposal. Accepting publishes the next channel version with the proposed changes.',
    {
      proposalId: z.string().min(1),
      decision: z.enum(['accept', 'decline']),
    },
    async ({ proposalId, decision }) => json(decideChannelProposal(proposalId, decision)),
  ),
  tool(
    'share_channel_hosted_analytics',
    'Analytics for a locally hosted channel: per-version activity (added/removed/changed), lifetime totals, churn rate, and proposal stats including top contributors.',
    { channelId: z.string().min(1) },
    async ({ channelId }) => json(hostedChannelAnalytics(channelId)),
  ),
  tool(
    'share_channel_sync_stats',
    'Subscriber-side sync health for a channel: total syncs, outcomes (updated/already-current/failed), last sync time and last error.',
    { channelId: z.string().min(1) },
    async ({ channelId }) => json({ ok: true, stats: subscriptionSyncStats(channelId) }),
  ),
  tool(
    'share_collection_save',
    'Saves a channel collection (a portable bundle of channel manifests) locally.',
    { collection: ChannelCollectionSchema },
    async ({ collection }) => json(saveCollection(collection)),
  ),
  tool('share_collection_list', 'Lists locally stored channel collections.', {}, async () =>
    json({ ok: true, collections: listCollections() }),
  ),
  tool(
    'share_collection_get',
    'Returns one stored collection with full channel manifests.',
    { id: z.string().min(1) },
    async ({ id }) => {
      const collection = getCollection(id)
      if (!collection) return json({ ok: false, error: 'collection not found' })
      return json({ ok: true, collection })
    },
  ),
  tool(
    'share_collection_delete',
    'Deletes a stored collection.',
    { id: z.string().min(1) },
    async ({ id }) => json(deleteCollection(id)),
  ),
]
