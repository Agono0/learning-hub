import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { parseRemoteRoster } from '../src/lib/remote-roster'
import {
  RemoteLeaguesView,
  RemoteLinkActions,
  RemoteRosterSection,
  RemoteRosterView,
  describeLinkStatus,
  describeSyncedAt,
  type RemoteLeaguesState,
} from '../src/components/RemoteLeaguesPanel'

const render = (state: RemoteLeaguesState | null) =>
  renderToString(React.createElement(RemoteLeaguesView, { state }))

const link = {
  serverUrl: 'https://league.example',
  remoteLeagueId: 'lg-1',
  nextSeq: 4,
  lastStatus: 'ok',
  lastSyncedAt: '2026-03-02T10:00:00.000Z',
}

describe('RemoteLeaguesView', () => {
  it('renders nothing when the API says disabled or has not answered', () => {
    expect(render(null)).toBe('')
    expect(render({ enabled: false, links: [link] })).toBe('')
  })

  it('shows the practice-only framing and an empty state', () => {
    const html = render({ enabled: true, links: [] })
    expect(html).toContain('remote-leagues-panel')
    expect(html).toContain('Practice only')
    expect(html).toContain('local activity scoring')
    expect(html).toContain('remote-leagues-empty')
  })

  it('lists links with status and never claims a rank or competitive readiness', () => {
    const html = render({
      enabled: true,
      links: [link, { ...link, remoteLeagueId: 'lg-2', lastStatus: null, lastSyncedAt: null }],
    })
    expect(html.match(/data-testid="remote-league-link"/g)).toHaveLength(2)
    expect(html).toContain('Up to date')
    expect(html).toContain('Not synced yet')
    expect(html.replace(/<!-- -->/g, '')).toContain('Last synced 2026-03-02 10:00 UTC')
    expect(/leaderboard|competitive-ready/i.test(html)).toBe(false)
  })

  it('does not leak keys even if extra fields arrive', () => {
    const html = render({
      enabled: true,
      links: [{ ...link, privateKey: 'SECRET-KEY' } as never],
    })
    expect(html).not.toContain('SECRET-KEY')
  })
})

describe('status helpers', () => {
  it('maps known codes to plain language', () => {
    expect(describeLinkStatus('bad_seq')).toContain('sequence')
    expect(describeLinkStatus('bad_timestamp')).toContain('clock')
    expect(describeLinkStatus('network')).toContain('retry')
    expect(describeLinkStatus('weird')).toBe('Last result: weird')
    expect(describeLinkStatus(undefined)).toBe('Not synced yet')
  })

  it('formats timestamps defensively', () => {
    expect(describeSyncedAt(null)).toBe('never')
    expect(describeSyncedAt('not a date')).toBe('never')
    expect(describeSyncedAt(Date.parse('2026-03-02T10:05:00Z'))).toBe('2026-03-02 10:05 UTC')
  })
})

describe('RemoteLinkActions', () => {
  const html = renderToString(
    React.createElement(RemoteLinkActions, {
      target: { serverUrl: 'https://league.example', remoteLeagueId: 'lg-1' },
    }),
  )

  it('renders every membership control with a stable test id', () => {
    for (const id of [
      'remote-alias',
      'remote-rename',
      'remote-invite-code',
      'remote-join',
      'remote-invite-uses',
      'remote-invite-hours',
      'remote-invite-new',
      'remote-revoke-digest',
      'remote-revoke',
      'remote-leave',
      'remote-mod-handle',
      'remote-remove-member',
      'remote-unblock-member',
      'remote-transfer-founder',
    ]) {
      expect(html).toContain(`data-testid="${id}"`)
    }
  })

  it('starts calm: no code shown, no leave confirmation, no status message', () => {
    expect(html).not.toContain('remote-shown-code')
    expect(html).not.toContain('remote-leave-confirm')
    expect(html).not.toContain('remote-message')
    expect(html).toContain('Leave league')
  })

  it('keeps secrets out of autofill and defaults the invite to one use for 24 hours', () => {
    expect(html).toMatch(
      /data-testid="remote-invite-code"[^>]*autoComplete="off"|autoComplete="off"[^>]*data-testid="remote-invite-code"/i,
    )
    expect(html).toMatch(
      /value="1"[^>]*data-testid="remote-invite-uses"|data-testid="remote-invite-uses"[^>]*value="1"/,
    )
    expect(html).toMatch(
      /value="24"[^>]*data-testid="remote-invite-hours"|data-testid="remote-invite-hours"[^>]*value="24"/,
    )
  })

  it('is part of every linked league row in the panel', () => {
    const panel = render({
      enabled: true,
      links: [link, { ...link, remoteLeagueId: 'lg-2' }],
    })
    expect(panel.match(/data-testid="remote-leave"/g)).toHaveLength(2)
  })
})

describe('RemoteRosterView', () => {
  const roster = parseRemoteRoster({
    league: {
      title: 'Friendly league',
      currentRound: 1,
      players: [
        { handle: 'usr_a', seasonPoints: 4, duelsWon: 1, duelsLost: 0 },
        { handle: 'usr_b', seasonPoints: 0, duelsWon: 0, duelsLost: 0 },
      ],
    },
    aliases: { usr_a: 'Zed <b>x</b>', usr_b: 'Amy' },
    inviteOnly: true,
    liveInvites: 1,
  })

  it('renders nothing without a roster', () => {
    expect(renderToString(React.createElement(RemoteRosterView, { roster: null }))).toBe('')
  })

  it('shows policy, alphabetical rows and the not-a-ranking note', () => {
    const html = renderToString(React.createElement(RemoteRosterView, { roster }))
    expect(html).toContain('Invite only')
    expect(html).toContain('1 live invite')
    expect(html.indexOf('Amy')).toBeLessThan(html.indexOf('Zed'))
    expect(html).toContain('not a ranking')
    expect(html.match(/data-testid="remote-roster-row"/g)).toHaveLength(2)
  })

  it('escapes hostile names instead of injecting markup', () => {
    const html = renderToString(React.createElement(RemoteRosterView, { roster }))
    expect(html).not.toContain('<b>x</b>')
    expect(html).toContain('&lt;b&gt;')
  })

  it('shows the empty state for a league with no members', () => {
    const empty = parseRemoteRoster({
      league: { title: 'Empty', currentRound: 0, players: [] },
    })
    const html = renderToString(React.createElement(RemoteRosterView, { roster: empty }))
    expect(html).toContain('Open to join')
    expect(html).toContain('remote-roster-empty')
  })

  it('the section starts with a refresh button and no roster', () => {
    const html = renderToString(
      React.createElement(RemoteRosterSection, {
        target: { serverUrl: 'https://league.example', remoteLeagueId: 'lg-1' },
      }),
    )
    expect(html).toContain('remote-roster-refresh')
    expect(html).not.toContain('data-testid="remote-roster"')
  })
})

describe('RemoteRosterView moderation', () => {
  const base = {
    league: {
      title: 'Friendly league',
      currentRound: 1,
      players: [{ handle: 'usr_a', seasonPoints: 0, duelsWon: 0, duelsLost: 0 }],
    },
    aliases: { usr_a: 'Amy' },
  }
  const html = (extra: Record<string, unknown>) =>
    renderToString(
      React.createElement(RemoteRosterView, { roster: parseRemoteRoster({ ...base, ...extra }) }),
    ).replace(/<!-- -->/g, '')

  it('shows no moderation section when nothing happened', () => {
    expect(html({})).not.toContain('remote-moderation')
  })

  it('lists newest first with a UTC time, the actor and the blocked count', () => {
    const out = html({
      blocked: ['usr_gone'],
      modLog: [
        {
          at: Date.parse('2026-03-02T10:00:00Z'),
          by: 'usr_a',
          action: 'remove',
          target: 'usr_gone',
        },
        { at: Date.parse('2026-03-02T11:30:00Z'), by: 'usr_a', action: 'unblock', target: 'usr_x' },
      ],
    })
    expect(out).toContain('Moderation · 1 blocked')
    const rows = out.match(/data-testid="remote-moderation-row">[^<]*/g) ?? []
    expect(rows).toHaveLength(2)
    expect(rows[0]).toContain('2026-03-02 11:30 UTC · Amy unblocked a former member')
    expect(rows[1]).toContain('2026-03-02 10:00 UTC · Amy removed a former member')
  })

  it('escapes a hostile alias in the log', () => {
    const out = html({
      aliases: { usr_a: 'Amy', usr_gone: '<img src=x onerror=alert(1)>' },
      modLog: [{ at: 1, by: 'usr_a', action: 'remove', target: 'usr_gone' }],
    })
    expect(out).not.toContain('<img')
    expect(out).toContain('&lt;img')
  })

  it('labels a founder transfer in the log', () => {
    const out = html({
      modLog: [{ at: 1, by: 'usr_a', action: 'transfer', target: 'usr_a' }],
    })
    expect(out).toContain('Amy made founder Amy')
  })

  it('never uses ranking or ban language', () => {
    const out = html({
      modLog: [{ at: 1, by: 'usr_a', action: 'remove', target: 'usr_gone' }],
    })
    expect(/leaderboard|banned|rank \d/i.test(out)).toBe(false)
  })
})
