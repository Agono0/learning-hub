import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { McpTestClient } from '../helpers/mcp-client'
import { getActiveDbPath } from '../helpers/setup'

const SERVER = 'https://league.example.dev'
const LEAGUE = 'lg-mcp-remote-01'
const DIGEST = 'ab'.repeat(32)

type Queued = {
  ok: boolean
  error?: string
  itemId?: string
  sent?: boolean
  queue?: { pending: number }
}

describe('Tier 1: MCP remote league membership tools', () => {
  let client: McpTestClient

  beforeAll(async () => {
    client = new McpTestClient(getActiveDbPath())
    await client.start()
  }, 40000)

  afterAll(() => {
    client?.stop()
  })

  it('registers the membership and read tools, and no invite-code tool', async () => {
    const names = (await client.listTools()).map((t) => t.name)
    for (const n of [
      'remote_league_links',
      'remote_league_queue',
      'remote_league_rename',
      'remote_league_leave',
      'remote_league_invite_revoke',
      'remote_league_invite_policy',
    ]) {
      expect(names).toContain(n)
    }
    expect(names.filter((n) => n.includes('invite_new') || n.includes('invite_create'))).toEqual([])
  })

  it('queues rename, leave, revoke and policy changes without sending anything', async () => {
    const target = { serverUrl: SERVER, remoteLeagueId: LEAGUE }
    const calls: Array<[string, Record<string, unknown>]> = [
      ['remote_league_rename', { ...target, alias: '  Ada  ' }],
      ['remote_league_invite_revoke', { ...target, digest: DIGEST }],
      ['remote_league_invite_policy', { ...target, required: true }],
      ['remote_league_leave', target],
    ]
    let pending = 0
    for (const [name, args] of calls) {
      const res = await client.callTool<Queued>(name, args)
      expect(res.ok).toBe(true)
      expect(res.sent).toBe(false)
      expect(res.queue!.pending).toBeGreaterThan(pending)
      pending = res.queue!.pending
    }
    const q = await client.callTool<{ ok: boolean; items: number; summary: { pending: number } }>(
      'remote_league_queue',
      target,
    )
    expect(q.ok).toBe(true)
    expect(q.items).toBe(4)
    expect(q.summary.pending).toBe(4)
  })

  it('shows the link with its queue counts and no key material', async () => {
    const res = await client.callTool<{ links: Array<{ remoteLeagueId: string }> }>(
      'remote_league_links',
      {},
    )
    expect(res.links.map((l) => l.remoteLeagueId)).toContain(LEAGUE)
    expect(JSON.stringify(res)).not.toMatch(/priv|secret/i)
  })

  it('refuses a bad server url or league id instead of throwing', async () => {
    const bad = await client.callTool<Queued>('remote_league_leave', {
      serverUrl: 'not a url',
      remoteLeagueId: LEAGUE,
    })
    expect(bad.ok).toBe(false)
    expect(typeof bad.error).toBe('string')
    const badId = await client.callTool<Queued>('remote_league_leave', {
      serverUrl: SERVER,
      remoteLeagueId: 'X',
    })
    expect(badId.ok).toBe(false)
  })
})
