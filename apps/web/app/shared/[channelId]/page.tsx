'use client'

/**
 * Channel detail: renders a hosted channel (or a local subscription copy)
 * with its current items and full version history.
 */
import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { apiSend } from '@/lib/transport'
import { Badge, Callout, Panel, PageHeader } from '@/ui'

type Manifest = {
  channelId: string
  type: string
  title: string
  description: string
  authorHandle: string
  visibility: 'link' | 'invite'
  createdAt: string
  currentVersion: number
  versions: {
    version: number
    publishedAt: string
    changelog: string
    checksum: string
    items: { id: string; content: Record<string, unknown>; revision: number }[]
  }[]
}

type LocalSubscription = {
  manifest: Manifest
  localVersion: number
}

const STORAGE_KEY = 'lh-share-channels-v1'

function itemTitle(content: Record<string, unknown>): string {
  const v = content.front ?? content.title ?? content.name ?? content.question
  return typeof v === 'string' && v.length > 0 ? v.slice(0, 120) : '(untitled item)'
}

function itemPreview(content: Record<string, unknown>): string {
  return Object.entries(content)
    .filter(([, v]) => typeof v === 'string')
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${String(v).slice(0, 60)}`)
    .join(' · ')
}

export default function ChannelDetailPage({ params }: { params: Promise<{ channelId: string }> }) {
  const { channelId } = use(params)
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [source, setSource] = useState<'hosted' | 'subscription' | null>(null)
  const [localVersion, setLocalVersion] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await apiSend<{ ok: boolean; manifest?: Manifest }>(
          '/api/share-channels',
          'POST',
          { action: 'host-get', channelId },
        )
        if (!cancelled && res.ok && res.manifest) {
          setManifest(res.manifest)
          setSource('hosted')
          return
        }
      } catch {
        // fall through to local subscription lookup
      }
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        const subs = raw ? (JSON.parse(raw) as LocalSubscription[]) : []
        const sub = subs.find((s) => s.manifest.channelId === channelId)
        if (!cancelled && sub) {
          setManifest(sub.manifest)
          setLocalVersion(sub.localVersion)
          setSource('subscription')
          return
        }
      } catch {
        // ignore malformed storage
      }
      if (!cancelled) setError('This channel is neither hosted here nor in your subscriptions.')
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [channelId])

  if (error) {
    return (
      <div className="space-y-4">
        <PageHeader title="Channel not found" subtitle={channelId} />
        <Callout tone="warning">
          <p className="text-sm">{error}</p>
        </Callout>
        <Link href="/shared" className="text-sm text-indigo-600 underline">
          Back to Shared Materials
        </Link>
      </div>
    )
  }

  if (!manifest) {
    return (
      <div className="space-y-4">
        <PageHeader title="Loading channel" subtitle={channelId} />
        <p className="text-sm text-neutral-500">Loading…</p>
      </div>
    )
  }

  const current = manifest.versions.find((v) => v.version === manifest.currentVersion)

  return (
    <div className="space-y-4" data-testid="channel-detail">
      <PageHeader title={manifest.title} subtitle={manifest.description || manifest.channelId} />
      <div className="flex items-center gap-2">
        <Badge tone="accent">{manifest.type}</Badge>
        <Badge tone="neutral">{manifest.visibility}</Badge>
        <Badge tone="success">v{manifest.currentVersion}</Badge>
        {source === 'hosted' && <Badge tone="violet">hosted here</Badge>}
        {source === 'subscription' && localVersion !== null && (
          <Badge tone={localVersion < manifest.currentVersion ? 'warning' : 'neutral'}>
            local v{localVersion}
          </Badge>
        )}
        <span className="text-xs text-neutral-500">by {manifest.authorHandle}</span>
      </div>

      <Panel>
        <h3 className="text-sm font-medium">Current items ({current?.items.length ?? 0})</h3>
        <ul className="mt-2 space-y-1">
          {(current?.items ?? []).slice(0, 100).map((i) => (
            <li
              key={i.id}
              className="rounded-lg border border-neutral-100 p-2"
              data-testid={`channel-item-${i.id}`}
            >
              <p className="text-sm font-medium">{itemTitle(i.content)}</p>
              <p className="truncate text-xs text-neutral-500">{itemPreview(i.content)}</p>
              <p className="text-xs text-neutral-400">
                {i.id} · rev {i.revision}
              </p>
            </li>
          ))}
        </ul>
        {(current?.items.length ?? 0) > 100 && (
          <p className="mt-2 text-xs text-neutral-500">
            Showing the first 100 of {current!.items.length} items.
          </p>
        )}
      </Panel>

      <Panel>
        <h3 className="text-sm font-medium">Version history ({manifest.versions.length})</h3>
        <ul className="mt-2 space-y-2">
          {[...manifest.versions].reverse().map((v) => {
            const prev = manifest.versions[manifest.versions.indexOf(v) - 1]
            const prevIds = new Set((prev?.items ?? []).map((i) => i.id))
            const nextIds = new Set(v.items.map((i) => i.id))
            const added = v.items.filter((i) => !prevIds.has(i.id)).length
            const removed = prev ? prev.items.filter((i) => !nextIds.has(i.id)).length : 0
            const changed = v.items.filter((i) => {
              const p = prev?.items.find((x) => x.id === i.id)
              return p && JSON.stringify(p.content) !== JSON.stringify(i.content)
            }).length
            const expanded = expandedVersion === v.version
            return (
              <li key={v.version} className="rounded-lg border border-neutral-200 p-3">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 text-left"
                  onClick={() => setExpandedVersion(expanded ? null : v.version)}
                  data-testid={`version-toggle-${v.version}`}
                >
                  <div>
                    <p className="text-sm font-medium">
                      v{v.version}
                      {v.version === manifest.currentVersion ? ' (current)' : ''}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {v.publishedAt.slice(0, 10)} · {v.changelog || 'no changelog'} · +{added} / -
                      {removed} / ~{changed} · {v.items.length} items
                    </p>
                  </div>
                  <Badge tone="neutral">{v.checksum.slice(0, 8)}</Badge>
                </button>
                {expanded && (
                  <ul className="mt-2 space-y-1 border-t border-neutral-100 pt-2">
                    {v.items.slice(0, 50).map((i) => (
                      <li key={i.id} className="text-xs text-neutral-600">
                        <span className="font-medium">{itemTitle(i.content)}</span>{' '}
                        <span className="text-neutral-400">rev {i.revision}</span>
                      </li>
                    ))}
                    {v.items.length > 50 && (
                      <li className="text-xs text-neutral-400">…and {v.items.length - 50} more</li>
                    )}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </Panel>

      <Link href="/shared" className="text-sm text-indigo-600 underline">
        Back to Shared Materials
      </Link>
    </div>
  )
}
