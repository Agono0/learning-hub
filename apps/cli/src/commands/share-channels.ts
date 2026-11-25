/**
 * Shared Material Channels (lh-share/v2) CLI Command:
 * 1. create: create a channel manifest from --data/--file/stdin
 * 2. publish: publish a new version of a channel
 * 3. apply: merge a channel version into local items
 * 4. verify: verify manifest checksums
 * 5. describe: summarize a manifest
 * 6. status: subscription pending-update check
 *
 * Output shapes mirror the MCP tools; --json emits the same envelopes.
 */

import { readFileSync } from 'node:fs'
import { type RegisteredCommand } from './registry'
import {
  applyChannelUpdate,
  ChannelManifestSchema,
  createChannel,
  hasPendingUpdate,
  publishUpdate,
  subscribeToChannel,
  verifyManifest,
} from '@learning-hub/core'

function parseFlag(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag)
}

/** Read a JSON payload from --data, --file or (last resort) stdin. */
function readJsonPayload(args: string[]): unknown {
  const inline = parseFlag(args, '--data')
  if (inline) return JSON.parse(inline)
  const file = parseFlag(args, '--file')
  if (file) return JSON.parse(readFileSync(file, 'utf8'))
  return JSON.parse(readFileSync(0, 'utf8'))
}

function shareChannelsCommand(args: string[]): void {
  const sub = args[0] ?? 'describe'
  const asJson = hasFlag(args, '--json')

  switch (sub) {
    case 'create': {
      const body = readJsonPayload(args) as Parameters<typeof createChannel>[0]
      const manifest = createChannel(body)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, manifest }))
      } else {
        console.log(`\nChannel created: ${manifest.channelId}`)
        console.log(`Title:      ${manifest.title}`)
        console.log(`Author:     ${manifest.authorHandle}`)
        console.log(`Visibility: ${manifest.visibility}`)
        console.log(
          `Version:    ${manifest.currentVersion} (${manifest.versions[0].items.length} items)`,
        )
      }
      return
    }
    case 'publish': {
      const body = readJsonPayload(args) as {
        manifest: unknown
        items: { id: string; content: Record<string, unknown> }[]
        changelog: string
      }
      const manifest = publishUpdate(
        ChannelManifestSchema.parse(body.manifest),
        body.items,
        body.changelog,
      )
      if (asJson) {
        console.log(JSON.stringify({ ok: true, manifest }))
      } else {
        console.log(`\nPublished version ${manifest.currentVersion} of ${manifest.channelId}`)
        console.log(`Changelog: ${manifest.versions[manifest.versions.length - 1].changelog}`)
      }
      return
    }
    case 'apply': {
      const body = readJsonPayload(args) as Parameters<typeof applyChannelUpdate>[0] extends never
        ? never
        : {
            localItems: Parameters<typeof applyChannelUpdate>[0]
            version: Parameters<typeof applyChannelUpdate>[1]
          }
      const { items, result } = applyChannelUpdate(body.localItems, body.version)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, items, result }))
      } else {
        console.log('\nChannel Update Applied')
        console.log(`Added:     ${result.addedCount}`)
        console.log(`Updated:   ${result.updatedCount}`)
        console.log(`Removed:   ${result.removedCount} (kept locally)`)
        console.log(
          `Conflicts: ${result.conflictCount}${result.conflicts.length ? ` (${result.conflicts.join(', ')})` : ''}`,
        )
        console.log(`Version:   ${result.newVersion}`)
      }
      return
    }
    case 'verify': {
      const body = readJsonPayload(args) as { manifest: unknown }
      const report = verifyManifest(ChannelManifestSchema.parse(body.manifest))
      if (asJson) {
        console.log(JSON.stringify({ ok: true, report }))
      } else {
        console.log(
          report.ok
            ? '\nManifest verified: all checksums hold.'
            : `\nTampered versions: ${report.badVersions.join(', ')}`,
        )
      }
      return
    }
    case 'describe': {
      const body = readJsonPayload(args) as { manifest: unknown }
      const m = ChannelManifestSchema.parse(body.manifest)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, manifest: m }))
      } else {
        console.log(`\n${m.title} (${m.channelId})`)
        console.log(`Type:        ${m.type}`)
        console.log(`Author:      ${m.authorHandle}`)
        console.log(`Visibility:  ${m.visibility}`)
        console.log(`Version:     ${m.currentVersion}`)
        console.log(`Created:     ${m.createdAt}`)
        for (const v of m.versions) {
          console.log(`  v${v.version}  ${v.publishedAt}  ${v.items.length} items  ${v.changelog}`)
        }
      }
      return
    }
    case 'status': {
      const body = readJsonPayload(args) as {
        channelId: string
        localVersion: number
        manifest: unknown
      }
      const m = ChannelManifestSchema.parse(body.manifest)
      const sub = { ...subscribeToChannel(body.channelId), localVersion: body.localVersion }
      const pending = hasPendingUpdate(sub, m)
      if (asJson) {
        console.log(
          JSON.stringify({
            ok: true,
            pending,
            localVersion: body.localVersion,
            currentVersion: m.currentVersion,
          }),
        )
      } else {
        console.log(
          pending
            ? `\nUpdate available: local v${body.localVersion}, channel v${m.currentVersion} (${m.currentVersion - body.localVersion} behind).`
            : `\nUp to date at v${body.localVersion}.`,
        )
      }
      return
    }
    default:
      console.error(`unknown subcommand: ${sub}`)
      console.error('usage: share-channels [create|publish|apply|verify|describe|status] [--json]')
      process.exitCode = 1
  }
}

export const shareChannelCommands: RegisteredCommand[] = [
  {
    name: 'share-channels',
    description: 'lh-share/v2 versioned shared material channels (create, publish, apply, verify)',
    usage: '[create|publish|apply|verify|describe|status]',
    run: (runArgs) => shareChannelsCommand(runArgs),
  },
]
