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
  applyAllPendingVersions,
  applyChannelUpdate,
  ChannelCollectionSchema,
  ChannelManifestSchema,
  canSubscribe,
  diffVersions,
  issueInviteToken,
  migrateV1Envelope,
  createChannel,
  hasPendingUpdate,
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
  hostChannel,
  getHostedChannel,
  listHostedChannels,
  publishHostedChannelVersion,
  unhostChannel,
  createChannelProposal,
  listChannelProposals,
  decideChannelProposal,
  saveCollection,
  getCollection,
  listCollections,
  deleteCollection,
} from '@learning-hub/db'

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
    case 'diff': {
      const body = readJsonPayload(args) as {
        manifest: unknown
        fromVersion: number
        toVersion: number
      }
      const m = ChannelManifestSchema.parse(body.manifest)
      const from = m.versions.find((v) => v.version === body.fromVersion)
      const to = m.versions.find((v) => v.version === body.toVersion)
      if (!from || !to) {
        console.error('version not found in manifest')
        process.exitCode = 1
        return
      }
      const diff = diffVersions(from, to)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, diff }))
      } else {
        console.log(`\nDiff v${body.fromVersion} -> v${body.toVersion}`)
        console.log(`Added:     ${diff.addedIds.join(', ') || '(none)'}`)
        console.log(`Removed:   ${diff.removedIds.join(', ') || '(none)'}`)
        console.log(`Changed:   ${diff.changedIds.join(', ') || '(none)'}`)
        console.log(`Unchanged: ${diff.unchangedIds.length} item(s)`)
      }
      return
    }
    case 'apply-all': {
      const body = readJsonPayload(args) as {
        localItems: Parameters<typeof applyAllPendingVersions>[0]
        localVersion: number
        channelId: string
        manifest: unknown
      }
      const m = ChannelManifestSchema.parse(body.manifest)
      const sub = {
        channelId: body.channelId,
        localVersion: body.localVersion,
        subscribedAt: '',
        lastSyncAt: null,
      }
      const { items, result, appliedVersions } = applyAllPendingVersions(body.localItems, sub, m)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, items, result, appliedVersions }))
      } else {
        console.log(`\nApplied versions: ${appliedVersions.join(', ') || '(none)'}`)
        console.log(
          `Added ${result.addedCount}, updated ${result.updatedCount}, kept ${result.removedCount}, conflicts ${result.conflictCount}`,
        )
      }
      return
    }
    case 'migrate-v1': {
      const body = readJsonPayload(args) as Parameters<typeof migrateV1Envelope>[0]
      const manifest = migrateV1Envelope(body)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, manifest }))
      } else {
        console.log(
          `\nMigrated to channel ${manifest.channelId} at version 1 (${manifest.versions[0].items.length} items).`,
        )
      }
      return
    }
    case 'invite': {
      const channelId = parseFlag(args, '--channel')
      const secret = parseFlag(args, '--secret')
      if (!channelId || !secret) {
        console.error('usage: share-channels invite --channel <id> --secret <creator-secret>')
        process.exitCode = 1
        return
      }
      const token = issueInviteToken(channelId, secret)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, channelId, inviteToken: token }))
      } else {
        console.log(`\nInvite token for ${channelId}: ${token}`)
        console.log('Share the token with invitees; rotate the secret to revoke all tokens.')
      }
      return
    }
    case 'check-access': {
      const body = readJsonPayload(args) as { manifest: unknown; inviteToken?: string }
      const m = ChannelManifestSchema.parse(body.manifest)
      const gate = canSubscribe(m, body.inviteToken)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, ...gate }))
      } else {
        console.log(gate.allowed ? '\nSubscription allowed.' : `\nRefused: ${gate.reason}`)
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
    case 'subscribe': {
      const body = readJsonPayload(args) as {
        manifest: unknown
        inviteToken?: string
        hostBaseUrl?: string
      }
      const manifest = ChannelManifestSchema.parse(body.manifest)
      const check = verifyManifest(manifest)
      if (!check.ok) {
        console.error(`checksum mismatch in versions: ${check.badVersions.join(', ')}`)
        process.exitCode = 1
        return
      }
      const access = canSubscribe(manifest, body.inviteToken)
      if (!access.allowed) {
        console.error(access.reason)
        process.exitCode = 1
        return
      }
      const store = new DbChannelSyncStore()
      if (store.getSubscription(manifest.channelId)) {
        console.error('already subscribed to this channel')
        process.exitCode = 1
        return
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
      if (body.hostBaseUrl) setSubscriptionHost(manifest.channelId, body.hostBaseUrl)
      if (asJson) {
        console.log(
          JSON.stringify({
            ok: true,
            subscription: store.getSubscription(manifest.channelId),
            itemCount: seeded.items.length,
          }),
        )
      } else {
        console.log(`\nSubscribed to ${manifest.channelId} (${manifest.title})`)
        console.log(`Version: ${seeded.result.newVersion} (${seeded.items.length} items)`)
        if (body.hostBaseUrl) console.log(`Host:    ${body.hostBaseUrl}`)
      }
      return
    }
    case 'subscriptions': {
      const rows = listChannelSubscriptions()
      if (asJson) {
        console.log(JSON.stringify({ ok: true, subscriptions: rows }))
      } else {
        console.log(`\nChannel subscriptions (${rows.length})`)
        for (const r of rows) {
          const pending = r.hasPending
            ? ` — ${r.seenVersion - r.localVersion} update(s) waiting`
            : ''
          console.log(
            `  ${r.channelId}  v${r.localVersion}  ${r.title || '(untitled)'} by ${r.authorHandle || '?'}${pending}`,
          )
        }
      }
      return
    }
    case 'import': {
      const channelId = args[1]
      if (!channelId) {
        console.error('usage: share-channels import <channelId> [--json]')
        process.exitCode = 1
        return
      }
      const row = listChannelSubscriptions().find((r) => r.channelId === channelId)
      if (!row) {
        console.error('no local subscription for this channel')
        process.exitCode = 1
        return
      }
      const result =
        row.contentType === 'course' ? importChannelCourse(channelId) : importChannelDeck(channelId)
      if (!result.ok) {
        console.error(result.error ?? 'import failed')
        process.exitCode = 1
        return
      }
      if (asJson) {
        console.log(JSON.stringify(result))
      } else if (row.contentType === 'course') {
        const r = result as ReturnType<typeof importChannelCourse>
        console.log(`\nImported course ${channelId} -> ${r.courseSlug}`)
      } else {
        const r = result as ReturnType<typeof importChannelDeck>
        console.log(
          `\nImported ${channelId} into deck "${r.deckName}": ${r.created} new, ${r.updated} updated`,
        )
      }
      return
    }
    case 'publish-from-library': {
      const channelId = parseFlag(args, '--channel')
      const author = parseFlag(args, '--author')
      const visibility = (parseFlag(args, '--visibility') ?? 'link') as 'link' | 'invite'
      const deckIdRaw = parseFlag(args, '--deck')
      const courseIdRaw = parseFlag(args, '--course')
      if (!channelId || !author || (!deckIdRaw && !courseIdRaw)) {
        console.error(
          'usage: share-channels publish-from-library --channel <id> --author <handle> (--deck <deckId> | --course <courseId>) [--visibility link|invite] [--title <t>] [--changelog <c>] [--json]',
        )
        process.exitCode = 1
        return
      }
      const result = deckIdRaw
        ? publishDeckAsChannel({
            deckId: Number(deckIdRaw),
            channelId,
            title: parseFlag(args, '--title') ?? `Channel ${channelId}`,
            authorHandle: author,
            visibility,
            ...(parseFlag(args, '--changelog')
              ? { changelog: parseFlag(args, '--changelog')! }
              : {}),
          })
        : publishCourseAsChannel({
            courseId: Number(courseIdRaw),
            channelId,
            authorHandle: author,
            visibility,
            ...(parseFlag(args, '--changelog')
              ? { changelog: parseFlag(args, '--changelog')! }
              : {}),
          })
      if (!result.ok) {
        console.error(result.error ?? 'publish failed')
        process.exitCode = 1
        return
      }
      if (asJson) {
        console.log(
          JSON.stringify({ ok: true, manifest: result.manifest, skipped: result.skipped }),
        )
      } else {
        const m = result.manifest!
        console.log(
          `\nChannel ${m.channelId} published at v${m.currentVersion} (${m.versions[0].items.length} items)`,
        )
        if (result.skipped?.length) {
          console.log(`Skipped ${result.skipped.length} non-transportable card(s).`)
        }
      }
      return
    }
    case 'host': {
      const data = readJsonPayload(args)
      if (!data) {
        console.error('usage: share-channels host --data <manifest-json> | --file <path> [--json]')
        process.exitCode = 1
        return
      }
      const result = hostChannel(ChannelManifestSchema.parse(data))
      if (!result.ok) {
        console.error(result.error ?? 'host failed')
        process.exitCode = 1
        return
      }
      if (asJson) {
        console.log(JSON.stringify({ ok: true }))
      } else {
        console.log(
          `Channel ${result.manifest!.channelId} now hosted at v${result.manifest!.currentVersion}.`,
        )
      }
      return
    }
    case 'host-list': {
      const channels = listHostedChannels()
      if (asJson) {
        console.log(JSON.stringify({ ok: true, channels }))
      } else {
        console.log(`\nHosted channels (${channels.length})`)
        for (const c of channels) console.log(`  ${c.channelId}  v${c.currentVersion}  ${c.title}`)
      }
      return
    }
    case 'host-get': {
      const channelId = parseFlag(args, '--channel')
      if (!channelId) {
        console.error('usage: share-channels host-get --channel <id> [--json]')
        process.exitCode = 1
        return
      }
      const manifest = getHostedChannel(channelId)
      if (!manifest) {
        console.error('channel not hosted here')
        process.exitCode = 1
        return
      }
      console.log(JSON.stringify(manifest, null, asJson ? 0 : 2))
      return
    }
    case 'host-publish': {
      const channelId = parseFlag(args, '--channel')
      const changelog = parseFlag(args, '--changelog') ?? 'Update'
      const data = readJsonPayload(args)
      if (!channelId || !Array.isArray(data)) {
        console.error(
          'usage: share-channels host-publish --channel <id> (--data <items-json> | --file <path>) [--changelog <c>] [--json]',
        )
        process.exitCode = 1
        return
      }
      const result = publishHostedChannelVersion({ channelId, items: data, changelog })
      if (!result.ok) {
        console.error(result.error ?? 'publish failed')
        process.exitCode = 1
        return
      }
      if (asJson) {
        console.log(JSON.stringify({ ok: true, version: result.manifest!.currentVersion }))
      } else {
        console.log(`Channel ${channelId} published at v${result.manifest!.currentVersion}.`)
      }
      return
    }
    case 'host-unhost': {
      const channelId = parseFlag(args, '--channel')
      if (!channelId) {
        console.error('usage: share-channels host-unhost --channel <id>')
        process.exitCode = 1
        return
      }
      const result = unhostChannel(channelId)
      if (!result.ok) {
        console.error(result.error ?? 'unhost failed')
        process.exitCode = 1
        return
      }
      console.log(asJson ? JSON.stringify({ ok: true }) : `Channel ${channelId} unhosted.`)
      return
    }
    case 'propose': {
      const channelId = parseFlag(args, '--channel')
      const author = parseFlag(args, '--author')
      const title = parseFlag(args, '--title')
      const data = readJsonPayload(args)
      if (!channelId || !author || !title || !Array.isArray(data)) {
        console.error(
          'usage: share-channels propose --channel <id> --author <handle> --title <t> (--data <operations-json> | --file <path>) [--note <n>] [--json]',
        )
        process.exitCode = 1
        return
      }
      const result = createChannelProposal({
        channelId,
        authorHandle: author,
        title,
        operations: data,
        ...(parseFlag(args, '--note') ? { note: parseFlag(args, '--note')! } : {}),
      })
      if (!result.ok) {
        console.error(result.error ?? 'proposal failed')
        process.exitCode = 1
        return
      }
      if (asJson) {
        console.log(JSON.stringify({ ok: true, proposal: result.proposal }))
      } else {
        console.log(
          `Proposal ${result.proposal!.id} created against ${channelId} v${result.proposal!.baseVersion}.`,
        )
      }
      return
    }
    case 'proposals': {
      const channelId = parseFlag(args, '--channel')
      if (!channelId) {
        console.error(
          'usage: share-channels proposals --channel <id> [--status open|accepted|declined] [--json]',
        )
        process.exitCode = 1
        return
      }
      const status = parseFlag(args, '--status') as 'open' | 'accepted' | 'declined' | undefined
      const proposals = listChannelProposals(channelId, status)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, proposals }))
      } else {
        console.log(`\nProposals for ${channelId} (${proposals.length})`)
        for (const pr of proposals) {
          console.log(
            `  [${pr.status}] ${pr.id.slice(0, 8)}  base v${pr.baseVersion}  ${pr.authorHandle}: ${pr.title}`,
          )
        }
      }
      return
    }
    case 'proposal-decide': {
      const proposalId = parseFlag(args, '--proposal')
      const decision = parseFlag(args, '--decision') as 'accept' | 'decline' | undefined
      if (!proposalId || (decision !== 'accept' && decision !== 'decline')) {
        console.error(
          'usage: share-channels proposal-decide --proposal <id> --decision accept|decline [--json]',
        )
        process.exitCode = 1
        return
      }
      const result = decideChannelProposal(proposalId, decision)
      if (!result.ok) {
        console.error(result.error ?? 'decision failed')
        process.exitCode = 1
        return
      }
      if (asJson) {
        console.log(JSON.stringify({ ok: true, proposal: result.proposal }))
      } else if (decision === 'accept') {
        console.log(`Proposal accepted; channel now at v${result.version}.`)
      } else {
        console.log('Proposal declined.')
      }
      return
    }
    case 'collection-save': {
      const data = readJsonPayload(args)
      const result = saveCollection(ChannelCollectionSchema.parse(data))
      if (!result.ok) {
        console.error(result.error ?? 'save failed')
        process.exitCode = 1
        return
      }
      console.log(
        asJson
          ? JSON.stringify({ ok: true })
          : `Collection ${result.collection!.id} saved (${result.collection!.channels.length} channels).`,
      )
      return
    }
    case 'collections': {
      const collections = listCollections()
      if (asJson) {
        console.log(JSON.stringify({ ok: true, collections }))
      } else {
        console.log(`\nCollections (${collections.length})`)
        for (const c of collections) {
          console.log(`  ${c.id}  ${c.title}  by ${c.ownerHandle}  ${c.channelCount} channel(s)`)
        }
      }
      return
    }
    case 'collection-get': {
      const id = parseFlag(args, '--id')
      if (!id) {
        console.error('usage: share-channels collection-get --id <id> [--json]')
        process.exitCode = 1
        return
      }
      const collection = getCollection(id)
      if (!collection) {
        console.error('collection not found')
        process.exitCode = 1
        return
      }
      console.log(JSON.stringify(collection, null, asJson ? 0 : 2))
      return
    }
    case 'collection-delete': {
      const id = parseFlag(args, '--id')
      if (!id) {
        console.error('usage: share-channels collection-delete --id <id>')
        process.exitCode = 1
        return
      }
      const result = deleteCollection(id)
      if (!result.ok) {
        console.error(result.error ?? 'delete failed')
        process.exitCode = 1
        return
      }
      console.log(asJson ? JSON.stringify({ ok: true }) : `Collection ${id} deleted.`)
      return
    }
    default:
      console.error(`unknown subcommand: ${sub}`)
      console.error(
        'usage: share-channels [create|publish|apply|apply-all|diff|verify|describe|status|migrate-v1|invite|check-access|subscribe|subscriptions|sync|sync-all|sync-records] [--json]',
      )
      process.exitCode = 1
  }
}

async function shareChannelsSyncCommand(args: string[]): Promise<void> {
  const sub = args[0]
  const asJson = hasFlag(args, '--json')
  const store = new DbChannelSyncStore()
  if (sub === 'sync' || sub === 'sync-records') {
    const channelId = args[1]
    if (!channelId) {
      console.error(`usage: share-channels ${sub} <channelId> [--json]`)
      process.exitCode = 1
      return
    }
    if (sub === 'sync-records') {
      const records = listSyncRecords(channelId)
      if (asJson) {
        console.log(JSON.stringify({ ok: true, records }))
      } else {
        console.log(`\nSync records for ${channelId} (${records.length})`)
        for (const r of records) {
          console.log(
            `  ${r.at}  ${r.outcome}  v${r.fromVersion} -> v${r.toVersion}${r.errorMessage ? `  (${r.errorMessage})` : ''}`,
          )
        }
      }
      return
    }
    if (!store.getSubscription(channelId)) {
      console.error('no local subscription for this channel')
      process.exitCode = 1
      return
    }
    const row = listChannelSubscriptions().find((r) => r.channelId === channelId)
    const record = await syncSubscriptionOverHttp(
      store,
      channelId,
      parseFlag(args, '--host') ?? row?.hostBaseUrl ?? null,
      fetch,
    )
    if (asJson) {
      console.log(JSON.stringify({ ok: record.outcome !== 'failed', record }))
    } else {
      console.log(
        record.outcome === 'updated'
          ? `\nUpdated ${channelId}: v${record.fromVersion} -> v${record.toVersion}`
          : record.outcome === 'already-current'
            ? `\n${channelId} is already current (v${record.toVersion})`
            : `\nSync failed for ${channelId}: ${record.errorMessage}`,
      )
    }
    return
  }
  if (sub === 'sync-all') {
    const summary = await syncAllSubscriptions(store, listChannelSubscriptions(), fetch)
    if (asJson) {
      console.log(JSON.stringify({ ok: true, summary, records: summary.records }))
    } else {
      console.log(
        `\nSync complete: ${summary.checked} checked, ${summary.updated} updated, ${summary.alreadyCurrent} current, ${summary.failed} failed`,
      )
      for (const r of summary.records.filter((rec) => rec.outcome !== 'already-current')) {
        console.log(`  ${r.channelId}: ${r.outcome}`)
      }
    }
    return
  }
  console.error(`unknown subcommand: ${sub}`)
  process.exitCode = 1
}

export const shareChannelCommands: RegisteredCommand[] = [
  {
    name: 'share-channels',
    description: 'lh-share/v2 versioned shared material channels (create, publish, apply, verify)',
    usage:
      '[create|publish|apply|apply-all|diff|verify|describe|status|migrate-v1|invite|check-access|subscribe|subscriptions|sync|sync-all|sync-records]',
    run: async (runArgs) => {
      if (['sync', 'sync-all', 'sync-records'].includes(runArgs[0] ?? '')) {
        await shareChannelsSyncCommand(runArgs)
      } else {
        shareChannelsCommand(runArgs)
      }
    },
  },
]
