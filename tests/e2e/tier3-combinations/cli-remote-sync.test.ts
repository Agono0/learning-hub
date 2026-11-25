// eslint-disable-next-line @typescript-eslint/triple-slash-reference -- ambient Workers types for the real LeagueRoom
/// <reference path="../../../apps/worker/src/worker.d.ts" />
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { leaguesRemoteCommands } from '../../../apps/cli/src/commands/leagues-remote'

/**
 * `leagues-remote sync` and `state` against the real worker LeagueRoom: the
 * CLI signs with the stored device key, the room verifies and applies, and
 * `state` prints what the room returned. The only stub is the network edge.
 */

const SERVER = 'https://league.example.dev'
const LEAGUE = 'lg-cli-sync-01'
const cmd = leaguesRemoteCommands[0]!

type Room = import('../../../apps/worker/src/index').LeagueRoom
let room: Room
let out: string[]
let err: string[]

function fakeState() {
  const store = new Map<string, unknown>()
  return {
    id: { toString: () => 'do_cli_sync' },
    storage: {
      get: async <T>(key: string) => store.get(key) as T | undefined,
      put: async (key: string, value: unknown) => void store.set(key, structuredClone(value)),
      delete: async (key: string) => store.delete(key),
    },
    blockConcurrencyWhile: async <T>(cb: () => Promise<T>) => cb(),
    acceptWebSocket: () => undefined,
    getWebSockets: () => [],
  } as never
}

beforeAll(async () => {
  const core = await import('@learning-hub/core')
  const db = await import('@learning-hub/db')
  const { LeagueRoom } = await import('../../../apps/worker/src/index')
  const pair = await core.generateIdentityKeyPair()
  db.updateOnlineIdentity({ mode: 'device_key', pubKey: pair.publicKey, privKey: pair.privateKey })
  room = new LeagueRoom(fakeState())
  const league = core.createLeague({ id: LEAGUE, title: 'CLI sync', seasonStart: '2026-03-02' })
  await room.fetch(
    new Request('http://do/init', { method: 'POST', body: JSON.stringify({ league }) }),
  )
})

beforeEach(() => {
  out = []
  err = []
  process.exitCode = 0
  process.env.LH_REMOTE_LEAGUES = '1'
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => void out.push(a.join(' ')))
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void err.push(a.join(' ')))
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname.replace(`/api/v1/leagues/${LEAGUE}`, '')
    return room.fetch(new Request(`http://do${path}`, init))
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  process.exitCode = 0
})

afterAll(() => {
  delete process.env.LH_REMOTE_LEAGUES
})

const run = (...args: string[]) => cmd.run(args)
const printed = () => out.join('\n')

describe('Tier 3: leagues-remote sync and state', () => {
  it('refuses network commands unless LH_REMOTE_LEAGUES=1, and sends nothing', async () => {
    delete process.env.LH_REMOTE_LEAGUES
    const spy = vi.fn()
    vi.stubGlobal('fetch', spy)
    await run('sync', SERVER, LEAGUE)
    await run('state', SERVER, LEAGUE)
    expect(err.join('\n')).toContain('LH_REMOTE_LEAGUES=1')
    expect(process.exitCode).toBe(1)
    expect(spy).not.toHaveBeenCalled()
  })

  it('asks for a link first', async () => {
    await run('sync', SERVER, 'lg-never-linked')
    expect(err.join('\n')).toContain('leagues-remote link')
    expect(process.exitCode).toBe(1)
  })

  it('syncs a queued join, then state shows the member', async () => {
    await run('link', SERVER, LEAGUE)
    await run('enqueue', SERVER, LEAGUE, 'join', 'Ada')
    out.length = 0
    await run('sync', SERVER, LEAGUE)
    expect(printed()).toContain('Sent 1 item. 0 pending, 0 refused')
    expect(process.exitCode).toBe(0)
    out.length = 0
    await run('state', SERVER, LEAGUE)
    const text = printed()
    expect(text).toContain('CLI sync')
    expect(text).toContain('Ada')
    expect(text).toContain('Listed alphabetically. Activity points are not a ranking.')
    expect(/leaderboard|rank \d/i.test(text)).toBe(false)
  })

  it('reports a refusal from the room and keeps it visible in the queue', async () => {
    await run('enqueue', SERVER, LEAGUE, 'remove-member', 'usr_nobody')
    out.length = 0
    await run('sync', SERVER, LEAGUE)
    expect(printed()).toMatch(/0 pending, 1 refused/)
    expect(printed()).toContain('leagues-remote queue')
    out.length = 0
    await run('queue', SERVER, LEAGUE)
    expect(printed()).toContain('remove-member')
    expect(printed()).toContain('target_not_member')
  })

  it('an empty queue syncs cleanly', async () => {
    out.length = 0
    await run('sync', SERVER, LEAGUE)
    expect(printed()).toContain('Sent 0 items.')
  })

  it('survives an unreachable server with a plain message, not a stack trace', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED')
    })
    await run('state', SERVER, LEAGUE)
    expect(err.join('\n')).toContain('Could not reach the league server.')
    expect(process.exitCode).toBe(1)
  })

  it('a queued item stays pending when the server is down', async () => {
    await run('enqueue', SERVER, LEAGUE, 'rename', 'Ada L')
    vi.stubGlobal('fetch', async () => {
      throw new Error('ECONNREFUSED')
    })
    out.length = 0
    await run('sync', SERVER, LEAGUE)
    expect(printed()).toMatch(/1 pending/)
    expect(printed()).toContain('Run sync again')
  })
})
