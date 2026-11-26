/**
 * Channel Updates Banner — surfaces pending channel updates on /shared.
 *
 * For every subscription that recorded a host, the banner offers a manual
 * "check" (and checks once on mount): the web handler fetches the remote
 * manifest, and when the publisher is ahead the learner sees exactly which
 * versions wait, with their changelogs, and applies them through the same
 * learner-state-preserving merge the CLI/MCP/server hosts use. Applying
 * never touches notes, scheduling state or local edits; conflicts are
 * reported, not hidden.
 */
import {
  parseStoredSubscriptions,
  writeStoredSubscriptions,
} from '@/lib/channel-subscriptions-storage'
import { useCallback, useEffect, useState } from 'react'

import { apiSend } from '@/lib/transport'
import { Badge, Button, Callout, Panel } from '@/ui'

type Manifest = {
  channelId: string
  title: string
  currentVersion: number
  versions: { version: number; changelog: string }[]
}

type SubscriptionRecord = {
  manifest: Manifest
  localItems: unknown[]
  localVersion: number
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

const STORAGE_KEY = 'lh-share-channels-v1'

function loadSubscriptions(): SubscriptionRecord[] {
  try {
    return parseStoredSubscriptions<SubscriptionRecord>(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    return []
  }
}

function saveSubscriptions(subs: SubscriptionRecord[]): void {
  writeStoredSubscriptions(STORAGE_KEY, subs)
}

async function post<T>(body: unknown): Promise<{ ok: boolean; data: T }> {
  try {
    const data = await apiSend<T>('/api/share-channels', 'POST', body)
    return { ok: true, data }
  } catch (err) {
    return { ok: false, data: { error: err instanceof Error ? err.message : String(err) } as T }
  }
}

type ChannelState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'current' }
  | { kind: 'updates'; manifest: Manifest; pendingCount: number }
  | { kind: 'applying' }
  | { kind: 'applied'; merge: MergeResult }
  | { kind: 'error'; message: string }

export function ChannelUpdatesBanner() {
  const [subs, setSubs] = useState<SubscriptionRecord[]>([])
  const [states, setStates] = useState<Record<string, ChannelState>>({})

  useEffect(() => {
    setSubs(loadSubscriptions())
  }, [])

  const setState = (channelId: string, state: ChannelState) =>
    setStates((prev) => ({ ...prev, [channelId]: state }))

  const check = useCallback(async (sub: SubscriptionRecord) => {
    if (!sub.hostBaseUrl) return
    setState(sub.manifest.channelId, { kind: 'checking' })
    const { ok, data } = await post<{ manifest: Manifest | null; error?: string }>({
      action: 'fetch-manifest',
      hostBaseUrl: sub.hostBaseUrl,
      channelId: sub.manifest.channelId,
      ...(sub.inviteToken ? { inviteToken: sub.inviteToken } : {}),
    })
    if (!ok) {
      setState(sub.manifest.channelId, {
        kind: 'error',
        message: data.error ?? 'the host could not be reached',
      })
      return
    }
    const manifest = data.manifest as Manifest | null
    if (!manifest || manifest.currentVersion <= sub.localVersion) {
      setState(sub.manifest.channelId, { kind: 'current' })
      return
    }
    setState(sub.manifest.channelId, {
      kind: 'updates',
      manifest,
      pendingCount: manifest.currentVersion - sub.localVersion,
    })
  }, [])

  // Check every hosted subscription once per roster load.
  const [checkedRoster, setCheckedRoster] = useState<string>('')
  useEffect(() => {
    const rosterKey = subs
      .filter((s) => s.hostBaseUrl)
      .map((s) => `${s.manifest.channelId}@${s.localVersion}`)
      .join('|')
    if (!rosterKey || rosterKey === checkedRoster) return
    setCheckedRoster(rosterKey)
    for (const sub of subs) {
      if (sub.hostBaseUrl) void check(sub)
    }
  }, [subs, checkedRoster, check])

  async function apply(sub: SubscriptionRecord, manifest: Manifest) {
    setState(sub.manifest.channelId, { kind: 'applying' })
    const { ok, data } = await post<{ items: unknown[]; result: MergeResult; error?: string }>({
      action: 'apply-all',
      channelId: sub.manifest.channelId,
      localVersion: sub.localVersion,
      localItems: sub.localItems,
      manifest,
    })
    if (!ok) {
      setState(sub.manifest.channelId, {
        kind: 'error',
        message: data.error ?? 'the update could not be applied',
      })
      return
    }
    const merge = data.result as MergeResult
    const next = loadSubscriptions().map((s) =>
      s.manifest.channelId === sub.manifest.channelId
        ? { ...s, manifest, localItems: data.items, localVersion: merge.newVersion }
        : s,
    )
    saveSubscriptions(next)
    setSubs(next)
    setState(sub.manifest.channelId, { kind: 'applied', merge })
  }

  const hosted = subs.filter((s) => s.hostBaseUrl)
  if (hosted.length === 0) return null

  return (
    <Panel>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Channel updates</h2>
        <Badge className="bg-neutral-500/10 text-neutral-600 dark:text-neutral-300">
          {hosted.length} hosted
        </Badge>
      </div>
      <ul className="mt-3 space-y-2" data-testid="channel-updates-list">
        {hosted.map((sub) => {
          const id = sub.manifest.channelId
          const state = states[id] ?? { kind: 'idle' as const }
          return (
            <li
              key={id}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-neutral-200 p-3 text-sm dark:border-neutral-700"
            >
              <span className="font-medium">{sub.manifest.title}</span>
              <span className="text-neutral-500">v{sub.localVersion}</span>
              {state.kind === 'checking' && <span className="text-neutral-500">Checking…</span>}
              {state.kind === 'current' && (
                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  Up to date
                </Badge>
              )}
              {state.kind === 'updates' && (
                <>
                  <Badge className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                    {state.pendingCount} update{state.pendingCount === 1 ? '' : 's'} available
                  </Badge>
                  <span className="w-full text-xs text-neutral-500">
                    {state.manifest.versions
                      .filter((v) => v.version > sub.localVersion)
                      .map((v) => `v${v.version}${v.changelog ? `: ${v.changelog}` : ''}`)
                      .join(' · ')}
                  </span>
                  <Button className="min-h-11" onClick={() => void apply(sub, state.manifest)}>
                    Apply updates
                  </Button>
                </>
              )}
              {state.kind === 'applying' && <span className="text-neutral-500">Applying…</span>}
              {state.kind === 'applied' && (
                <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                  Updated to v{state.merge.newVersion} ({state.merge.addedCount} added,{' '}
                  {state.merge.updatedCount} updated
                  {state.merge.conflictCount > 0
                    ? `, ${state.merge.conflictCount} conflict${state.merge.conflictCount === 1 ? '' : 's'} kept yours`
                    : ''}
                  )
                </Badge>
              )}
              {state.kind === 'error' && <Callout>Sync failed: {state.message}</Callout>}
              {(state.kind === 'current' || state.kind === 'error' || state.kind === 'applied') && (
                <Button variant="secondary" className="min-h-11" onClick={() => void check(sub)}>
                  Check again
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}
