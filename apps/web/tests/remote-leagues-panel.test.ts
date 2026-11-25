import React from 'react'
import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  RemoteLeaguesView,
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
