'use client'

/**
 * ShareChannelsPanel: publish, subscribe and update shared material channels
 * (lh-share/v2). Engine calls go through /api/share-channels; subscriptions
 * and local item copies persist in localStorage (manual mode).
 */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiSend } from '@/lib/transport'
import { acceptChannelVersion, diffVersions } from '@learning-hub/core/share-channels'
import { Badge, Button, Callout, Panel, Tabs, TextArea, TextField } from '@/ui'

type Manifest = {
  channelId: string
  type: string
  title: string
  authorHandle: string
  visibility: 'link' | 'invite'
  currentVersion: number
  versions: {
    version: number
    changelog: string
    items: { id: string; content: Record<string, unknown>; revision: number }[]
  }[]
}

type LocalItem = {
  channelItemId: string | null
  channelContent: Record<string, unknown> | null
  channelRevision: number | null
  localContent: Record<string, unknown>
  learnerState: Record<string, unknown>
}

type SubscriptionRecord = {
  manifest: Manifest
  localItems: LocalItem[]
  localVersion: number
  /** Where the channel is hosted; enables the update banner's remote checks. */
  hostBaseUrl?: string
  inviteToken?: string
}

type MergeResult = {
  addedCount: number
  updatedCount: number
  removedCount: number
  conflictCount: number
  conflicts: string[]
  newVersion: number
}

type HostedChannel = {
  channelId: string
  title: string
  currentVersion: number
  updatedAt: string
}

type ChannelAnalyticsView = {
  currentVersion: number
  itemCount: number
  lifetime: { added: number; removed: number; changed: number }
  churnRate: number
  proposals: {
    total: number
    open: number
    accepted: number
    declined: number
    topContributors: { authorHandle: string; accepted: number }[]
  }
}

type SyncStats = {
  totalSyncs: number
  updated: number
  alreadyCurrent: number
  failed: number
  lastSyncAt: string | null
  lastError: string | null
}

type CollectionSummary = {
  id: string
  title: string
  ownerHandle: string
  channelCount: number
  updatedAt: string
}

type Collection = {
  id: string
  title: string
  description: string
  ownerHandle: string
  channels: Manifest[]
}

type Proposal = {
  id: string
  channelId: string
  authorHandle: string
  title: string
  note: string
  baseVersion: number
  operations: { kind: string }[]
  status: 'open' | 'accepted' | 'declined'
  createdAt: string
  acceptedVersion?: number
}

const STORAGE_KEY = 'lh-share-channels-v1'

function loadSubscriptions(): SubscriptionRecord[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SubscriptionRecord[]) : []
  } catch {
    return []
  }
}

function saveSubscriptions(subs: SubscriptionRecord[]): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(subs))
}

export function ShareChannelsPanel() {
  type PanelTab = 'subscriptions' | 'publish' | 'subscribe' | 'update' | 'hosting' | 'collections'
  const [tab, setTab] = useState<PanelTab>('subscriptions')
  const [subs, setSubs] = useState<SubscriptionRecord[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  // Publish form
  const [channelId, setChannelId] = useState('')
  const [title, setTitle] = useState('')
  const [handle, setHandle] = useState('')
  const [visibility, setVisibility] = useState<'link' | 'invite'>('link')
  const [itemsJson, setItemsJson] = useState('')
  const [createdManifest, setCreatedManifest] = useState('')

  // Subscribe form
  const [manifestText, setManifestText] = useState('')
  const [hostUrl, setHostUrl] = useState('')

  // Update form
  const [updateText, setUpdateText] = useState('')
  const [lastMerge, setLastMerge] = useState<MergeResult | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Hosting + proposals
  const [hosted, setHosted] = useState<HostedChannel[]>([])
  const [hostManifestText, setHostManifestText] = useState('')
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [proposalChannel, setProposalChannel] = useState<string | null>(null)
  const [proposalAuthor, setProposalAuthor] = useState('')
  const [proposalTitle, setProposalTitle] = useState('')
  const [proposalNote, setProposalNote] = useState('')
  const [proposalOps, setProposalOps] = useState('')
  const [analytics, setAnalytics] = useState<Record<string, ChannelAnalyticsView>>({})
  const [inviteChannel, setInviteChannel] = useState<string | null>(null)
  const [inviteSecret, setInviteSecret] = useState('')
  const [inviteToken, setInviteToken] = useState<string | null>(null)
  const [collections, setCollections] = useState<CollectionSummary[]>([])
  const [collectionJson, setCollectionJson] = useState('')
  const [newCollectionId, setNewCollectionId] = useState('')
  const [newCollectionTitle, setNewCollectionTitle] = useState('')
  const [newCollectionHandle, setNewCollectionHandle] = useState('')
  const [collectionPick, setCollectionPick] = useState<string[]>([])
  const [syncStats, setSyncStats] = useState<Record<string, SyncStats>>({})

  useEffect(() => {
    setSubs(loadSubscriptions())
  }, [])

  useEffect(() => {
    if (tab === 'hosting') void refreshHosted()
    if (tab === 'collections') {
      void refreshCollections()
      void refreshHosted()
    }
  }, [tab])

  async function createCh() {
    setNotice(null)
    const items = JSON.parse(itemsJson) as { id: string; content: Record<string, unknown> }[]
    const res = await apiSend<{ manifest: Manifest }>('/api/share-channels', 'POST', {
      action: 'create',
      channelId,
      type: 'deck',
      title,
      authorHandle: handle,
      visibility,
      items,
      changelog: 'Initial publication',
    })
    setCreatedManifest(JSON.stringify(res.manifest, null, 2))
    setNotice(
      `Channel ${res.manifest.channelId} created at version 1. Copy the manifest to share it.`,
    )
  }

  async function subscribe() {
    setNotice(null)
    const parsed = JSON.parse(manifestText) as Manifest
    const latest = parsed.versions[parsed.versions.length - 1]
    const localItems: LocalItem[] = latest.items.map((i) => ({
      channelItemId: i.id,
      channelContent: i.content,
      channelRevision: i.revision,
      localContent: i.content,
      learnerState: {},
    }))
    const next = [
      ...subs.filter((s) => s.manifest.channelId !== parsed.channelId),
      {
        manifest: parsed,
        localItems,
        localVersion: parsed.currentVersion,
        ...(hostUrl.trim() ? { hostBaseUrl: hostUrl.trim() } : {}),
      },
    ]
    setSubs(next)
    saveSubscriptions(next)
    setNotice(`Subscribed to ${parsed.title} at version ${parsed.currentVersion}.`)
    setManifestText('')
    setHostUrl('')
  }

  function pendingDiff(): {
    added: number
    removed: number
    changed: number
    channelId: string
  } | null {
    try {
      const incoming = JSON.parse(updateText) as Manifest
      const sub = subs.find((s) => s.manifest.channelId === incoming.channelId)
      if (!sub) return null
      const oldV = sub.manifest.versions[sub.manifest.versions.length - 1]
      const newV = incoming.versions[incoming.versions.length - 1]
      const d = diffVersions(oldV, newV)
      return {
        added: d.addedIds.length,
        removed: d.removedIds.length,
        changed: d.changedIds.length,
        channelId: incoming.channelId,
      }
    } catch {
      return null
    }
  }

  function resolveConflict(channelItemId: string) {
    const next = subs.map((s) => {
      if (expandedId === null || s.manifest.channelId !== expandedId) return s
      const latest = s.manifest.versions[s.manifest.versions.length - 1]
      return {
        ...s,
        localItems: s.localItems.map((i) =>
          i.channelItemId === channelItemId ? acceptChannelVersion(i, latest) : i,
        ),
      }
    })
    setSubs(next)
    saveSubscriptions(next)
  }

  function itemConflicts(s: SubscriptionRecord): string[] {
    return s.localItems
      .filter(
        (i) =>
          i.channelContent !== null &&
          JSON.stringify(i.channelContent) !== JSON.stringify(i.localContent),
      )
      .map((i) => i.channelItemId!)
  }

  function itemTitle(content: Record<string, unknown>): string {
    const v = content.front ?? content.title ?? content.name ?? content.question
    return typeof v === 'string' && v.length > 0 ? v.slice(0, 80) : '(untitled item)'
  }

  async function applyUpdate() {
    setNotice(null)
    setLastMerge(null)
    const incoming = JSON.parse(updateText) as Manifest
    const sub = subs.find((s) => s.manifest.channelId === incoming.channelId)
    if (!sub) {
      setNotice(`No local subscription for ${incoming.channelId}. Subscribe first.`)
      return
    }
    if (incoming.currentVersion <= sub.localVersion) {
      setNotice(`Already at version ${sub.localVersion}; nothing to apply.`)
      return
    }
    const latest = incoming.versions[incoming.versions.length - 1]
    const res = await apiSend<{ items: LocalItem[] } & { result: MergeResult }>(
      '/api/share-channels',
      'POST',
      { action: 'apply', localItems: sub.localItems, version: latest },
    )
    const next = subs.map((s) =>
      s.manifest.channelId === incoming.channelId
        ? { manifest: incoming, localItems: res.items, localVersion: incoming.currentVersion }
        : s,
    )
    setSubs(next)
    saveSubscriptions(next)
    setLastMerge(res.result)
    setUpdateText('')
  }

  async function refreshHosted() {
    const res = await apiSend<{ ok: boolean; channels: HostedChannel[] }>(
      '/api/share-channels',
      'POST',
      { action: 'host-list' },
    )
    setHosted(res.channels ?? [])
    // refresh the open proposal inbox too
    if (proposalChannel) {
      await loadProposals(proposalChannel)
    }
  }

  async function hostFromText() {
    setNotice(null)
    const manifest = JSON.parse(hostManifestText) as Manifest
    const res = await apiSend<{ ok: boolean; error?: string }>('/api/share-channels', 'POST', {
      action: 'host',
      manifest,
    })
    if (!res.ok) {
      setNotice(res.error ?? 'Could not host that channel.')
      return
    }
    setNotice(`Channel ${manifest.channelId} is now hosted here.`)
    setHostManifestText('')
    await refreshHosted()
  }

  async function unhost(channelIdToRemove: string) {
    setNotice(null)
    await apiSend('/api/share-channels', 'POST', {
      action: 'host-unhost',
      channelId: channelIdToRemove,
    })
    setNotice(`Channel ${channelIdToRemove} is no longer hosted here.`)
    if (proposalChannel === channelIdToRemove) {
      setProposalChannel(null)
      setProposals([])
    }
    await refreshHosted()
  }

  async function loadProposals(channelIdFor: string) {
    const res = await apiSend<{ ok: boolean; proposals: Proposal[] }>(
      '/api/share-channels',
      'POST',
      { action: 'proposal-list', channelId: channelIdFor },
    )
    setProposalChannel(channelIdFor)
    setProposals(res.proposals ?? [])
  }

  async function submitProposal() {
    setNotice(null)
    if (!proposalChannel) return
    const operations = JSON.parse(proposalOps) as { kind: string }[]
    const res = await apiSend<{ ok: boolean; error?: string }>('/api/share-channels', 'POST', {
      action: 'proposal-create',
      channelId: proposalChannel,
      authorHandle: proposalAuthor,
      title: proposalTitle,
      note: proposalNote,
      operations,
    })
    if (!res.ok) {
      setNotice(res.error ?? 'Proposal was rejected.')
      return
    }
    setNotice('Proposal submitted. The channel owner can review it below.')
    setProposalTitle('')
    setProposalNote('')
    setProposalOps('')
    await loadProposals(proposalChannel)
  }

  async function loadSyncStats(channelIdFor: string) {
    const res = await apiSend<{ ok: boolean; stats?: SyncStats }>('/api/share-channels', 'POST', {
      action: 'sync-stats',
      channelId: channelIdFor,
    })
    if (res.ok && res.stats) {
      setSyncStats((prev) => ({ ...prev, [channelIdFor]: res.stats! }))
    }
  }

  async function refreshCollections() {
    const res = await apiSend<{ ok: boolean; collections: CollectionSummary[] }>(
      '/api/share-channels',
      'POST',
      { action: 'collection-list' },
    )
    setCollections(res.collections ?? [])
  }

  async function saveNewCollection() {
    setNotice(null)
    const manifests: Manifest[] = []
    for (const id of collectionPick) {
      const res = await apiSend<{ ok: boolean; manifest?: Manifest }>(
        '/api/share-channels',
        'POST',
        { action: 'host-get', channelId: id },
      )
      if (res.ok && res.manifest) manifests.push(res.manifest)
    }
    if (manifests.length === 0) {
      setNotice('Pick at least one hosted channel for the collection.')
      return
    }
    const res = await apiSend<{ ok: boolean; error?: string }>('/api/share-channels', 'POST', {
      action: 'collection-save',
      collection: {
        schema: 'lh-share-collection/v1',
        id: newCollectionId,
        title: newCollectionTitle,
        description: '',
        ownerHandle: newCollectionHandle,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        channels: manifests,
      },
    })
    if (!res.ok) {
      setNotice(res.error ?? 'Could not save the collection.')
      return
    }
    setNotice(`Collection ${newCollectionId} saved with ${manifests.length} channel(s).`)
    setNewCollectionId('')
    setNewCollectionTitle('')
    setCollectionPick([])
    await refreshCollections()
  }

  async function importCollection() {
    setNotice(null)
    const parsed = JSON.parse(collectionJson) as Collection
    const save = await apiSend<{ ok: boolean }>('/api/share-channels', 'POST', {
      action: 'collection-save',
      collection: parsed,
    })
    if (!save.ok) {
      setNotice('Could not store that collection.')
      return
    }
    // subscribe to every channel we do not already have
    const have = new Set(subs.map((s) => s.manifest.channelId))
    const added: SubscriptionRecord[] = []
    for (const m of parsed.channels) {
      if (have.has(m.channelId)) continue
      const latest = m.versions[m.versions.length - 1]
      added.push({
        manifest: m,
        localItems: latest.items.map((i) => ({
          channelItemId: i.id,
          channelContent: i.content,
          channelRevision: i.revision,
          localContent: i.content,
          learnerState: {},
        })),
        localVersion: m.currentVersion,
      })
    }
    const next = [...subs, ...added]
    setSubs(next)
    saveSubscriptions(next)
    setNotice(
      `Collection "${parsed.title}" imported: subscribed to ${added.length} new channel(s)` +
        (parsed.channels.length - added.length > 0
          ? `, ${parsed.channels.length - added.length} already present`
          : '') +
        '.',
    )
    setCollectionJson('')
    await refreshCollections()
  }

  async function removeCollection(id: string) {
    setNotice(null)
    await apiSend('/api/share-channels', 'POST', { action: 'collection-delete', id })
    setNotice(`Collection ${id} deleted.`)
    await refreshCollections()
  }

  async function loadAnalytics(channelIdFor: string) {
    setNotice(null)
    const res = await apiSend<{ ok: boolean; analytics?: ChannelAnalyticsView }>(
      '/api/share-channels',
      'POST',
      { action: 'host-analytics', channelId: channelIdFor },
    )
    if (!res.ok || !res.analytics) {
      setNotice('Could not load analytics for that channel.')
      return
    }
    setAnalytics((prev) => ({ ...prev, [channelIdFor]: res.analytics! }))
  }

  async function issueInvite() {
    setNotice(null)
    setInviteToken(null)
    if (!inviteChannel) return
    const res = await apiSend<{ inviteToken?: string }>('/api/share-channels', 'POST', {
      action: 'invite',
      channelId: inviteChannel,
      inviteSecret,
    })
    if (!res.inviteToken) {
      setNotice('Could not issue an invite token.')
      return
    }
    setInviteToken(res.inviteToken)
    setInviteSecret('')
  }

  async function decideProposal(proposalId: string, decision: 'accept' | 'decline') {
    setNotice(null)
    const res = await apiSend<{ ok: boolean; error?: string; version?: number }>(
      '/api/share-channels',
      'POST',
      { action: 'proposal-decide', proposalId, decision },
    )
    if (!res.ok) {
      setNotice(res.error ?? 'Could not record that decision.')
      return
    }
    setNotice(
      decision === 'accept'
        ? `Proposal accepted; the channel is now at version ${res.version}.`
        : 'Proposal declined.',
    )
    if (proposalChannel) await loadProposals(proposalChannel)
    await refreshHosted()
  }

  return (
    <div className="space-y-4">
      <Tabs<PanelTab>
        label="Shared materials"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'subscriptions', label: 'My subscriptions' },
          { key: 'publish', label: 'Publish' },
          { key: 'subscribe', label: 'Subscribe' },
          { key: 'update', label: 'Apply update' },
          { key: 'hosting', label: 'Hosting' },
          { key: 'collections', label: 'Collections' },
        ]}
      />

      {notice && (
        <Callout tone="accent">
          <p className="text-sm">{notice}</p>
        </Callout>
      )}

      {tab === 'subscriptions' && (
        <Panel>
          {subs.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No subscriptions yet. Paste a channel manifest under Subscribe to get started.
            </p>
          ) : (
            <ul className="space-y-2">
              {subs.map((s) => (
                <li key={s.manifest.channelId} className="rounded-lg border border-neutral-200 p-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 text-left"
                    onClick={() =>
                      setExpandedId(
                        expandedId === s.manifest.channelId ? null : s.manifest.channelId,
                      )
                    }
                  >
                    <div>
                      <p className="text-sm font-medium">{s.manifest.title}</p>
                      <p className="text-xs text-neutral-500">
                        {s.manifest.authorHandle} · {s.localItems.length} items · local v
                        {s.localVersion}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {itemConflicts(s).length > 0 && (
                        <Badge tone="accent">{itemConflicts(s).length} conflict(s)</Badge>
                      )}
                      <Badge tone="neutral">{s.manifest.visibility}</Badge>
                      <button
                        type="button"
                        className="text-xs text-indigo-600 underline"
                        onClick={(e) => {
                          e.stopPropagation()
                          void loadSyncStats(s.manifest.channelId)
                        }}
                        data-testid={`sync-health-${s.manifest.channelId}`}
                      >
                        Sync health
                      </button>
                    </div>
                  </button>
                  {expandedId === s.manifest.channelId && syncStats[s.manifest.channelId] && (
                    <div
                      className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600"
                      data-testid={`sync-stats-${s.manifest.channelId}`}
                    >
                      <p>
                        {syncStats[s.manifest.channelId].totalSyncs} sync(s):{' '}
                        {syncStats[s.manifest.channelId].updated} updated,{' '}
                        {syncStats[s.manifest.channelId].alreadyCurrent} already current,{' '}
                        {syncStats[s.manifest.channelId].failed} failed
                        {syncStats[s.manifest.channelId].lastSyncAt
                          ? ` · last ${syncStats[s.manifest.channelId].lastSyncAt!.slice(0, 16).replace('T', ' ')}`
                          : ''}
                      </p>
                      {syncStats[s.manifest.channelId].lastError && (
                        <p className="text-status-warning-text">
                          Last error: {syncStats[s.manifest.channelId].lastError}
                        </p>
                      )}
                    </div>
                  )}
                  {expandedId === s.manifest.channelId && (
                    <ul className="mt-3 space-y-1 border-t border-neutral-100 pt-3">
                      {s.localItems.slice(0, 50).map((i) => {
                        const conflict =
                          i.channelContent !== null &&
                          JSON.stringify(i.channelContent) !== JSON.stringify(i.localContent)
                        return (
                          <li
                            key={i.channelItemId ?? 'mine-' + itemTitle(i.localContent)}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="truncate">{itemTitle(i.localContent)}</span>
                            {conflict && (
                              <Button
                                variant="secondary"
                                onClick={() => resolveConflict(i.channelItemId!)}
                              >
                                Take publisher version
                              </Button>
                            )}
                          </li>
                        )
                      })}
                      {s.localItems.length > 50 && (
                        <li className="text-xs text-neutral-500">
                          and {s.localItems.length - 50} more items
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      {tab === 'publish' && (
        <Panel>
          <div className="space-y-3">
            <TextField
              label="Channel id"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            />
            <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <TextField
              label="Your public handle"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={visibility === 'invite'}
                onChange={(e) => setVisibility(e.target.checked ? 'invite' : 'link')}
              />
              Invite-only (otherwise anyone with the manifest can subscribe)
            </label>
            <TextArea
              label='Items JSON, e.g. [{"id":"c1","content":{"front":"Q","back":"A"}}]'
              value={itemsJson}
              onChange={(e) => setItemsJson(e.target.value)}
              rows={6}
            />
            <Button variant="primary" onClick={() => void createCh()}>
              Create channel
            </Button>
            {createdManifest && (
              <TextArea
                label="Manifest to share (copy this)"
                value={createdManifest}
                onChange={() => undefined}
                rows={10}
              />
            )}
          </div>
        </Panel>
      )}

      {tab === 'subscribe' && (
        <Panel>
          <div className="space-y-3">
            <TextArea
              label="Channel manifest JSON"
              value={manifestText}
              onChange={(e) => setManifestText(e.target.value)}
              rows={8}
              placeholder='{"v":2,"schema":"lh-share/v2",...}'
            />
            <TextField
              label="Host URL (optional, enables update checks)"
              value={hostUrl}
              onChange={(e) => setHostUrl(e.target.value)}
              placeholder="https://hub.example.com"
            />
            <Button variant="primary" onClick={() => void subscribe()}>
              Subscribe
            </Button>
          </div>
        </Panel>
      )}

      {tab === 'update' && (
        <Panel>
          <div className="space-y-3">
            <p className="text-sm text-neutral-600">
              Paste the newer manifest the creator shared. Your notes, progress and scheduling are
              never overwritten; conflicting edits stay yours and are listed for review.
            </p>
            <TextArea
              label="Updated manifest JSON"
              value={updateText}
              onChange={(e) => setUpdateText(e.target.value)}
              rows={8}
            />
            {pendingDiff() && (
              <Callout tone="neutral">
                <p className="text-sm">
                  Incoming changes for {pendingDiff()!.channelId}: {pendingDiff()!.added} added,{' '}
                  {pendingDiff()!.changed} changed, {pendingDiff()!.removed} removed (kept locally).
                </p>
              </Callout>
            )}
            <Button variant="primary" onClick={() => void applyUpdate()}>
              Merge update
            </Button>
            {lastMerge && (
              <Callout tone={lastMerge.conflictCount > 0 ? 'warning' : 'success'}>
                <p className="text-sm">
                  Added {lastMerge.addedCount}, updated {lastMerge.updatedCount}, kept locally{' '}
                  {lastMerge.removedCount}, conflicts {lastMerge.conflictCount}
                  {lastMerge.conflicts.length > 0 ? ` (${lastMerge.conflicts.join(', ')})` : ''}.
                  Now at version {lastMerge.newVersion}.
                </p>
              </Callout>
            )}
          </div>
        </Panel>
      )}

      {tab === 'hosting' && (
        <Panel>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium">Hosted on this hub</h3>
              <p className="text-xs text-neutral-500">
                Channels hosted here can be fetched over HTTP and accept change proposals from
                subscribers.
              </p>
            </div>
            {hosted.length === 0 ? (
              <p className="text-sm text-neutral-500">No channels hosted yet.</p>
            ) : (
              <ul className="space-y-2">
                {hosted.map((c) => (
                  <li
                    key={c.channelId}
                    className="rounded-lg border border-neutral-200 p-3"
                    data-testid={`hosted-channel-${c.channelId}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{c.title}</p>
                        <p className="text-xs text-neutral-500">
                          {c.channelId} · v{c.currentVersion}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/shared/${c.channelId}`}
                          className="text-xs text-indigo-600 underline"
                          data-testid={`browse-${c.channelId}`}
                        >
                          Browse
                        </Link>
                        <Button
                          variant="secondary"
                          onClick={() => {
                            setInviteChannel(inviteChannel === c.channelId ? null : c.channelId)
                            setInviteToken(null)
                          }}
                        >
                          Invite
                        </Button>
                        <Button variant="secondary" onClick={() => void loadAnalytics(c.channelId)}>
                          Analytics
                        </Button>
                        <Button variant="secondary" onClick={() => void loadProposals(c.channelId)}>
                          Proposals
                        </Button>
                        <Button variant="secondary" onClick={() => void unhost(c.channelId)}>
                          Unhost
                        </Button>
                      </div>
                    </div>
                    {inviteChannel === c.channelId && (
                      <div
                        className="mt-3 space-y-2 rounded-lg bg-neutral-50 p-3"
                        data-testid={`invite-panel-${c.channelId}`}
                      >
                        <p className="text-xs font-medium text-neutral-600">
                          Issue an invite token (invite-only channels). Rotating the secret
                          invalidates every outstanding token.
                        </p>
                        <TextField
                          label="Invite secret (min 8 chars)"
                          value={inviteSecret}
                          onChange={(e) => setInviteSecret(e.target.value)}
                        />
                        <Button variant="primary" onClick={() => void issueInvite()}>
                          Issue token
                        </Button>
                        {inviteToken && (
                          <Callout tone="success">
                            <p className="text-xs break-all" data-testid="invite-token">
                              {inviteToken}
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                              Copy it now; it is not stored.
                            </p>
                          </Callout>
                        )}
                      </div>
                    )}
                    {analytics[c.channelId] && (
                      <div
                        className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs text-neutral-600"
                        data-testid={`analytics-${c.channelId}`}
                      >
                        <p>
                          v{analytics[c.channelId].currentVersion} ·{' '}
                          {analytics[c.channelId].itemCount} items · lifetime +
                          {analytics[c.channelId].lifetime.added} / -
                          {analytics[c.channelId].lifetime.removed} / ~
                          {analytics[c.channelId].lifetime.changed} · churn{' '}
                          {Math.round(analytics[c.channelId].churnRate * 100)}%
                        </p>
                        <p>
                          Proposals: {analytics[c.channelId].proposals.total} (
                          {analytics[c.channelId].proposals.open} open,{' '}
                          {analytics[c.channelId].proposals.accepted} accepted,{' '}
                          {analytics[c.channelId].proposals.declined} declined)
                          {analytics[c.channelId].proposals.topContributors.length > 0 &&
                            ` · top: ${analytics[c.channelId].proposals.topContributors
                              .map((t) => `${t.authorHandle} (${t.accepted})`)
                              .join(', ')}`}
                        </p>
                      </div>
                    )}
                    {proposalChannel === c.channelId && (
                      <div className="mt-3 space-y-3 border-t border-neutral-100 pt-3">
                        {proposals.length === 0 ? (
                          <p className="text-sm text-neutral-500">No proposals yet.</p>
                        ) : (
                          <ul className="space-y-2">
                            {proposals.map((pr) => (
                              <li
                                key={pr.id}
                                className="rounded-lg border border-neutral-100 p-2"
                                data-testid={`proposal-${pr.id}`}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div>
                                    <p className="text-sm font-medium">{pr.title}</p>
                                    <p className="text-xs text-neutral-500">
                                      {pr.authorHandle} · base v{pr.baseVersion} ·{' '}
                                      {pr.operations.length} change(s)
                                      {pr.acceptedVersion
                                        ? ` · accepted as v${pr.acceptedVersion}`
                                        : ''}
                                    </p>
                                    {pr.note && (
                                      <p className="mt-1 text-xs text-neutral-600">{pr.note}</p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      tone={
                                        pr.status === 'open'
                                          ? 'accent'
                                          : pr.status === 'accepted'
                                            ? 'success'
                                            : 'neutral'
                                      }
                                    >
                                      {pr.status}
                                    </Badge>
                                    {pr.status === 'open' && (
                                      <>
                                        <Button
                                          variant="primary"
                                          onClick={() => void decideProposal(pr.id, 'accept')}
                                        >
                                          Accept
                                        </Button>
                                        <Button
                                          variant="secondary"
                                          onClick={() => void decideProposal(pr.id, 'decline')}
                                        >
                                          Decline
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="space-y-2 rounded-lg bg-neutral-50 p-3">
                          <p className="text-xs font-medium text-neutral-600">
                            Propose changes to this channel
                          </p>
                          <TextField
                            label="Your handle"
                            value={proposalAuthor}
                            onChange={(e) => setProposalAuthor(e.target.value)}
                          />
                          <TextField
                            label="Proposal title"
                            value={proposalTitle}
                            onChange={(e) => setProposalTitle(e.target.value)}
                          />
                          <TextField
                            label="Note (optional)"
                            value={proposalNote}
                            onChange={(e) => setProposalNote(e.target.value)}
                          />
                          <TextArea
                            label='Operations JSON, e.g. [{"kind":"upsert","item":{"id":"x","content":{...}}},{"kind":"remove","itemId":"y"}]'
                            value={proposalOps}
                            onChange={(e) => setProposalOps(e.target.value)}
                            rows={4}
                          />
                          <Button variant="primary" onClick={() => void submitProposal()}>
                            Submit proposal
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2 border-t border-neutral-100 pt-3">
              <p className="text-xs font-medium text-neutral-600">Host a channel you published</p>
              <TextArea
                label="Channel manifest JSON"
                value={hostManifestText}
                onChange={(e) => setHostManifestText(e.target.value)}
                rows={5}
              />
              <Button variant="primary" onClick={() => void hostFromText()}>
                Host channel
              </Button>
            </div>
          </div>
        </Panel>
      )}

      {tab === 'collections' && (
        <Panel>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium">Channel collections</h3>
              <p className="text-xs text-neutral-500">
                A collection bundles channel manifests into one portable JSON: share one paste
                instead of many, and subscribe to every channel at once.
              </p>
            </div>
            {collections.length === 0 ? (
              <p className="text-sm text-neutral-500">No collections stored yet.</p>
            ) : (
              <ul className="space-y-2">
                {collections.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3"
                    data-testid={`collection-${c.id}`}
                  >
                    <div>
                      <p className="text-sm font-medium">{c.title}</p>
                      <p className="text-xs text-neutral-500">
                        {c.id} · by {c.ownerHandle} · {c.channelCount} channel(s)
                      </p>
                    </div>
                    <Button variant="secondary" onClick={() => void removeCollection(c.id)}>
                      Delete
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2 rounded-lg bg-neutral-50 p-3">
              <p className="text-xs font-medium text-neutral-600">
                New collection from hosted channels
              </p>
              <TextField
                label="Collection id"
                value={newCollectionId}
                onChange={(e) => setNewCollectionId(e.target.value)}
              />
              <TextField
                label="Title"
                value={newCollectionTitle}
                onChange={(e) => setNewCollectionTitle(e.target.value)}
              />
              <TextField
                label="Your handle"
                value={newCollectionHandle}
                onChange={(e) => setNewCollectionHandle(e.target.value)}
              />
              {hosted.length === 0 ? (
                <p className="text-xs text-neutral-500">Host channels on the Hosting tab first.</p>
              ) : (
                <ul className="space-y-1">
                  {hosted.map((h) => (
                    <li key={h.channelId} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={collectionPick.includes(h.channelId)}
                        onChange={(e) =>
                          setCollectionPick((prev) =>
                            e.target.checked
                              ? [...prev, h.channelId]
                              : prev.filter((x) => x !== h.channelId),
                          )
                        }
                        data-testid={`collection-pick-${h.channelId}`}
                      />
                      <span>
                        {h.title} <span className="text-neutral-400">v{h.currentVersion}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Button variant="primary" onClick={() => void saveNewCollection()}>
                Save collection
              </Button>
            </div>
            <div className="space-y-2 border-t border-neutral-100 pt-3">
              <p className="text-xs font-medium text-neutral-600">
                Import a collection JSON (subscribes to every channel)
              </p>
              <TextArea
                label="Collection JSON"
                value={collectionJson}
                onChange={(e) => setCollectionJson(e.target.value)}
                rows={5}
              />
              <Button variant="primary" onClick={() => void importCollection()}>
                Import and subscribe
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  )
}
