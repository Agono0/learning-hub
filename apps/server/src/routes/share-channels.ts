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
} from '@learning-hub/db'
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

/* ==========================================================================
 * SYNC ROUTES — remote transport + coordinator over local SQLite state
 * ========================================================================== */

const subscribeBodySchema = z.object({
  manifest: ChannelManifestSchema,
  inviteToken: z.string().min(1).optional(),
  hostBaseUrl: z.string().url().optional(),
})

/**
 * POST /share/channels/subscribe — subscribe to a channel: verifies the
 * manifest, checks the visibility gate, seeds local items from the current
 * version snapshot and records the subscription (with its host) locally.
 */
async function postChannelSubscribe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, subscribeBodySchema)
  const check = verifyManifest(body.manifest)
  if (!check.ok) {
    sendJson(res, 400, {
      ok: false,
      error: `checksum mismatch in versions: ${check.badVersions.join(', ')}`,
    })
    return
  }
  const access = canSubscribe(body.manifest, body.inviteToken)
  if (!access.allowed) {
    sendJson(res, 403, { ok: false, error: access.reason })
    return
  }
  const store = new DbChannelSyncStore()
  if (store.getSubscription(body.manifest.channelId)) {
    sendJson(res, 409, { ok: false, error: 'already subscribed to this channel' })
    return
  }
  const fresh = subscribeToChannel(body.manifest.channelId)
  const seeded = applyAllPendingVersions([], fresh, body.manifest)
  store.saveLocalItems(body.manifest.channelId, seeded.items)
  store.saveSubscription({ ...fresh, localVersion: seeded.result.newVersion, lastSyncAt: null })
  refreshSubscriptionManifestView({
    channelId: body.manifest.channelId,
    title: body.manifest.title,
    authorHandle: body.manifest.authorHandle,
    contentType: body.manifest.type,
    visibility: body.manifest.visibility,
    seenVersion: body.manifest.currentVersion,
  })
  if (body.hostBaseUrl) setSubscriptionHost(body.manifest.channelId, body.hostBaseUrl)
  sendJson(res, 200, {
    ok: true,
    subscription: store.getSubscription(body.manifest.channelId),
    itemCount: seeded.items.length,
    localVersion: seeded.result.newVersion,
  })
}

/** GET /share/channels/subscriptions — dashboard roster with pending flags */
async function getChannelSubscriptions(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  sendJson(res, 200, { ok: true, subscriptions: listChannelSubscriptions() })
}

const syncOneBodySchema = z.object({
  channelId: z.string().min(1),
  /** Overrides the recorded host for this sync (does not persist). */
  hostBaseUrl: z.string().url().optional(),
})

/** POST /share/channels/sync — sync one subscription against its host */
async function postChannelSync(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, syncOneBodySchema)
  const store = new DbChannelSyncStore()
  if (!store.getSubscription(body.channelId)) {
    sendJson(res, 404, { ok: false, error: 'no local subscription for this channel' })
    return
  }
  const row = listChannelSubscriptions().find((r) => r.channelId === body.channelId)
  const record = await syncSubscriptionOverHttp(
    store,
    body.channelId,
    body.hostBaseUrl ?? row?.hostBaseUrl ?? null,
    fetch,
  )
  sendJson(res, record.outcome === 'failed' ? 502 : 200, {
    ok: record.outcome !== 'failed',
    record,
  })
}

/** POST /share/channels/sync-all — sync every hosted subscription, grouped by host */
async function postChannelSyncAll(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const store = new DbChannelSyncStore()
  const summary = await syncAllSubscriptions(store, listChannelSubscriptions(), fetch)
  sendJson(res, 200, { ok: true, summary, records: summary.records })
}

const syncRecordsBodySchema = z.object({
  channelId: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
})

/** POST /share/channels/sync-records — recent sync history for one channel */
async function postChannelSyncRecords(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, syncRecordsBodySchema)
  sendJson(res, 200, { ok: true, records: listSyncRecords(body.channelId, { limit: body.limit }) })
}

const publishFromLibraryBodySchema = z.object({
  channelId: z.string().min(1),
  authorHandle: z.string().min(1).max(50),
  visibility: ChannelVisibilitySchema,
  deckId: z.number().int().positive().optional(),
  courseId: z.number().int().positive().optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).optional(),
  changelog: z.string().max(500).optional(),
  /** When set, publish the next version of this existing manifest. */
  manifest: ChannelManifestSchema.optional(),
})

/**
 * POST /share/channels/publish-from-library — create (or update) a channel
 * straight from a deck or course in the local library.
 */
async function postChannelPublishFromLibrary(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson(req, publishFromLibraryBodySchema)
  if (body.deckId === undefined && body.courseId === undefined) {
    sendJson(res, 400, { ok: false, error: 'pass deckId or courseId' })
    return
  }
  const result =
    body.manifest && body.deckId !== undefined
      ? publishDeckUpdateFromLibrary({
          deckId: body.deckId,
          manifest: body.manifest,
          changelog: body.changelog ?? '',
        })
      : body.deckId !== undefined
        ? publishDeckAsChannel({
            deckId: body.deckId,
            channelId: body.channelId,
            title: body.title ?? `Channel ${body.channelId}`,
            authorHandle: body.authorHandle,
            visibility: body.visibility,
            ...(body.description !== undefined ? { description: body.description } : {}),
            ...(body.changelog !== undefined ? { changelog: body.changelog } : {}),
          })
        : publishCourseAsChannel({
            courseId: body.courseId!,
            channelId: body.channelId,
            authorHandle: body.authorHandle,
            visibility: body.visibility,
            ...(body.changelog !== undefined ? { changelog: body.changelog } : {}),
          })
  sendJson(res, result.ok ? 200 : 422, result)
}

const importBodySchema = z.object({ channelId: z.string().min(1) })

/** POST /share/channels/import — import a subscription into the library (deck or course) */
async function postChannelImport(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJson(req, importBodySchema)
  const row = listChannelSubscriptions().find((r) => r.channelId === body.channelId)
  if (!row) {
    sendJson(res, 404, { ok: false, error: 'no local subscription for this channel' })
    return
  }
  const result =
    row.contentType === 'course'
      ? importChannelCourse(body.channelId)
      : importChannelDeck(body.channelId)
  sendJson(res, result.ok ? 200 : 422, result)
}

shareChannelRoutes.push(
  {
    method: 'POST',
    path: '/share/channels/publish-from-library',
    summary: 'create or update a channel from a library deck or course',
    handler: postChannelPublishFromLibrary,
  },
  {
    method: 'POST',
    path: '/share/channels/import',
    summary: 'import a subscription into the library as a deck or course (idempotent)',
    handler: postChannelImport,
  },
  {
    method: 'POST',
    path: '/share/channels/subscribe',
    summary: 'subscribe to a channel: verify, gate-check, seed items, record subscription',
    handler: postChannelSubscribe,
  },
  {
    method: 'GET',
    path: '/share/channels/subscriptions',
    summary: 'list local subscriptions with manifest view fields and pending flags',
    handler: getChannelSubscriptions,
  },
  {
    method: 'POST',
    path: '/share/channels/sync',
    summary: 'sync one subscription against its recorded host',
    handler: postChannelSync,
  },
  {
    method: 'POST',
    path: '/share/channels/sync-all',
    summary: 'sync every hosted subscription, grouped by host',
    handler: postChannelSyncAll,
  },
  {
    method: 'POST',
    path: '/share/channels/sync-records',
    summary: 'list recent sync records for a channel (newest first)',
    handler: postChannelSyncRecords,
  },
)
