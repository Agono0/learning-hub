'use client'

/**
 * Remote leagues panel. INACTIVE by default: it renders nothing unless the
 * API reports `enabled: true` (LH_REMOTE_LEAGUES=1 on the server). Remote
 * leagues are local/friendly practice. Points are local activity scoring,
 * not a verified skill measure, and this panel never shows a rank.
 */
import React, { useEffect, useState } from 'react'
import { Badge, Callout, Panel } from '@/ui'
import { apiGet } from '@/lib/transport'

export interface RemoteLinkView {
  serverUrl: string
  remoteLeagueId: string
  nextSeq: number
  lastStatus: string | null
  lastSyncedAt: string | number | null
}

export interface RemoteLeaguesState {
  enabled: boolean
  links: RemoteLinkView[]
}

/** Plain-language label for a stored last-status code. */
export function describeLinkStatus(status: string | null | undefined): string {
  if (!status) return 'Not synced yet'
  if (status === 'ok' || status === 'accepted') return 'Up to date'
  if (status === 'bad_seq') return 'Catching up on sequence numbers'
  if (status === 'bad_timestamp') return 'Device clock is off'
  if (status === 'bad_signature') return 'Signature was refused'
  if (status === 'unreachable' || status === 'network') return 'Server unreachable, will retry'
  return `Last result: ${status}`
}

export function describeSyncedAt(at: string | number | null | undefined): string {
  if (at === null || at === undefined || at === '') return 'never'
  const ms = typeof at === 'number' ? at : Date.parse(at)
  if (!Number.isFinite(ms)) return 'never'
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}

export function RemoteLeaguesView({ state }: { state: RemoteLeaguesState | null }) {
  if (!state || !state.enabled) return null
  return (
    <Panel
      title="Remote leagues"
      data-testid="remote-leagues-panel"
      actions={<Badge tone="neutral">Practice only</Badge>}
    >
      <Callout tone="neutral">
        Friendly practice with a shared room. Points are local activity scoring. Nothing here
        verifies skill or ranks you.
      </Callout>
      {state.links.length === 0 ? (
        <p className="text-sm opacity-80" data-testid="remote-leagues-empty">
          No remote leagues linked. Use the CLI to link one: leagues-remote link.
        </p>
      ) : (
        <ul className="space-y-2" data-testid="remote-leagues-list">
          {state.links.map((l) => (
            <li
              key={`${l.serverUrl}|${l.remoteLeagueId}`}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
              data-testid="remote-league-link"
            >
              <span className="font-medium">{l.remoteLeagueId}</span>
              <span className="opacity-70">{l.serverUrl}</span>
              <span>{describeLinkStatus(l.lastStatus)}</span>
              <span className="opacity-70">Last synced {describeSyncedAt(l.lastSyncedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Container: one GET on mount; any failure leaves the panel hidden. */
export function RemoteLeaguesPanel() {
  const [state, setState] = useState<RemoteLeaguesState | null>(null)
  useEffect(() => {
    let live = true
    apiGet<RemoteLeaguesState>('/api/leagues/remote')
      .then((r) => {
        if (live) setState(r)
      })
      .catch(() => {
        if (live) setState(null)
      })
    return () => {
      live = false
    }
  }, [])
  return <RemoteLeaguesView state={state} />
}
