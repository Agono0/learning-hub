'use client'

/**
 * Remote leagues panel. INACTIVE by default: it renders nothing unless the
 * API reports `enabled: true` (LH_REMOTE_LEAGUES=1 on the server). Remote
 * leagues are local/friendly practice. Points are local activity scoring,
 * not a verified skill measure, and this panel never shows a rank.
 */
import React, { useEffect, useState } from 'react'
import { Badge, Button, Callout, Panel, TextField } from '@/ui'
import { apiGet, apiSend } from '@/lib/transport'
import { parseRemoteRoster, type RemoteRoster } from '@/lib/remote-roster'
import {
  buildMembershipRequest,
  buildNewInvite,
  numberOr,
  submitMembership,
  type LinkTarget,
  type RemoteSend,
} from '@/lib/remote-leagues-actions'

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

/** Read-only roster of one remote league: alphabetical, never ranked. */
export function RemoteRosterView({ roster }: { roster: RemoteRoster | null }) {
  if (!roster) return null
  return (
    <div className="space-y-1 text-sm" data-testid="remote-roster">
      <p className="font-medium" data-testid="remote-roster-title">
        {roster.title} · round {roster.round}
      </p>
      <p className="opacity-70" data-testid="remote-roster-policy">
        {roster.inviteOnly
          ? `Invite only · ${roster.liveInvites} live invite${roster.liveInvites === 1 ? '' : 's'}`
          : 'Open to join'}
      </p>
      {roster.members.length === 0 ? (
        <p className="opacity-70" data-testid="remote-roster-empty">
          No members yet.
        </p>
      ) : (
        <ul className="space-y-0.5" data-testid="remote-roster-list">
          {roster.members.map((m, i) => (
            <li
              key={`${m.name}-${i}`}
              className="flex flex-wrap gap-2"
              data-testid="remote-roster-row"
            >
              <span className="font-medium">{m.name}</span>
              <span className="opacity-70">
                {m.activityPoints} activity points · {m.duels} duel{m.duels === 1 ? '' : 's'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {roster.moderation.length > 0 && (
        <div data-testid="remote-moderation">
          <p className="font-medium">Moderation · {roster.blockedCount} blocked</p>
          <ul className="space-y-0.5 text-xs opacity-80" data-testid="remote-moderation-list">
            {roster.moderation.map((e, i) => (
              <li key={`${e.at}-${i}`} data-testid="remote-moderation-row">
                {new Date(e.at).toISOString().slice(0, 16).replace('T', ' ')} UTC · {e.by}{' '}
                {e.action === 'remove'
                  ? 'removed'
                  : e.action === 'unblock'
                    ? 'unblocked'
                    : 'made founder'}{' '}
                {e.target}
              </li>
            ))}
          </ul>
        </div>
      )}
      {roster.hidden > 0 && (
        <p className="opacity-70" data-testid="remote-roster-hidden">
          {roster.hidden} more not shown.
        </p>
      )}
      <p className="text-xs opacity-60">
        Listed alphabetically. Activity points are not a ranking.
      </p>
    </div>
  )
}

/** Fetches the league state through the route and shows the roster. */
export function RemoteRosterSection({
  target,
  transport = send,
}: {
  target: LinkTarget
  transport?: RemoteSend
}) {
  const [roster, setRoster] = useState<RemoteRoster | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  async function refresh() {
    setBusy(true)
    try {
      const raw = await transport<unknown>('/api/leagues/remote', 'POST', {
        action: 'state',
        ...target,
      })
      const parsed = parseRemoteRoster(raw)
      setRoster(parsed)
      setNote(parsed ? null : 'The league did not return a readable roster.')
    } catch (err) {
      setRoster(null)
      setNote(err instanceof Error && err.message ? err.message : 'Could not reach the league.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        disabled={busy}
        data-testid="remote-roster-refresh"
        onClick={refresh}
      >
        Refresh roster
      </Button>
      {note && (
        <span role="status" className="text-sm" data-testid="remote-roster-note">
          {note}
        </span>
      )}
      <RemoteRosterView roster={roster} />
    </div>
  )
}

const send: RemoteSend = (path, method, body) => apiSend(path, method, body)

/**
 * Membership controls for one linked league. Every change is queued and then
 * pushed; nothing here shows a rank. A new invite code is shown once and is
 * not stored anywhere in the app.
 */
export function RemoteLinkActions({
  target,
  run = submitMembership,
  transport = send,
}: {
  target: LinkTarget
  run?: typeof submitMembership
  transport?: RemoteSend
}) {
  const [alias, setAlias] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [uses, setUses] = useState('1')
  const [hours, setHours] = useState('24')
  const [revokeDigest, setRevokeDigest] = useState('')
  const [modHandle, setModHandle] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [shownCode, setShownCode] = useState<string | null>(null)

  async function go(work: () => Promise<{ ok: boolean; message: string }>) {
    setBusy(true)
    try {
      const r = await work()
      setMessage(r.message)
      return r
    } finally {
      setBusy(false)
    }
  }

  const testid = (name: string) => `remote-${name}`
  return (
    <div className="space-y-2 border-t border-neutral-200 pt-2 dark:border-neutral-700">
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          label="Your name in this league"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          maxLength={40}
          data-testid={testid('alias')}
        />
        <Button
          variant="secondary"
          disabled={busy}
          data-testid={testid('rename')}
          onClick={() =>
            go(() => run(buildMembershipRequest(target, { kind: 'rename', alias }), transport))
          }
        >
          Rename
        </Button>
        <TextField
          label="Invite code (if required)"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          autoComplete="off"
          data-testid={testid('invite-code')}
        />
        <Button
          variant="secondary"
          disabled={busy}
          data-testid={testid('join')}
          onClick={() =>
            go(() =>
              run(
                buildMembershipRequest(target, { kind: 'join', alias, invite: inviteCode }),
                transport,
              ),
            ).then(() => setInviteCode(''))
          }
        >
          Join
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          label="Uses"
          inputMode="numeric"
          value={uses}
          onChange={(e) => setUses(e.target.value)}
          data-testid={testid('invite-uses')}
        />
        <TextField
          label="Hours valid"
          inputMode="decimal"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          data-testid={testid('invite-hours')}
        />
        <Button
          variant="secondary"
          disabled={busy}
          data-testid={testid('invite-new')}
          onClick={async () => {
            const inv = await buildNewInvite(target, {
              uses: numberOr(uses, 1),
              hours: numberOr(hours, 24),
            })
            const r = await go(() => run(inv.request, transport))
            setShownCode(r.ok ? inv.code : null)
          }}
        >
          New invite
        </Button>
        <TextField
          label="Revoke invite (digest)"
          value={revokeDigest}
          onChange={(e) => setRevokeDigest(e.target.value)}
          autoComplete="off"
          data-testid={testid('revoke-digest')}
        />
        <Button
          variant="secondary"
          disabled={busy}
          data-testid={testid('revoke')}
          onClick={() =>
            go(() =>
              run(
                buildMembershipRequest(target, { kind: 'revoke', digest: revokeDigest }),
                transport,
              ),
            )
          }
        >
          Revoke
        </Button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          label="Member handle (founder only)"
          value={modHandle}
          onChange={(e) => setModHandle(e.target.value)}
          autoComplete="off"
          data-testid={testid('mod-handle')}
        />
        <Button
          variant="secondary"
          disabled={busy}
          data-testid={testid('remove-member')}
          onClick={() =>
            go(() =>
              run(buildMembershipRequest(target, { kind: 'remove', handle: modHandle }), transport),
            )
          }
        >
          Remove member
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          data-testid={testid('unblock-member')}
          onClick={() =>
            go(() =>
              run(
                buildMembershipRequest(target, { kind: 'unblock', handle: modHandle }),
                transport,
              ),
            )
          }
        >
          Unblock
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          data-testid={testid('transfer-founder')}
          onClick={() =>
            go(() =>
              run(
                buildMembershipRequest(target, { kind: 'transfer', handle: modHandle }),
                transport,
              ),
            )
          }
        >
          Make founder
        </Button>
      </div>
      {shownCode && (
        <Callout tone="warning" title="Your new invite code">
          <code data-testid={testid('shown-code')}>{shownCode}</code>
          <p className="text-xs">
            Shown once and not saved. Share it only with the person you invite. Anyone with it can
            join until it expires, is used up or is revoked.
          </p>
        </Callout>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {confirmLeave ? (
          <>
            <Button
              variant="danger"
              disabled={busy}
              data-testid={testid('leave-confirm')}
              onClick={() =>
                go(() => run(buildMembershipRequest(target, { kind: 'leave' }), transport)).then(
                  () => setConfirmLeave(false),
                )
              }
            >
              Confirm leave
            </Button>
            <Button variant="secondary" onClick={() => setConfirmLeave(false)}>
              Keep me in
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            data-testid={testid('leave')}
            onClick={() => setConfirmLeave(true)}
          >
            Leave league
          </Button>
        )}
        {message && (
          <span role="status" className="text-sm" data-testid={testid('message')}>
            {message}
          </span>
        )}
      </div>
    </div>
  )
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
              <div className="basis-full">
                <RemoteRosterSection
                  target={{ serverUrl: l.serverUrl, remoteLeagueId: l.remoteLeagueId }}
                />
                <RemoteLinkActions
                  target={{ serverUrl: l.serverUrl, remoteLeagueId: l.remoteLeagueId }}
                />
              </div>
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
