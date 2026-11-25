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
  applyChannelUpdate,
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
} from '@learning-hub/core'

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
]
