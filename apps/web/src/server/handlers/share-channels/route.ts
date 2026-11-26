/**
 * /api/share-channels — runtime-neutral handler (Request → Response).
 *
 * Runs on Node (via the app/api shim) AND inside the native apps' webview
 * worker (via the hub registry). So: no static node:* imports (lint-enforced),
 * validate every body with zod via readJson, keep logic in @learning-hub/core.
 *
 * The channel engine is pure: persistence of manifests, subscriptions and
 * local copies lives client-side (manual-mode guarantee) until a sync
 * transport lands. This handler exposes the engine steps over HTTP.
 */
import { z } from 'zod'
import { readJson, withRoute } from '@/lib/api'
import { outboundFetch } from '@/server/bounded-fetch'
import {
  createChannelProposal,
  decideChannelProposal,
  getHostedChannel,
  hostChannel,
  listChannelProposals,
  listHostedChannels,
  publishHostedChannelVersion,
  unhostChannel,
  hostedChannelAnalytics,
  subscriptionSyncStats,
  saveCollection,
  getCollection,
  listCollections,
  deleteCollection,
} from '@learning-hub/db'
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
  ChannelContentTypeSchema,
  ChannelVisibilitySchema,
  createChannel,
  hasPendingUpdate,
  LocalItemSchema,
  publishUpdate,
  subscribeToChannel,
  verifyManifest,
  HttpChannelTransport,
  TransportError,
  pendingVersions,
} from '@learning-hub/core/share-channels'

const postSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    channelId: z.string().min(1),
    type: ChannelContentTypeSchema,
    title: z.string().min(1).max(200),
    authorHandle: z.string().min(1).max(50),
    visibility: ChannelVisibilitySchema,
    items: z
      .array(z.object({ id: z.string().min(1), content: z.record(z.string(), z.unknown()) }))
      .min(1),
    description: z.string().max(1000).optional(),
    changelog: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal('publish'),
    manifest: ChannelManifestSchema,
    items: z.array(z.object({ id: z.string().min(1), content: z.record(z.string(), z.unknown()) })),
    changelog: z.string().max(500),
  }),
  z.object({
    action: z.literal('apply'),
    localItems: z.array(LocalItemSchema),
    version: z.object({
      version: z.number().int().positive(),
      publishedAt: z.string(),
      changelog: z.string().max(500).default(''),
      checksum: z.string().min(4),
      items: z.array(ChannelItemSchema),
    }),
  }),
  z.object({
    action: z.literal('diff'),
    manifest: ChannelManifestSchema,
    fromVersion: z.number().int().positive(),
    toVersion: z.number().int().positive(),
  }),
  z.object({
    action: z.literal('apply-all'),
    localItems: z.array(LocalItemSchema),
    localVersion: z.number().int().nonnegative(),
    channelId: z.string().min(1),
    manifest: ChannelManifestSchema,
  }),
  z.object({
    action: z.literal('migrate-v1'),
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
  }),
  z.object({
    action: z.literal('invite'),
    channelId: z.string().min(1),
    inviteSecret: z.string().min(8),
  }),
  z.object({
    action: z.literal('check-access'),
    manifest: ChannelManifestSchema,
    inviteToken: z.string().optional(),
  }),
  z.object({
    action: z.literal('verify'),
    manifest: ChannelManifestSchema,
  }),
  z.object({
    action: z.literal('status'),
    channelId: z.string().min(1),
    localVersion: z.number().int().nonnegative(),
    manifest: ChannelManifestSchema,
  }),
  z.object({
    action: z.literal('fetch-manifest'),
    hostBaseUrl: z.string().url(),
    channelId: z.string().min(1),
    inviteToken: z.string().min(1).optional(),
    ifNoneMatch: z.string().min(4).optional(),
  }),
  z.object({
    action: z.literal('sync-plan'),
    channelId: z.string().min(1),
    localVersion: z.number().int().nonnegative(),
    localItems: z.array(LocalItemSchema),
    manifest: ChannelManifestSchema,
  }),
  /* Local hosting + subscription pull requests (SQLite-backed). */
  z.object({ action: z.literal('host'), manifest: ChannelManifestSchema }),
  z.object({ action: z.literal('host-list') }),
  z.object({ action: z.literal('host-get'), channelId: z.string().min(1) }),
  z.object({
    action: z.literal('host-publish'),
    channelId: z.string().min(1),
    items: z
      .array(z.object({ id: z.string().min(1), content: z.record(z.string(), z.unknown()) }))
      .min(1),
    changelog: z.string().max(500),
  }),
  z.object({ action: z.literal('host-unhost'), channelId: z.string().min(1) }),
  z.object({
    action: z.literal('proposal-create'),
    channelId: z.string().min(1),
    authorHandle: z.string().min(1).max(50),
    title: z.string().min(1).max(200),
    note: z.string().max(2000).optional(),
    operations: z.array(ProposalOperationSchema).min(1).max(500),
  }),
  z.object({
    action: z.literal('proposal-list'),
    channelId: z.string().min(1),
    status: z.enum(['open', 'accepted', 'declined']).optional(),
  }),
  z.object({ action: z.literal('collection-save'), collection: ChannelCollectionSchema }),
  z.object({ action: z.literal('collection-list') }),
  z.object({ action: z.literal('collection-get'), id: z.string().min(1) }),
  z.object({ action: z.literal('collection-delete'), id: z.string().min(1) }),
  z.object({ action: z.literal('host-analytics'), channelId: z.string().min(1) }),
  z.object({ action: z.literal('sync-stats'), channelId: z.string().min(1) }),
  z.object({
    action: z.literal('proposal-decide'),
    proposalId: z.string().min(1),
    decision: z.enum(['accept', 'decline']),
  }),
])

/** POST /api/share-channels { action, ... } — run one channel engine step. */
export const POST = withRoute(async (req: Request) => {
  const body = await readJson(req, postSchema)
  switch (body.action) {
    case 'create':
      return Response.json({ manifest: createChannel(body) })
    case 'publish':
      return Response.json({ manifest: publishUpdate(body.manifest, body.items, body.changelog) })
    case 'apply':
      return Response.json(applyChannelUpdate(body.localItems, body.version))
    case 'verify':
      return Response.json(verifyManifest(body.manifest))
    case 'diff': {
      const from = body.manifest.versions.find((v) => v.version === body.fromVersion)
      const to = body.manifest.versions.find((v) => v.version === body.toVersion)
      if (!from || !to)
        return Response.json({ error: 'version not found in manifest' }, { status: 404 })
      return Response.json(diffVersions(from, to))
    }
    case 'apply-all': {
      const sub = { ...subscribeToChannel(body.channelId), localVersion: body.localVersion }
      return Response.json(applyAllPendingVersions(body.localItems, sub, body.manifest))
    }
    case 'migrate-v1':
      return Response.json({ manifest: migrateV1Envelope(body) })
    case 'invite':
      return Response.json({
        channelId: body.channelId,
        inviteToken: issueInviteToken(body.channelId, body.inviteSecret),
      })
    case 'check-access':
      return Response.json(canSubscribe(body.manifest, body.inviteToken))
    case 'status': {
      const sub = { ...subscribeToChannel(body.channelId), localVersion: body.localVersion }
      return Response.json({
        pending: hasPendingUpdate(sub, body.manifest),
        localVersion: body.localVersion,
        currentVersion: body.manifest.currentVersion,
      })
    }
    case 'fetch-manifest': {
      const transport = new HttpChannelTransport({
        baseUrl: body.hostBaseUrl,
        // Connect-time address pinning, like boundedFetchText; never the bare global fetch.
        fetchFn: outboundFetch,
      })
      try {
        const manifest = await transport.fetchManifest(body.channelId, {
          inviteToken: body.inviteToken,
          ifNoneMatch: body.ifNoneMatch,
        })
        return Response.json({ manifest })
      } catch (err) {
        if (err instanceof TransportError) {
          const status =
            err.code === 'not-found'
              ? 404
              : err.code === 'unauthorized'
                ? 403
                : err.code === 'invalid-manifest' || err.code === 'checksum-mismatch'
                  ? 422
                  : 502
          return Response.json({ error: err.message, code: err.code }, { status })
        }
        return Response.json(
          { error: err instanceof Error ? err.message : String(err), code: 'network' },
          { status: 502 },
        )
      }
    }
    case 'sync-plan': {
      const sub = { ...subscribeToChannel(body.channelId), localVersion: body.localVersion }
      const pending = pendingVersions(sub, body.manifest)
      const byVersion = new Map(body.manifest.versions.map((v) => [v.version, v]))
      const steps = pending.map((v) => {
        const prev = byVersion.get(v.version - 1)
        return {
          version: v.version,
          publishedAt: v.publishedAt,
          changelog: v.changelog,
          diff: prev
            ? diffVersions(prev, v)
            : {
                addedIds: v.items.map((i) => i.id),
                removedIds: [],
                changedIds: [],
                unchangedIds: [],
              },
        }
      })
      const preview = applyAllPendingVersions(body.localItems, sub, body.manifest)
      return Response.json({
        pending: pending.length > 0,
        pendingCount: pending.length,
        steps,
        preview: preview.result,
        conflictIds: preview.result.conflicts,
      })
    }
    case 'host':
      return Response.json(hostChannel(body.manifest))
    case 'host-list':
      return Response.json({ ok: true, channels: listHostedChannels() })
    case 'host-get': {
      const manifest = getHostedChannel(body.channelId)
      if (!manifest) {
        return Response.json({ ok: false, error: 'channel not hosted here' }, { status: 404 })
      }
      return Response.json({ ok: true, manifest })
    }
    case 'host-publish':
      return Response.json(
        publishHostedChannelVersion({
          channelId: body.channelId,
          items: body.items,
          changelog: body.changelog,
        }),
      )
    case 'host-unhost':
      return Response.json(unhostChannel(body.channelId))
    case 'proposal-create':
      return Response.json(
        createChannelProposal({
          channelId: body.channelId,
          authorHandle: body.authorHandle,
          title: body.title,
          operations: body.operations,
          ...(body.note !== undefined ? { note: body.note } : {}),
        }),
      )
    case 'proposal-list':
      return Response.json({
        ok: true,
        proposals: listChannelProposals(body.channelId, body.status),
      })
    case 'proposal-decide':
      return Response.json(decideChannelProposal(body.proposalId, body.decision))
    case 'host-analytics': {
      const result = hostedChannelAnalytics(body.channelId)
      return Response.json(result, { status: result.ok ? 200 : 404 })
    }
    case 'sync-stats':
      return Response.json({ ok: true, stats: subscriptionSyncStats(body.channelId) })
    case 'collection-save':
      return Response.json(saveCollection(body.collection))
    case 'collection-list':
      return Response.json({ ok: true, collections: listCollections() })
    case 'collection-get': {
      const collection = getCollection(body.id)
      if (!collection) {
        return Response.json({ ok: false, error: 'collection not found' }, { status: 404 })
      }
      return Response.json({ ok: true, collection })
    }
    case 'collection-delete': {
      const result = deleteCollection(body.id)
      return Response.json(result, { status: result.ok ? 200 : 404 })
    }
  }
})
