/**
 * Learning HUB headless server — SHARED MATERIAL CHANNELS routes
 * (lh-share/v2). Same handlers, same zod validation, same Route[] table
 * pattern as the other route modules; composition lives in ./index.ts.
 */
import { z } from 'zod'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  applyChannelUpdate,
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
    path: '/share/channels/status',
    summary: 'check whether a subscription has a pending update',
    handler: postChannelStatus,
  },
]
