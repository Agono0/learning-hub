/**
 * Learning HUB headless server — SHARED MATERIAL CHANNELS routes
 * (lh-share/v2). Same handlers, same zod validation, same Route[] table
 * pattern as the other route modules; composition lives in ./index.ts.
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
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
} from '@learning-hub/core'
import { sendJson, readJson } from '../http'
import type { Route } from './shared'

const createBodySchema = z.object({
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
})

/** POST /share/channels/create — create a channel manifest at version 1 */
async function postChannelCreate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, createBodySchema)
  sendJson(res, 200, { ok: true, manifest: createChannel(body) })
}

const publishBodySchema = z.object({
  manifest: ChannelManifestSchema,
  items: z.array(z.object({ id: z.string().min(1), content: z.record(z.string(), z.unknown()) })),
  changelog: z.string().max(500),
})

/** POST /share/channels/publish — publish a new channel version */
async function postChannelPublish(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, publishBodySchema)
  sendJson(res, 200, {
    ok: true,
    manifest: publishUpdate(body.manifest, body.items, body.changelog),
  })
}

const applyBodySchema = z.object({
  localItems: z.array(LocalItemSchema),
  version: z.object({
    version: z.number().int().positive(),
    publishedAt: z.string(),
    changelog: z.string().max(500).default(''),
    checksum: z.string().min(4),
    items: z.array(ChannelItemSchema),
  }),
})

/** POST /share/channels/apply — merge a channel version into local items */
async function postChannelApply(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, applyBodySchema)
  const { items, result } = applyChannelUpdate(body.localItems, body.version)
  sendJson(res, 200, { ok: true, items, result })
}

const verifyBodySchema = z.object({ manifest: ChannelManifestSchema })

/** POST /share/channels/verify — verify manifest checksums */
async function postChannelVerify(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, verifyBodySchema)
  sendJson(res, 200, { ok: true, report: verifyManifest(body.manifest) })
}

const describeBodySchema = z.object({ manifest: ChannelManifestSchema })

/** POST /share/channels/describe — summarize a manifest for display */
async function postChannelDescribe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, describeBodySchema)
  const m = body.manifest
  const latest = m.versions[m.versions.length - 1]
  sendJson(res, 200, {
    ok: true,
    summary: {
      channelId: m.channelId,
      type: m.type,
      title: m.title,
      description: m.description,
      authorHandle: m.authorHandle,
      visibility: m.visibility,
      currentVersion: m.currentVersion,
      latestChangelog: latest.changelog,
      latestItemCount: latest.items.length,
      versions: m.versions.map((v) => ({
        version: v.version,
        publishedAt: v.publishedAt,
        changelog: v.changelog,
        itemCount: v.items.length,
      })),
    },
  })
}

const statusBodySchema = z.object({
  channelId: z.string().min(1),
  localVersion: z.number().int().nonnegative(),
  manifest: ChannelManifestSchema,
})

/** POST /share/channels/status — pending-update check for a subscription */
async function postChannelStatus(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, statusBodySchema)
  const sub = { ...subscribeToChannel(body.channelId), localVersion: body.localVersion }
  sendJson(res, 200, {
    ok: true,
    pending: hasPendingUpdate(sub, body.manifest),
    localVersion: body.localVersion,
    currentVersion: body.manifest.currentVersion,
  })
}

export const shareChannelRoutes: Route[] = [
  {
    method: 'POST',
    path: '/share/channels/create',
    summary: 'create an lh-share/v2 channel manifest (link or invite visibility)',
    handler: postChannelCreate,
  },
  {
    method: 'POST',
    path: '/share/channels/publish',
    summary: 'publish a new channel version with auto-bumped item revisions',
    handler: postChannelPublish,
  },
  {
    method: 'POST',
    path: '/share/channels/apply',
    summary: 'merge a channel version into subscriber-local items (learner state preserved)',
    handler: postChannelApply,
  },
  {
    method: 'POST',
    path: '/share/channels/verify',
    summary: 'verify manifest version checksums',
    handler: postChannelVerify,
  },
  {
    method: 'POST',
    path: '/share/channels/describe',
    summary: 'summarize a channel manifest for display',
    handler: postChannelDescribe,
  },
  {
    method: 'POST',
    path: '/share/channels/diff',
    summary: 'diff two channel versions (added/removed/changed/unchanged)',
    handler: postChannelDiff,
  },
  {
    method: 'POST',
    path: '/share/channels/apply-all',
    summary: 'apply every pending version in order, folding merge results',
    handler: postChannelApplyAll,
  },
  {
    method: 'POST',
    path: '/share/channels/migrate-v1',
    summary: 'upgrade a one-shot lh-share/v1 envelope into a v2 channel',
    handler: postChannelMigrate,
  },
  {
    method: 'POST',
    path: '/share/channels/invite',
    summary: 'issue an invite token for an invite-only channel',
    handler: postChannelInvite,
  },
  {
    method: 'POST',
    path: '/share/channels/check-access',
    summary: 'check the visibility gate for a subscription attempt',
    handler: postChannelCheckAccess,
  },
  {
    method: 'POST',
    path: '/share/channels/status',
    summary: 'check whether a subscription has a pending update',
    handler: postChannelStatus,
  },
]

const diffBodySchema = z.object({
  manifest: ChannelManifestSchema,
  fromVersion: z.number().int().positive(),
  toVersion: z.number().int().positive(),
})

/** POST /share/channels/diff — what changed between two versions */
async function postChannelDiff(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, diffBodySchema)
  const from = body.manifest.versions.find((v) => v.version === body.fromVersion)
  const to = body.manifest.versions.find((v) => v.version === body.toVersion)
  if (!from || !to) {
    sendJson(res, 404, { ok: false, error: 'version not found in manifest' })
    return
  }
  sendJson(res, 200, { ok: true, diff: diffVersions(from, to) })
}

const applyAllBodySchema = z.object({
  localItems: z.array(LocalItemSchema),
  localVersion: z.number().int().nonnegative(),
  channelId: z.string().min(1),
  manifest: ChannelManifestSchema,
})

/** POST /share/channels/apply-all — fold every pending version in order */
async function postChannelApplyAll(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, applyAllBodySchema)
  const sub = {
    channelId: body.channelId,
    localVersion: body.localVersion,
    subscribedAt: '',
    lastSyncAt: null,
  }
  const { items, result, appliedVersions } = applyAllPendingVersions(
    body.localItems,
    sub,
    body.manifest,
  )
  sendJson(res, 200, { ok: true, items, result, appliedVersions })
}

const migrateBodySchema = z.object({
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
})

/** POST /share/channels/migrate-v1 — upgrade a v1 envelope to a v2 channel */
async function postChannelMigrate(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, migrateBodySchema)
  sendJson(res, 200, { ok: true, manifest: migrateV1Envelope(body) })
}

const inviteBodySchema = z.object({
  channelId: z.string().min(1),
  inviteSecret: z.string().min(8),
})

/** POST /share/channels/invite — issue an invite token (creator side) */
async function postChannelInvite(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, inviteBodySchema)
  sendJson(res, 200, {
    ok: true,
    channelId: body.channelId,
    inviteToken: issueInviteToken(body.channelId, body.inviteSecret),
  })
}

const accessBodySchema = z.object({
  manifest: ChannelManifestSchema,
  inviteToken: z.string().optional(),
})

/** POST /share/channels/check-access — visibility gate for a subscription */
async function postChannelCheckAccess(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, accessBodySchema)
  sendJson(res, 200, { ok: true, gate: canSubscribe(body.manifest, body.inviteToken) })
}
