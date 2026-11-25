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
import {
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
  }
})
