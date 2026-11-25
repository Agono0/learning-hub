'use client'

/**
 * ShareChannelsPanel: publish, subscribe and update shared material channels
 * (lh-share/v2). Engine calls go through /api/share-channels; subscriptions
 * and local item copies persist in localStorage (manual mode).
 */
import { useEffect, useState } from 'react'
import { apiSend } from '@/lib/transport'
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
}

type MergeResult = {
  addedCount: number
  updatedCount: number
  removedCount: number
  conflictCount: number
  conflicts: string[]
  newVersion: number
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
  type PanelTab = 'subscriptions' | 'publish' | 'subscribe' | 'update'
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

  // Update form
  const [updateText, setUpdateText] = useState('')
  const [lastMerge, setLastMerge] = useState<MergeResult | null>(null)

  useEffect(() => {
    setSubs(loadSubscriptions())
  }, [])

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
      { manifest: parsed, localItems, localVersion: parsed.currentVersion },
    ]
    setSubs(next)
    saveSubscriptions(next)
    setNotice(`Subscribed to ${parsed.title} at version ${parsed.currentVersion}.`)
    setManifestText('')
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
                <li
                  key={s.manifest.channelId}
                  className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{s.manifest.title}</p>
                    <p className="text-xs text-neutral-500">
                      {s.manifest.authorHandle} · {s.localItems.length} items · local v
                      {s.localVersion}
                    </p>
                  </div>
                  <Badge tone="neutral">{s.manifest.visibility}</Badge>
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
    </div>
  )
}
